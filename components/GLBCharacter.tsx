"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  CanvasTexture,
  Color,
  FrontSide,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MeshToonMaterial,
  NearestFilter,
  Object3D,
  Group,
  LoopOnce,
  LoopRepeat,
  NumberKeyframeTrack,
  SkinnedMesh,
  Texture,
  TextureLoader,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { AnimationStatus } from "./VRMCharacter";

type GLBCharacterProps = {
  modelUrl: string;
  animationUrl: string;
  loop: boolean;
  toon: boolean;
  playNonce: number;
  paused: boolean;
  onStatus: (status: AnimationStatus) => void;
  onError: (message: string | null) => void;
};

type LoadedState = {
  mixer: AnimationMixer;
  action?: AnimationAction;
  clip?: AnimationClip;
  hips?: Group;
  morphDrivers: MorphDriver[];
  scene: Group;
};

type MaskTextures = {
  metallic: Texture;
  emission: Texture;
};

type MorphTargetMesh = Mesh & {
  morphTargetDictionary?: Record<string, number>;
  morphTargetInfluences?: number[];
};

type MorphDriver = {
  control: Object3D;
  influence: number;
  meshes: MorphTargetMesh[];
  range: number;
  restY: number;
  targetName: string;
};

type ColorMappedMaterial = Material & {
  color?: Color;
  map?: Texture | null;
};

const morphDriverConfigs = [
  { controlName: "eye.close.L", targetName: "Sleep_L", range: 0.014 },
  { controlName: "eye.close.R", targetName: "Sleep_R", range: 0.014 },
  { controlName: "eye.smile.L", targetName: "Smile_L", range: 0.014 },
  { controlName: "eye.smile.R", targetName: "Smile_R", range: 0.014 },
];

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function sanitizeAnimatedNodeName(name: string) {
  return name.replace(/\s/g, "_").replace(/[[\].:/]/g, "");
}

function isOutlineObject(object: Object3D) {
  return object.name.toLowerCase() === "outline";
}

function getPrimaryCharacterMaterial(root: Group): ColorMappedMaterial | null {
  let primaryMaterial: ColorMappedMaterial | null = null;

  root.traverse((object) => {
    if (primaryMaterial) {
      return;
    }

    const mesh = object as Mesh;

    if (!mesh.isMesh || isOutlineObject(mesh)) {
      return;
    }

    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    primaryMaterial = material as ColorMappedMaterial;
  });

  return primaryMaterial;
}

function createMorphDrivers(root: Group) {
  const morphMeshes: MorphTargetMesh[] = [];

  root.traverse((object) => {
    const mesh = object as MorphTargetMesh;

    if (
      mesh.isMesh &&
      !isOutlineObject(mesh) &&
      mesh.morphTargetDictionary &&
      mesh.morphTargetInfluences
    ) {
      morphMeshes.push(mesh);
    }
  });

  return morphDriverConfigs.flatMap((config) => {
    const control = root.getObjectByName(sanitizeAnimatedNodeName(config.controlName));
    const meshes = morphMeshes.filter((mesh) =>
      Object.prototype.hasOwnProperty.call(
        mesh.morphTargetDictionary,
        config.targetName,
      ),
    );

    if (!control || meshes.length === 0) {
      return [];
    }

    return [
      {
        control,
        influence: 0,
        meshes,
        range: config.range,
        restY: control.position.y,
        targetName: config.targetName,
      },
    ];
  });
}

function createClipWithMorphDriverTracks(sourceClip: AnimationClip, root: Group) {
  const morphMeshes: MorphTargetMesh[] = [];

  root.traverse((object) => {
    const mesh = object as MorphTargetMesh;

    if (
      mesh.isMesh &&
      !isOutlineObject(mesh) &&
      mesh.morphTargetDictionary &&
      mesh.morphTargetInfluences
    ) {
      morphMeshes.push(mesh);
    }
  });

  const morphTracks = morphDriverConfigs.flatMap((config) => {
    const controlName = sanitizeAnimatedNodeName(config.controlName);
    const control = root.getObjectByName(controlName);
    const sourceTrack = sourceClip.tracks.find((track) => {
      const propertySeparator = track.name.lastIndexOf(".");
      const nodeName = track.name.slice(0, propertySeparator);
      const propertyName = track.name.slice(propertySeparator + 1);

      return (
        nodeName === controlName &&
        (propertyName === "position" || propertyName === "translation") &&
        track.getValueSize() === 3
      );
    });

    if (!control || !sourceTrack) {
      return [];
    }

    const targetMeshes = morphMeshes.filter((mesh) =>
      Object.prototype.hasOwnProperty.call(
        mesh.morphTargetDictionary,
        config.targetName,
      ),
    );

    return targetMeshes.map((mesh) => {
      const values: number[] = [];

      for (let index = 0; index < sourceTrack.values.length; index += 3) {
        const y = sourceTrack.values[index + 1];
        values.push(clamp01((control.position.y - y) / config.range));
      }

      return new NumberKeyframeTrack(
        `${mesh.name}.morphTargetInfluences[${config.targetName}]`,
        sourceTrack.times.slice(),
        values,
      );
    });
  });

  if (morphTracks.length === 0) {
    return sourceClip;
  }

  return new AnimationClip(sourceClip.name, sourceClip.duration, [
    ...sourceClip.tracks,
    ...morphTracks,
  ]);
}

function applyMorphDrivers(drivers: MorphDriver[]) {
  drivers.forEach((driver) => {
    const influence = clamp01((driver.restY - driver.control.position.y) / driver.range);
    driver.influence = influence;

    driver.meshes.forEach((mesh) => {
      const targetIndex = mesh.morphTargetDictionary?.[driver.targetName];

      if (targetIndex === undefined || !mesh.morphTargetInfluences) {
        return;
      }

      mesh.morphTargetInfluences[targetIndex] = influence;
    });
  });
}

function configureExportedOutline(root: Group) {
  const primaryMaterial = getPrimaryCharacterMaterial(root);
  const outlineBaseColor =
    primaryMaterial?.color?.clone().multiplyScalar(0.42) ?? new Color("#2b2025");
  const outlineMap = primaryMaterial?.map ?? null;

  root.traverse((object) => {
    const mesh = object as Mesh;

    if (!mesh.isMesh || !mesh.geometry || !isOutlineObject(mesh)) {
      return;
    }

    mesh.material = new MeshBasicMaterial({
      color: outlineBaseColor,
      map: outlineMap,
      side: FrontSide,
      toneMapped: false,
    });
    mesh.renderOrder = -1;
    mesh.frustumCulled = false;
    mesh.userData.exportedOutline = true;
  });
}

function createBoundMeshCopy(source: Mesh, material: Material, suffix: string) {
  const overlay = source.clone(false) as Mesh;
  overlay.name = `${source.name || "mesh"}_${suffix}`;
  overlay.geometry = source.geometry;
  overlay.material = material;
  overlay.position.copy(source.position);
  overlay.rotation.copy(source.rotation);
  overlay.quaternion.copy(source.quaternion);
  overlay.scale.copy(source.scale);
  overlay.renderOrder = suffix === "emission" ? 3 : 2;
  overlay.frustumCulled = false;
  overlay.userData.maskOverlay = true;

  if ((source as SkinnedMesh).isSkinnedMesh && (overlay as SkinnedMesh).bind) {
    const skinnedSource = source as SkinnedMesh;
    const skinnedOverlay = overlay as SkinnedMesh;
    skinnedOverlay.bind(skinnedSource.skeleton, skinnedSource.bindMatrix);
  }

  return overlay;
}

function addMaskedMaterialOverlays(root: Group, masks: MaskTextures) {
  const overlays: Array<{ overlay: Mesh; parent: Group | null }> = [];

  root.traverse((object) => {
    const mesh = object as Mesh;

    if (
      !mesh.isMesh ||
      !mesh.geometry ||
      mesh.userData.maskOverlay ||
      isOutlineObject(mesh)
    ) {
      return;
    }

    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const baseMaterial = material as MeshToonMaterial | MeshStandardMaterial | undefined;
    const map = baseMaterial?.map ?? null;
    const baseColor = baseMaterial?.color?.clone() ?? new Color(1, 1, 1);

    const metallicMaterial = new MeshStandardMaterial({
      alphaMap: masks.metallic,
      alphaTest: 0.5,
      color: baseColor.clone().lerp(new Color("#f0dcc0"), 0.82),
      envMapIntensity: 0.42,
      metalness: 0.58,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      roughness: 0.64,
      transparent: false,
    });
    metallicMaterial.depthTest = true;
    metallicMaterial.depthWrite = false;
    metallicMaterial.toneMapped = true;

    const emissionMaterial = new MeshBasicMaterial({
      alphaMap: masks.emission,
      alphaTest: 0.2,
      blending: AdditiveBlending,
      color: new Color(1, 1, 1),
      map,
      opacity: 0.82,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      transparent: true,
    });
    emissionMaterial.depthTest = true;
    emissionMaterial.depthWrite = false;
    emissionMaterial.toneMapped = false;

    overlays.push({
      overlay: createBoundMeshCopy(mesh, metallicMaterial, "metallic"),
      parent: mesh.parent as Group | null,
    });
    overlays.push({
      overlay: createBoundMeshCopy(mesh, emissionMaterial, "emission"),
      parent: mesh.parent as Group | null,
    });
  });

  overlays.forEach(({ overlay, parent }) => {
    parent?.add(overlay);
  });
}

function createToonGradient() {
  const canvas = document.createElement("canvas");
  canvas.width = 3;
  canvas.height = 1;
  const context = canvas.getContext("2d");

  if (context) {
    context.fillStyle = "#7f6367";
    context.fillRect(0, 0, 1, 1);
    context.fillStyle = "#c99d91";
    context.fillRect(1, 0, 1, 1);
    context.fillStyle = "#f5ead7";
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

    if (!material || isOutlineObject(mesh)) {
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
        toon ? new Color(0.82, 0.78, 0.75) : new Color(0.72, 0.72, 0.72),
        toon ? 0.18 : 0.06,
      );
      writableMaterial.emissive?.multiplyScalar(0.2);
      if ("envMapIntensity" in writableMaterial) {
        writableMaterial.envMapIntensity = 0.1;
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
  loop,
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
  const textureLoader = useMemo(() => new TextureLoader(), []);
  const [modelVersion, setModelVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadCharacter() {
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
        const [modelGltf, metallicMask, emissionMask] = await Promise.all([
          loader.loadAsync(modelUrl),
          textureLoader.loadAsync("/textures/character_metallic_mask.png"),
          textureLoader.loadAsync("/textures/character_emission_mask.png"),
        ]);

        if (cancelled || !root.current) {
          return;
        }

        metallicMask.flipY = false;
        metallicMask.needsUpdate = true;
        emissionMask.flipY = false;
        emissionMask.needsUpdate = true;

        modelGltf.scene.traverse((object) => {
          object.frustumCulled = false;
        });
        normalizeMaterials(modelGltf.scene, toon);
        if (toon) {
          addMaskedMaterialOverlays(modelGltf.scene, {
            metallic: metallicMask,
            emission: emissionMask,
          });
          configureExportedOutline(modelGltf.scene);
        }

        root.current.clear();
        root.current.add(modelGltf.scene);

        const mixer = new AnimationMixer(modelGltf.scene);
        const hips = modelGltf.scene.getObjectByName("Hips") as Group | undefined;
        const morphDrivers = createMorphDrivers(modelGltf.scene);
        applyMorphDrivers(morphDrivers);
        loaded.current = {
          mixer,
          hips,
          morphDrivers,
          scene: modelGltf.scene,
        };
        setModelVersion((value) => value + 1);
        onStatus({
          vrmLoaded: true,
          animationLoaded: false,
          clipName: "not loaded",
          clipDuration: 0,
          trackCount: 0,
          isPlaying: false,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to load character assets.";
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

    void loadCharacter();

    return () => {
      cancelled = true;
      loaded.current?.mixer.stopAllAction();
      loaded.current = null;
      root.current?.clear();
    };
  }, [loader, modelUrl, onError, onStatus, textureLoader, toon]);

  useEffect(() => {
    let cancelled = false;

    async function loadAnimation() {
      const current = loaded.current;

      if (!current) {
        return;
      }

      onError(null);
      onStatus({
        vrmLoaded: true,
        animationLoaded: false,
        clipName: "loading",
        clipDuration: 0,
        trackCount: 0,
        isPlaying: false,
      });

      try {
        const animationGltf = await loader.loadAsync(animationUrl);

        if (cancelled || loaded.current !== current) {
          return;
        }

        const sourceClip = animationGltf.animations[0];

        if (!sourceClip) {
          throw new Error("No animation clips were found in the selected GLB.");
        }

        const clip = createClipWithMorphDriverTracks(sourceClip, current.scene);
        const previousAction = current.action;
        const action = current.mixer.clipAction(clip);
        action.loop = loop ? LoopRepeat : LoopOnce;
        action.clampWhenFinished = !loop;
        action.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();

        if (previousAction && previousAction !== action) {
          previousAction.fadeOut(0.12);
          action.fadeIn(0.12);
        }

        current.action = action;
        current.clip = clip;
        applyMorphDrivers(current.morphDrivers);
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
          error instanceof Error ? error.message : "Failed to load animation asset.";
        onError(message);
        onStatus({
          vrmLoaded: true,
          animationLoaded: false,
          clipName: "load failed",
          clipDuration: 0,
          trackCount: 0,
          isPlaying: false,
        });
      }
    }

    void loadAnimation();

    return () => {
      cancelled = true;
    };
  }, [animationUrl, loader, loop, modelVersion, onError, onStatus]);

  useEffect(() => {
    if (!loaded.current) {
      return;
    }

    if (loaded.current.action) {
      loaded.current.action.paused = paused;
    }
  }, [paused]);

  useEffect(() => {
    if (!loaded.current) {
      return;
    }

    if (!loaded.current.action) {
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
    applyMorphDrivers(loaded.current.morphDrivers);

    frameCount.current += 1;
    if (frameCount.current % 12 !== 0) {
      return;
    }

    const { clip, hips, morphDrivers } = loaded.current;
    const eyeCloseDriver = morphDrivers.find(
      (driver) => driver.targetName === "Sleep_L",
    );

    onStatus({
      vrmLoaded: true,
      animationLoaded: Boolean(clip),
      clipName: clip?.name || "loading",
      clipDuration: clip?.duration ?? 0,
      trackCount: clip?.tracks.length ?? 0,
      isPlaying: Boolean(clip),
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
      eyeCloseDriver: eyeCloseDriver
        ? {
            influence: eyeCloseDriver.influence,
            y: eyeCloseDriver.control.position.y,
          }
        : undefined,
    });
  });

  return <group ref={root} position={[0, 0, 0]} />;
}
