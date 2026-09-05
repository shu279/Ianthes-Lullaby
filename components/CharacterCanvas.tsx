"use client";

import { assetPath } from "@/lib/assetPath";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Environment,
  MeshReflectorMaterial,
  OrbitControls,
  useGLTF,
} from "@react-three/drei";
import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  ShaderMaterial,
} from "three";
import type {
  DirectionalLight as ThreeDirectionalLight,
  HemisphereLight as ThreeHemisphereLight,
  Mesh as ThreeMesh,
  Object3D,
  Points as ThreePoints,
} from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import GLBCharacter from "./GLBCharacter";
import { type AnimationStatus } from "./VRMCharacter";
import type { ConversationAnimation } from "@/lib/conversationTree";

const OCEAN_LAYER = 1;
const sleepIdleMs = 15_000;
const introCameraDuration = 3.4;

const animationOptions = [
  {
    key: "intro",
    label: "Intro",
    url: assetPath("/animations/intro.glb?v=20260614-flow-1"),
  },
  {
    key: "idle",
    label: "Idle",
    url: assetPath("/animations/idle.glb?v=20260614-flow-1"),
  },
  {
    key: "pose",
    label: "Pose",
    url: assetPath("/animations/pose.glb?v=20260614-flow-1"),
  },
  {
    key: "surprise",
    label: "Surprise",
    url: assetPath("/animations/surprise.glb?v=20260614-flow-1"),
  },
  {
    key: "attack",
    label: "Attack",
    url: assetPath("/animations/attack.glb?v=20260614-flow-1"),
  },
  {
    key: "laugh",
    label: "Laugh",
    url: assetPath("/animations/laugh.glb?v=20260614-flow-1"),
  },
  {
    key: "sleepIn",
    label: "Sleep In",
    url: assetPath("/animations/sleep_in.glb?v=20260614-flow-1"),
  },
  {
    key: "sleepOut",
    label: "Sleep Out",
    url: assetPath("/animations/sleep_out.glb?v=20260614-flow-1"),
  },
] as const;

type AnimationKey = (typeof animationOptions)[number]["key"];
type SleepMode = "awake" | "entering" | "asleep" | "waking";

const initialStatus: AnimationStatus = {
  vrmLoaded: false,
  animationLoaded: false,
  clipName: "not loaded",
  clipDuration: 0,
  trackCount: 0,
  isPlaying: false,
};

function LimitedOrbitControls() {
  const controls = useRef<OrbitControlsImpl>(null);

  useFrame(() => {
    const current = controls.current;

    if (!current) {
      return;
    }

    const target = current.target;
    const distance = current.object.position.distanceTo(target);
    const zoomFocus = Math.max(0, Math.min(1, (3.1 - distance) / 1.5));
    const focusY = 1.05 + zoomFocus * 0.48;
    const previousX = target.x;
    const previousY = target.y;
    const previousZ = target.z;

    target.x = Math.min(0.65, Math.max(-0.65, target.x));
    target.y += (focusY - target.y) * 0.06;
    target.y = Math.min(3, Math.max(-5.2, target.y));
    target.z = Math.min(0.55, Math.max(-0.55, target.z));

    current.object.position.x += target.x - previousX;
    current.object.position.y += target.y - previousY;
    current.object.position.z += target.z - previousZ;
    current.object.position.y = Math.max(-4.2, current.object.position.y);
    current.update();
  });

  return (
    <OrbitControls
      ref={controls}
      target={[0, 1.05, 0]}
      enablePan
      screenSpacePanning
      panSpeed={0.55}
      zoomSpeed={0.45}
      minDistance={1.6}
      maxDistance={6}
    />
  );
}

function IntroCameraDolly({ enabled }: { enabled: boolean }) {
  const camera = useThree((state) => state.camera);
  const startTime = useRef<number | null>(null);
  const done = useRef(false);

  useFrame(({ clock }) => {
    if (!enabled) {
      if (!done.current) {
        camera.position.set(0, 0, 0);
        startTime.current = null;
      }

      return;
    }

    if (done.current) {
      return;
    }

    if (startTime.current === null) {
      startTime.current = clock.elapsedTime;
    }

    const progress = Math.min(
      1,
      (clock.elapsedTime - startTime.current) / introCameraDuration,
    );
    const eased = 1 - Math.pow(1 - progress, 3);

    camera.position.y = eased;
    camera.position.z = eased * 5.5;

    if (progress >= 1) {
      camera.position.y = 1;
      camera.position.z = 5.5;
      done.current = true;
    }
  });

  return null;
}

function SceneLayerSetup() {
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    camera.layers.enable(OCEAN_LAYER);

    return () => {
      camera.layers.disable(OCEAN_LAYER);
    };
  }, [camera]);

  return null;
}

function WarmHemisphereLight() {
  const light = useRef<ThreeHemisphereLight>(null);

  useEffect(() => {
    light.current?.layers.enable(OCEAN_LAYER);
  }, []);

  return <hemisphereLight ref={light} args={["#fff0dc", "#a85f72", 0.9]} />;
}

function ReflectionLightMask({
  lightRef,
}: {
  lightRef: RefObject<ThreeDirectionalLight | null>;
}) {
  const previousIntensity = useRef(0.95);

  useFrame(() => {
    const light = lightRef.current;

    if (!light) {
      return;
    }

    previousIntensity.current = light.intensity;
    light.intensity = 0;
  }, -1);

  useFrame(() => {
    const light = lightRef.current;

    if (!light) {
      return;
    }

    light.intensity = previousIntensity.current;
  });

  return null;
}

function SkyGradient() {
  return (
    <mesh renderOrder={-1000}>
      <sphereGeometry args={[24, 24, 12]} />
      <shaderMaterial
        side={BackSide}
        depthWrite={false}
        depthTest={false}
        vertexShader={`
          varying vec3 vWorldPosition;

          void main() {
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vWorldPosition = worldPosition.xyz;
            gl_Position = projectionMatrix * viewMatrix * worldPosition;
          }
        `}
        fragmentShader={`
          varying vec3 vWorldPosition;

          void main() {
            float height = clamp((vWorldPosition.y + 1.0) / 20.0, 0.0, 1.0);
            vec3 horizon = vec3(0.42, 0.24, 0.56);
            vec3 greenBand = vec3(0.04, 0.05, 0.2);
            vec3 lightBlue = vec3(0.010, 0.03, 0.18);
            vec3 deepBlue = vec3(0.02, 0.015, 0.012);
            vec3 lowerMix = mix(horizon, greenBand, smoothstep(0.0, 0.4, height));
            vec3 middleMix = mix(lowerMix, lightBlue, smoothstep(0.0, 0.8, height));
            vec3 color = mix(middleMix, deepBlue, smoothstep(0.1, 1.0, height));
            gl_FragColor = vec4(color, 1.0);
          }
        `}
      />
    </mesh>
  );
}

function BackgroundModel() {
  const { scene } = useGLTF(assetPath("/models/background.glb?v=20260615-bg-reset-2")) as {
    scene: Object3D;
  };

  useEffect(() => {
    scene.traverse((object) => {
      object.frustumCulled = false;
    });
  }, [scene]);

  return (
    <primitive
      object={scene}
      position={[0, -0.2, 0]}
      rotation={[0, 0, 0]}
      scale={0.3}
    />
  );
}

function StarParticles() {
  const material = useRef<ShaderMaterial>(null);
  const points = useRef<ThreePoints>(null);
  const geometry = useMemo(() => {
    const starCount = 400;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);
    const phases = new Float32Array(starCount);
    const speeds = new Float32Array(starCount);
    const driftDirections = new Float32Array(starCount * 3);
    const driftRadii = new Float32Array(starCount);
    const pastelColors = [
      [1.0, 0.82, 0.72],
      [0.98, 0.9, 0.68],
      [0.82, 0.92, 1.0],
      [0.9, 0.82, 1.0],
      [0.82, 1.0, 0.92],
      [1.0, 0.82, 0.94],
    ];
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    for (let index = 0; index < starCount; index += 1) {
      const y = (index / (starCount - 1)) * 2 - 1;
      const upperY = Math.abs(y);
      const radiusAtY = Math.sqrt(Math.max(0, 1 - upperY * upperY));
      const theta = index * goldenAngle;
      const shellRadius = 5.5 + ((index * 37) % 100) / 100 * 9.5;
      const x = Math.cos(theta) * radiusAtY * shellRadius;
      const z = Math.sin(theta) * radiusAtY * shellRadius;
      const driftTheta = theta + Math.PI * 0.5 + ((index * 17) % 100) / 100;

      positions[index * 3] = x;
      positions[index * 3 + 1] = upperY * shellRadius;
      positions[index * 3 + 2] = z;
      driftDirections[index * 3] = Math.cos(driftTheta);
      driftDirections[index * 3 + 1] = 0;
      driftDirections[index * 3 + 2] = Math.sin(driftTheta);
      const color = pastelColors[index % pastelColors.length];
      colors[index * 3] = color[0];
      colors[index * 3 + 1] = color[1];
      colors[index * 3 + 2] = color[2];
      sizes[index] = 100 + ((index * 60) % 100) / 100 * 200;
      phases[index] = ((index * 53) % 1000) / 1000 * Math.PI * 2;
      speeds[index] = 0.18 + ((index * 29) % 100) / 100 * 0.34;
      driftRadii[index] = 0.35 + ((index * 43) % 100) / 100 * 0.5;
    }

    const nextGeometry = new BufferGeometry();
    nextGeometry.setAttribute("position", new BufferAttribute(positions, 3));
    nextGeometry.setAttribute("aColor", new BufferAttribute(colors, 3));
    nextGeometry.setAttribute("aSize", new BufferAttribute(sizes, 1));
    nextGeometry.setAttribute("aPhase", new BufferAttribute(phases, 1));
    nextGeometry.setAttribute("aSpeed", new BufferAttribute(speeds, 1));
    nextGeometry.setAttribute("aDriftDirection", new BufferAttribute(driftDirections, 3));
    nextGeometry.setAttribute("aDriftRadius", new BufferAttribute(driftRadii, 1));
    return nextGeometry;
  }, []);

  useFrame(() => {
    if (points.current) {
      points.current.visible = false;
    }
  }, -1);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;

    if (material.current) {
      material.current.uniforms.uTime.value = time;
    }

    if (points.current) {
      points.current.rotation.y = Math.sin(time * 0.08) * 0.045;
      points.current.rotation.x = Math.sin(time * 0.06 + 1.7) * 0.012;
      points.current.position.x = 0;
      points.current.position.y = Math.sin(time * 0.11) * 0.18;
      points.current.position.z = 0;
    }
  });

  useFrame(() => {
    if (points.current) {
      points.current.visible = true;
    }
  });

  return (
    <points ref={points} geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={material}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
        uniforms={{
          uTime: { value: 0 },
          uPixelRatio: {
            value:
              typeof window === "undefined"
                ? 1
                : Math.min(window.devicePixelRatio, 2),
          },
        }}
        vertexShader={`
          attribute float aSize;
          attribute float aPhase;
          attribute float aSpeed;
          attribute float aDriftRadius;
          attribute vec3 aColor;
          attribute vec3 aDriftDirection;

          varying float vAlpha;
          varying vec3 vColor;

          uniform float uPixelRatio;
          uniform float uTime;

          void main() {
            float drift = sin(uTime * aSpeed * 0.28 + aPhase) * aDriftRadius;
            vec3 driftedPosition = position + aDriftDirection * drift;
            vec4 mvPosition = modelViewMatrix * vec4(driftedPosition, 1.0);
            float shimmer = 0.5 + 0.5 * sin(uTime * aSpeed + aPhase);
            vAlpha = smoothstep(0.18, 0.92, shimmer) * 0.55;
            vColor = aColor;
            gl_PointSize = aSize * uPixelRatio * (1.0 / max(1.0, -mvPosition.z));
            gl_Position = projectionMatrix * mvPosition;
          }
        `}
        fragmentShader={`
          varying float vAlpha;
          varying vec3 vColor;

          void main() {
            vec2 uv = gl_PointCoord - vec2(0.5);
            float distanceFromCenter = length(uv);
            float core = 1.0 - smoothstep(0.02, 0.18, distanceFromCenter);
            float horizontal = 1.0 - smoothstep(0.0, 0.018, abs(uv.y));
            horizontal *= 1.0 - smoothstep(0.08, 0.5, abs(uv.x));
            float vertical = 1.0 - smoothstep(0.0, 0.018, abs(uv.x));
            vertical *= 1.0 - smoothstep(0.08, 0.5, abs(uv.y));
            float halo = 1.0 - smoothstep(0.12, 0.46, distanceFromCenter);
            float sparkle = max(core, max(horizontal, vertical) * 0.62);
            float alpha = max(sparkle, halo * 0.16);

            if (alpha < 0.01) {
              discard;
            }

            vec3 color = mix(vColor, vec3(1.0), core * 0.28);
            gl_FragColor = vec4(color, alpha * vAlpha);
          }
        `}
      />
    </points>
  );
}

function OceanPlane({ reflectionResolution }: { reflectionResolution: number }) {
  const ocean = useRef<ThreeMesh>(null);

  useEffect(() => {
    ocean.current?.layers.set(OCEAN_LAYER);
  }, []);

  return (
    <mesh
      ref={ocean}
      position={[0, -0.5, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <circleGeometry args={[15, 96]} />
      <MeshReflectorMaterial
        blur={[120, 48]}
        color="#ab8bde"
        depthScale={0}
        envMapIntensity={0}
        metalness={0}
        mirror={0.8}
        mixBlur={0}
        mixContrast={0.9}
        mixStrength={1}
        reflectorOffset={0.02}
        resolution={reflectionResolution}
        roughness={0.62}
      />
    </mesh>
  );
}

export default function CharacterCanvas({
  backgroundVisible,
  conversationAnimation,
  conversationAnimationNonce,
  reflectionResolution,
}: {
  backgroundVisible: boolean;
  conversationAnimation: ConversationAnimation;
  conversationAnimationNonce: number;
  reflectionResolution: number;
}) {
  const directionalLight = useRef<ThreeDirectionalLight>(null);
  const sleepTimer = useRef<number | null>(null);
  const handledConversationNonce = useRef(0);
  const pendingWakeAnimation = useRef<ConversationAnimation | null>(null);
  const [status, setStatus] = useState<AnimationStatus>(initialStatus);
  const [, setError] = useState<string | null>(null);
  const [selectedAnimation, setSelectedAnimation] =
    useState<AnimationKey>("intro");
  const [sleepMode, setSleepMode] = useState<SleepMode>("awake");
  const playNonce = 0;
  const paused = false;
  const animationUrl =
    animationOptions.find((option) => option.key === selectedAnimation)?.url ??
    animationOptions[0].url;
  const shouldLoopAnimation = selectedAnimation === "idle";

  const selectAnimation = useCallback((animation: AnimationKey) => {
    setSelectedAnimation(animation);
  }, []);

  const clearSleepTimer = useCallback(() => {
    if (sleepTimer.current !== null) {
      window.clearTimeout(sleepTimer.current);
      sleepTimer.current = null;
    }
  }, []);

  const enterSleepMode = useCallback(() => {
    clearSleepTimer();
    setSleepMode("entering");
    selectAnimation("sleepIn");
  }, [clearSleepTimer, selectAnimation]);

  const armSleepTimer = useCallback(() => {
    clearSleepTimer();
    sleepTimer.current = window.setTimeout(enterSleepMode, sleepIdleMs);
  }, [clearSleepTimer, enterSleepMode]);

  const wakeFromSleepMode = useCallback(() => {
    clearSleepTimer();
    setSleepMode("waking");
    selectAnimation("sleepOut");
  }, [clearSleepTimer, selectAnimation]);

  useEffect(() => {
    armSleepTimer();

    return clearSleepTimer;
  }, [armSleepTimer, clearSleepTimer]);

  useEffect(() => {
    if (conversationAnimationNonce === 0) {
      return;
    }

    if (handledConversationNonce.current === conversationAnimationNonce) {
      return;
    }

    handledConversationNonce.current = conversationAnimationNonce;

    if (sleepMode === "entering" || sleepMode === "asleep") {
      pendingWakeAnimation.current = conversationAnimation;
      wakeFromSleepMode();
      return;
    }

    if (sleepMode === "waking") {
      pendingWakeAnimation.current = conversationAnimation;
      return;
    }

    selectAnimation(conversationAnimation);
    armSleepTimer();
  }, [
    armSleepTimer,
    conversationAnimation,
    conversationAnimationNonce,
    selectAnimation,
    sleepMode,
    wakeFromSleepMode,
  ]);

  useEffect(() => {
    if (
      selectedAnimation !== "intro" ||
      paused ||
      !status.animationLoaded ||
      status.clipDuration <= 0
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setSelectedAnimation("idle");
    }, status.clipDuration * 1000);

    return () => window.clearTimeout(timeout);
  }, [paused, selectedAnimation, status.animationLoaded, status.clipDuration]);

  useEffect(() => {
    if (
      selectedAnimation !== "sleepIn" ||
      sleepMode !== "entering" ||
      !status.animationLoaded ||
      status.clipDuration <= 0
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setSleepMode("asleep");
    }, status.clipDuration * 1000);

    return () => window.clearTimeout(timeout);
  }, [selectedAnimation, sleepMode, status.animationLoaded, status.clipDuration]);

  useEffect(() => {
    if (
      selectedAnimation !== "sleepOut" ||
      sleepMode !== "waking" ||
      !status.animationLoaded ||
      status.clipDuration <= 0
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const wakeAnimation = pendingWakeAnimation.current;

      pendingWakeAnimation.current = null;
      setSleepMode("awake");
      selectAnimation(wakeAnimation ?? "idle");
      armSleepTimer();
    }, Math.max(0, status.clipDuration * 1000 - 120));

    return () => window.clearTimeout(timeout);
  }, [
    armSleepTimer,
    selectAnimation,
    selectedAnimation,
    sleepMode,
    status.animationLoaded,
    status.clipDuration,
  ]);

  useEffect(() => {
    if (
      (selectedAnimation !== "surprise" && selectedAnimation !== "laugh") ||
      paused ||
      sleepMode !== "awake" ||
      !status.animationLoaded ||
      status.clipDuration <= 0
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      selectAnimation("idle");
    }, status.clipDuration * 1000);

    return () => window.clearTimeout(timeout);
  }, [
    paused,
    selectAnimation,
    selectedAnimation,
    sleepMode,
    status.animationLoaded,
    status.clipDuration,
  ]);

  return (
    <div className="canvasWrap">
      <Canvas
        camera={{ position: [0, 0, 0], fov: 32 }}
        dpr={[1, 2]}
        shadows
        gl={{
          alpha: true,
          toneMapping: ACESFilmicToneMapping,
          toneMappingExposure: 1.9,
        }}
      >
        <SceneLayerSetup />
        <ambientLight intensity={0} />
        <WarmHemisphereLight />
        <directionalLight
          ref={directionalLight}
          castShadow
          color="#ffffff"
          intensity={1}
          position={[2.8, 0, 3.2]}
          shadow-mapSize={[2048, 2048]}
        />
        <Suspense fallback={null}>
          <SkyGradient />
          {backgroundVisible ? <BackgroundModel /> : null}
          <OceanPlane reflectionResolution={reflectionResolution} />
          <ReflectionLightMask lightRef={directionalLight} />
          <StarParticles />
          <GLBCharacter
            modelUrl={assetPath("/models/character.glb?v=20260613-outline-1")}
            animationUrl={animationUrl}
            loop={shouldLoopAnimation}
            toon
            playNonce={playNonce}
            paused={paused}
            onStatus={setStatus}
            onError={setError}
          />
          <Environment preset="night" environmentIntensity={0.16} />
        </Suspense>
        <IntroCameraDolly
          enabled={selectedAnimation === "intro" && status.animationLoaded}
        />
        <LimitedOrbitControls />
      </Canvas>
    </div>
  );
}
