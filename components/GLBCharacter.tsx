"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  AnimationAction,
  AnimationClip,
  AnimationMixer,
  BackSide,
  CanvasTexture,
  Color,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  MeshToonMaterial,
  NearestFilter,
  Group,
  LoopRepeat,
  ShaderMaterial,
  SkinnedMesh,
  Texture,
  TextureLoader,
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

type MaskTextures = {
  metallic: Texture;
  emission: Texture;
};

function addAnimeOutlines(root: Group) {
  const outlineMaterial = new ShaderMaterial({
    uniforms: {
      color: { value: new Color("#2b2025") },
      thickness: { value: 0.0075 },
    },
    side: BackSide,
    depthTest: true,
    depthWrite: false,
    vertexShader: `
      #include <common>
      #include <skinning_pars_vertex>

      uniform float thickness;

      void main() {
        #include <skinbase_vertex>
        #include <begin_vertex>
        #include <beginnormal_vertex>
        #include <skinning_vertex>
        #include <skinnormal_vertex>

        transformed += normalize(objectNormal) * thickness;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 color;

      void main() {
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  (outlineMaterial as ShaderMaterial & { skinning: boolean }).skinning = true;
  const outlines: Array<{ outline: Mesh; parent: Group | null }> = [];

  root.traverse((object) => {
    const mesh = object as Mesh;

    if (!mesh.isMesh || !mesh.geometry || mesh.userData.maskOverlay) {
      return;
    }

    const outline = mesh.clone(false) as Mesh;
    outline.name = `${mesh.name || "mesh"}_outline`;
    outline.geometry = mesh.geometry;
    outline.material = outlineMaterial;
    outline.position.copy(mesh.position);
    outline.rotation.copy(mesh.rotation);
    outline.quaternion.copy(mesh.quaternion);
    outline.scale.copy(mesh.scale);
    outline.renderOrder = -1;
    outline.frustumCulled = false;

    if ((mesh as SkinnedMesh).isSkinnedMesh && (outline as SkinnedMesh).bind) {
      const skinnedMesh = mesh as SkinnedMesh;
      const skinnedOutline = outline as SkinnedMesh;
      skinnedOutline.bind(skinnedMesh.skeleton, skinnedMesh.bindMatrix);
    }

    outlines.push({ outline, parent: mesh.parent as Group | null });
  });

  outlines.forEach(({ outline, parent }) => {
    parent?.add(outline);
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

    if (!mesh.isMesh || !mesh.geometry || mesh.userData.maskOverlay) {
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
        const [modelGltf, animationGltf, metallicMask, emissionMask] = await Promise.all([
          loader.loadAsync(modelUrl),
          loader.loadAsync(animationUrl),
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
        if (toon) {
          addMaskedMaterialOverlays(modelGltf.scene, {
            metallic: metallicMask,
            emission: emissionMask,
          });
          addAnimeOutlines(modelGltf.scene);
        }

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
  }, [animationUrl, loader, modelUrl, onError, onStatus, textureLoader, toon]);

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
