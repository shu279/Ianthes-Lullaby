"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  Group,
  LoopRepeat,
  KeyframeTrack,
  Object3D,
  Quaternion,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { VRM, VRMLoaderPlugin } from "@pixiv/three-vrm";

export type AnimationStatus = {
  vrmLoaded: boolean;
  animationLoaded: boolean;
  clipName: string;
  clipDuration: number;
  trackCount: number;
  isPlaying: boolean;
  hipsPosition?: [number, number, number];
  hipsRotation?: [number, number, number, number];
};

export type AnimationMode = "normalized" | "rotation" | "rotationWithRoot" | "raw";

type VRMCharacterProps = {
  modelUrl: string;
  animationUrl: string;
  animationMode: AnimationMode;
  playNonce: number;
  paused: boolean;
  onStatus: (status: AnimationStatus) => void;
  onError: (message: string | null) => void;
};

type LoadedState = {
  vrm: VRM;
  mixer: AnimationMixer;
  action: AnimationAction;
  clip: AnimationClip;
  sourceClip: AnimationClip;
};

function getTrackTarget(trackName: string) {
  const separatorIndex = trackName.lastIndexOf(".");

  if (separatorIndex === -1) {
    return { nodeName: trackName, property: "" };
  }

  return {
    nodeName: trackName.slice(0, separatorIndex),
    property: trackName.slice(separatorIndex + 1),
  };
}

function convertHipsPositionTrack(track: KeyframeTrack) {
  const values = track.values.slice();

  for (let index = 0; index < values.length; index += 3) {
    const x = values[index];
    const y = values[index + 1];
    const z = values[index + 2];

    values[index] = -x;
    values[index + 1] = z;
    values[index + 2] = y;
  }

  return new VectorKeyframeTrack(track.name, track.times.slice(), values);
}

function retargetRawQuaternionTrack(
  track: KeyframeTrack,
  sourceNode: Object3D,
  targetNode: Object3D,
) {
  const values = track.values.slice();
  const sourceRestInverse = sourceNode.quaternion.clone().invert();
  const targetRest = targetNode.quaternion.clone();
  const sourceKey = new Quaternion();

  for (let index = 0; index < values.length; index += 4) {
    sourceKey.set(
      values[index],
      values[index + 1],
      values[index + 2],
      values[index + 3],
    );

    const retargetedKey = targetRest
      .clone()
      .multiply(sourceRestInverse)
      .multiply(sourceKey)
      .normalize();

    values[index] = retargetedKey.x;
    values[index + 1] = retargetedKey.y;
    values[index + 2] = retargetedKey.z;
    values[index + 3] = retargetedKey.w;
  }

  return new QuaternionKeyframeTrack(track.name, track.times.slice(), values);
}

function convertRawHipsPositionTrack(track: KeyframeTrack) {
  const values = track.values.slice();

  for (let index = 0; index < values.length; index += 3) {
    const x = values[index];
    const y = values[index + 1];
    const z = values[index + 2];

    values[index] = -x;
    values[index + 1] = z;
    values[index + 2] = y;
  }

  return new VectorKeyframeTrack(track.name, track.times.slice(), values);
}

function buildDirectRetargetClip(
  clip: AnimationClip,
  animationScene: Object3D,
  vrmScene: Object3D,
) {
  const tracks = clip.tracks.flatMap((track) => {
    const { nodeName, property } = getTrackTarget(track.name);
    const sourceNode = animationScene.getObjectByName(nodeName);
    const targetNode = vrmScene.getObjectByName(nodeName);

    if (!sourceNode || !targetNode) {
      return [];
    }

    if (property === "position" && nodeName === "Hips") {
      return [convertRawHipsPositionTrack(track)];
    }

    if (property === "quaternion") {
      return [retargetRawQuaternionTrack(track, sourceNode, targetNode)];
    }

    return [];
  });

  return new AnimationClip(
    `${clip.name || "Surprise"} direct`,
    clip.duration,
    tracks as KeyframeTrack[],
    clip.blendMode,
  );
}

function buildPlaybackClip(
  clip: AnimationClip,
  animationMode: AnimationMode,
  animationScene: Object3D,
  vrmScene: Object3D,
) {
  if (animationMode === "normalized") {
    return buildDirectRetargetClip(clip, animationScene, vrmScene);
  }

  if (animationMode === "raw") {
    return clip;
  }

  const tracks = clip.tracks.flatMap((track) => {
    const { nodeName, property } = getTrackTarget(track.name);

    if (property === "quaternion") {
      return [track];
    }

    if (
      animationMode === "rotationWithRoot" &&
      property === "position" &&
      (nodeName === "Root" || nodeName === "Hips")
    ) {
      return [nodeName === "Hips" ? convertHipsPositionTrack(track) : track];
    }

    return [];
  });

  return new AnimationClip(
    `${clip.name || "Surprise"} ${animationMode}`,
    clip.duration,
    tracks as KeyframeTrack[],
    clip.blendMode,
  );
}

export default function VRMCharacter({
  modelUrl,
  animationUrl,
  animationMode,
  playNonce,
  paused,
  onStatus,
  onError,
}: VRMCharacterProps) {
  const root = useRef<Group>(null);
  const loaded = useRef<LoadedState | null>(null);
  const frameCount = useRef(0);

  const loader = useMemo(() => {
    const gltfLoader = new GLTFLoader();
    gltfLoader.register((parser) => new VRMLoaderPlugin(parser));
    return gltfLoader;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCharacterAndAnimation() {
      onError(null);
      onStatus({
        vrmLoaded: false,
        animationLoaded: false,
        clipName: "not loaded",
        clipDuration: 0,
        trackCount: 0,
        isPlaying: false,
      });

      try {
        const [vrmGltf, animationGltf] = await Promise.all([
          loader.loadAsync(modelUrl),
          loader.loadAsync(animationUrl),
        ]);

        if (cancelled || !root.current) {
          return;
        }

        const vrm = vrmGltf.userData.vrm as VRM | undefined;
        if (!vrm) {
          throw new Error("The model loaded, but no VRM data was found.");
        }

        vrm.scene.traverse((object) => {
          object.frustumCulled = false;
        });

        const clip =
          animationGltf.animations.find((item) =>
            item.name.toLowerCase().includes("surprise"),
          ) ?? animationGltf.animations[0];

        if (!clip) {
          throw new Error("No animation clips were found in surprise.glb.");
        }

        root.current.clear();
        root.current.add(vrm.scene);

        const playbackClip = buildPlaybackClip(
          clip,
          animationMode,
          animationGltf.scene,
          vrm.scene,
        );
        const mixer = new AnimationMixer(vrm.scene);
        const action = mixer.clipAction(playbackClip);
        action.loop = LoopRepeat;
        action.clampWhenFinished = false;
        action.reset().fadeIn(0.12).play();

        loaded.current = {
          vrm,
          mixer,
          action,
          clip: playbackClip,
          sourceClip: clip,
        };
        onStatus({
          vrmLoaded: true,
          animationLoaded: true,
          clipName: playbackClip.name || "(unnamed clip)",
          clipDuration: playbackClip.duration,
          trackCount: playbackClip.tracks.length,
          isPlaying: true,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to load viewer assets.";
        onError(message);
        onStatus({
          vrmLoaded: false,
          animationLoaded: false,
          clipName: "load failed",
          clipDuration: 0,
          trackCount: 0,
          isPlaying: false,
        });
      }
    }

    void loadCharacterAndAnimation();

    return () => {
      cancelled = true;
      loaded.current?.mixer.stopAllAction();
      loaded.current = null;
      root.current?.clear();
    };
  }, [animationMode, animationUrl, loader, modelUrl, onError, onStatus]);

  useEffect(() => {
    if (!loaded.current) {
      return;
    }

    loaded.current.action.paused = paused;
    onStatus({
      vrmLoaded: true,
      animationLoaded: true,
      clipName: loaded.current.clip.name || "(unnamed clip)",
      clipDuration: loaded.current.clip.duration,
      trackCount: loaded.current.clip.tracks.length,
      isPlaying: !paused,
    });
  }, [onStatus, paused]);

  useEffect(() => {
    if (!loaded.current) {
      return;
    }

    loaded.current.action
      .reset()
      .setEffectiveWeight(1)
      .setEffectiveTimeScale(1)
      .play();
    loaded.current.action.paused = false;
    onStatus({
      vrmLoaded: true,
      animationLoaded: true,
      clipName: loaded.current.clip.name || "(unnamed clip)",
      clipDuration: loaded.current.clip.duration,
      trackCount: loaded.current.clip.tracks.length,
      isPlaying: true,
    });
  }, [onStatus, playNonce]);

  useFrame((_, delta) => {
    if (!loaded.current || paused) {
      return;
    }

    loaded.current.mixer.update(delta);
    if (animationMode !== "normalized") {
      loaded.current.vrm.update(delta);
    }

    frameCount.current += 1;
    if (frameCount.current % 12 !== 0) {
      return;
    }

    const hips =
      loaded.current.vrm.scene.getObjectByName("Normalized_Hips") ??
      loaded.current.vrm.scene.getObjectByName("Hips");
    onStatus({
      vrmLoaded: true,
      animationLoaded: true,
      clipName: loaded.current.clip.name || "(unnamed clip)",
      clipDuration: loaded.current.clip.duration,
      trackCount: loaded.current.clip.tracks.length,
      isPlaying: true,
      hipsPosition: hips
        ? [hips.position.x, hips.position.y, hips.position.z]
        : undefined,
      hipsRotation: hips
        ? [
            hips.quaternion.x,
            hips.quaternion.y,
            hips.quaternion.z,
            hips.quaternion.w,
          ]
        : undefined,
    });
  });

  return <group ref={root} position={[0, 0, 0]} />;
}
