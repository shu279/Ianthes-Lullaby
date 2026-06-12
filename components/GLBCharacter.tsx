"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  CanvasTexture,
  Color,
  Material,
  Mesh,
  MeshStandardMaterial,
  MeshToonMaterial,
  NearestFilter,
  Group,
  LoopRepeat,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { AnimationStatus } from "./VRMCharacter";

type GLBCharacterProps = {
  modelUrl: string;
  animationUrl: string;
  toon: boolean;
  playNonce: number;
  paused: boolean;
  onStatus: (status: AnimationStatus) => void;
  onError: (message: string | null) => void;
};

type LoadedState = {
  mixer: AnimationMixer;
  action: AnimationAction;
  clip: AnimationClip;
  hips?: Group;
};

function createToonGradient() {
  const canvas = document.createElement("canvas");
  canvas.width = 3;
  canvas.height = 1;
  const context = canvas.getContext("2d");

  if (context) {
    context.fillStyle = "#9a5365";
    context.fillRect(0, 0, 1, 1);
    context.fillStyle = "#d98a7c";
    context.fillRect(1, 0, 1, 1);
    context.fillStyle = "#fff1cf";
    context.fillRect(2, 0, 1, 1);
  }

  const texture = new CanvasTexture(canvas);
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function normalizeMaterials(root: Group, toon: boolean) {
  const gradientMap = toon ? createToonGradient() : null;

  root.traverse((object) => {
    const mesh = object as Mesh;
    const material = mesh.material;

    if (!material) {
      return;
    }

    const materials = Array.isArray(material) ? material : [material];
    materials.forEach((item) => {
      const sourceMaterial = item as Material & {
        alphaTest?: number;
        color?: Color;
        emissive?: Color;
        envMapIntensity?: number;
        opacity?: number;
        toneMapped?: boolean;
        transparent?: boolean;
      };
      const writableMaterial = toon
        ? new MeshToonMaterial({
            color: sourceMaterial.color?.clone() ?? new Color(1, 1, 1),
            gradientMap,
            map: (sourceMaterial as MeshStandardMaterial).map ?? null,
            transparent: sourceMaterial.transparent,
            opacity: sourceMaterial.opacity ?? 1,
            alphaTest: sourceMaterial.alphaTest ?? 0,
          })
        : sourceMaterial;
      const isActuallyTransparent =
        writableMaterial.transparent === true &&
        writableMaterial.opacity !== undefined &&
        writableMaterial.opacity < 0.999;

      writableMaterial.depthTest = true;
      writableMaterial.depthWrite = !isActuallyTransparent;
      writableMaterial.transparent = isActuallyTransparent;
      if (!isActuallyTransparent) {
        writableMaterial.alphaTest = 0;
      }
      writableMaterial.color?.lerp(
        toon ? new Color(1, 0.74, 0.68) : new Color(0.72, 0.72, 0.72),
        toon ? 0.16 : 0.06,
      );
      writableMaterial.emissive?.multiplyScalar(0.35);
      if ("envMapIntensity" in writableMaterial) {
        writableMaterial.envMapIntensity = 0.08;
      }
      writableMaterial.toneMapped = true;
      writableMaterial.needsUpdate = true;

      if (toon) {
        if (Array.isArray(mesh.material)) {
          const index = mesh.material.indexOf(item);
          mesh.material[index] = writableMaterial;
        } else {
          mesh.material = writableMaterial;
        }
      }
    });
  });
}

export default function GLBCharacter({
  modelUrl,
  animationUrl,
  toon,
  playNonce,
  paused,
  onStatus,
  onError,
}: GLBCharacterProps) {
  const root = useRef<Group>(null);
  const loaded = useRef<LoadedState | null>(null);
  const frameCount = useRef(0);
  const loader = useMemo(() => new GLTFLoader(), []);

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
        const [modelGltf, animationGltf] = await Promise.all([
          loader.loadAsync(modelUrl),
          loader.loadAsync(animationUrl),
        ]);

        if (cancelled || !root.current) {
          return;
        }

        const clip =
          animationGltf.animations.find((item) =>
            item.name.toLowerCase().includes("surprise"),
          ) ?? animationGltf.animations[0];

        if (!clip) {
          throw new Error("No animation clips were found in surprise.glb.");
        }

        modelGltf.scene.traverse((object) => {
          object.frustumCulled = false;
        });
        normalizeMaterials(modelGltf.scene, toon);

        root.current.clear();
        root.current.add(modelGltf.scene);

        const mixer = new AnimationMixer(modelGltf.scene);
        const action = mixer.clipAction(clip);
        action.loop = LoopRepeat;
        action.clampWhenFinished = false;
        action.reset().fadeIn(0.12).play();

        const hips = modelGltf.scene.getObjectByName("Hips") as Group | undefined;
        loaded.current = { mixer, action, clip, hips };
        onStatus({
          vrmLoaded: true,
          animationLoaded: true,
          clipName: clip.name || "(unnamed clip)",
          clipDuration: clip.duration,
          trackCount: clip.tracks.length,
          isPlaying: true,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to load GLB viewer assets.";
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
  }, [animationUrl, loader, modelUrl, onError, onStatus, toon]);

  useEffect(() => {
    if (!loaded.current) {
      return;
    }

    loaded.current.action.paused = paused;
  }, [paused]);

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
  }, [playNonce]);

  useFrame((_, delta) => {
    if (!loaded.current || paused) {
      return;
    }

    loaded.current.mixer.update(delta);

    frameCount.current += 1;
    if (frameCount.current % 12 !== 0) {
      return;
    }

    const { clip, hips } = loaded.current;
    onStatus({
      vrmLoaded: true,
      animationLoaded: true,
      clipName: clip.name || "(unnamed clip)",
      clipDuration: clip.duration,
      trackCount: clip.tracks.length,
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
