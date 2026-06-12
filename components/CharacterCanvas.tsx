"use client";

import { Suspense, useCallback, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, OrbitControls } from "@react-three/drei";
import { ACESFilmicToneMapping } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import GLBCharacter from "./GLBCharacter";
import { type AnimationStatus } from "./VRMCharacter";

const initialStatus: AnimationStatus = {
  vrmLoaded: false,
  animationLoaded: false,
  clipName: "not loaded",
  clipDuration: 0,
  trackCount: 0,
  isPlaying: false,
};

function formatVector(values?: number[]) {
  return values ? values.map((value) => value.toFixed(3)).join(", ") : "n/a";
}

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
    target.y = Math.min(1.58, Math.max(0.75, target.y));
    target.z = Math.min(0.55, Math.max(-0.55, target.z));

    current.object.position.x += target.x - previousX;
    current.object.position.y += target.y - previousY;
    current.object.position.z += target.z - previousZ;
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

export default function CharacterCanvas() {
  const [status, setStatus] = useState<AnimationStatus>(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [playNonce, setPlayNonce] = useState(0);
  const [paused, setPaused] = useState(false);

  const replay = useCallback(() => {
    setPaused(false);
    setPlayNonce((value) => value + 1);
  }, []);

  return (
    <div className="canvasWrap">
      <Canvas
        camera={{ position: [0, 1.35, 3.2], fov: 32 }}
        dpr={[1, 2]}
        shadows
        gl={{ toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.9}}
      >
        <color attach="background" args={["#171614"]} />
        <ambientLight intensity={0.0} />
        <hemisphereLight
          args={["#fff0dc", "#a85f72", 0.9]}
        />
        <directionalLight
          castShadow
          intensity={1.32}
          position={[2.8, 4.8, 3.2]}
          shadow-mapSize={[2048, 2048]}
        />
        <Suspense fallback={null}>
          <GLBCharacter
            modelUrl="/models/character.glb?v=20260612-glb-1"
            animationUrl="/animations/surprise.glb?v=20260612-glb-1"
            toon
            playNonce={playNonce}
            paused={paused}
            onStatus={setStatus}
            onError={setError}
          />
          <Environment preset="night" environmentIntensity={0.16} />
        </Suspense>
        <LimitedOrbitControls />
      </Canvas>

      <aside className="hud" aria-live="polite">
        <h1>Ianthe Animation Check</h1>
        <p>Loads the VRM and plays the Surprise GLB clip against the character.</p>

        <dl className="statusList">
          <div className="statusRow">
            <dt>VRM</dt>
            <dd>{status.vrmLoaded ? "loaded" : "loading"}</dd>
          </div>
          <div className="statusRow">
            <dt>Animation</dt>
            <dd>{status.animationLoaded ? "loaded" : "loading"}</dd>
          </div>
          <div className="statusRow">
            <dt>Clip</dt>
            <dd>{status.clipName}</dd>
          </div>
          <div className="statusRow">
            <dt>Duration</dt>
            <dd>{status.clipDuration.toFixed(2)}s</dd>
          </div>
          <div className="statusRow">
            <dt>Tracks</dt>
            <dd>{status.trackCount}</dd>
          </div>
          <div className="statusRow">
            <dt>Playback</dt>
            <dd>{status.isPlaying && !paused ? "playing" : "paused"}</dd>
          </div>
          <div className="statusRow">
            <dt>Mode</dt>
            <dd>GLB direct</dd>
          </div>
          <div className="statusRow">
            <dt>Hips pos</dt>
            <dd>{formatVector(status.hipsPosition)}</dd>
          </div>
          <div className="statusRow">
            <dt>Hips rot</dt>
            <dd>{formatVector(status.hipsRotation)}</dd>
          </div>
        </dl>

        <div className="controls">
          <button className="primary" type="button" onClick={replay}>
            Replay Surprise
          </button>
          <button
            type="button"
            onClick={() => setPaused((value) => !value)}
            disabled={!status.animationLoaded}
          >
            {paused ? "Resume" : "Pause"}
          </button>
        </div>

        {error ? <p className="error">{error}</p> : null}
      </aside>
    </div>
  );
}
