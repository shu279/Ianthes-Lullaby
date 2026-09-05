"use client";

import AIChatPanel from "@/components/AIChatPanel";
import BGMPlayer from "@/components/BGMPlayer";
import CharacterCanvas from "@/components/CharacterCanvas";
import ConversationPanel from "@/components/ConversationPanel";
import SettingsPanel from "@/components/SettingsPanel";
import type { ConversationAnimation } from "@/lib/conversationTree";
import type { ConversationVoice } from "@/lib/conversationVoice";
import { useCallback, useRef, useState } from "react";

const defaultBgmVolume = 0.55;
const defaultBackgroundVisible = false;
const defaultReflectionResolution = 128;

export default function Home() {
  const [mode, setMode] = useState<"voice" | "ai">("voice");
  const [aiBusy, setAiBusy] = useState(false);
  const [bgmVolume, setBgmVolume] = useState(defaultBgmVolume);
  const voiceRef = useRef<ConversationVoice | null>(null);
  const [backgroundVisible, setBackgroundVisible] = useState(
    defaultBackgroundVisible,
  );
  const [conversationAnimation, setConversationAnimation] =
    useState<ConversationAnimation>("idle");
  const [conversationAnimationNonce, setConversationAnimationNonce] =
    useState(0);
  const [reflectionResolution, setReflectionResolution] = useState(
    defaultReflectionResolution,
  );

  const requestConversationAnimation = useCallback((animation: ConversationAnimation) => {
    setConversationAnimation(animation);
    setConversationAnimationNonce((value) => value + 1);
  }, []);

  return (
    <main className="viewerShell">
      <section className="stage">
        <CharacterCanvas
          conversationBusy={aiBusy}
          voiceRef={voiceRef}
          backgroundVisible={backgroundVisible}
          conversationAnimation={conversationAnimation}
          conversationAnimationNonce={conversationAnimationNonce}
          reflectionResolution={reflectionResolution}
        />
        <div className="conversationModeSwitch" role="group" aria-label="会話モード">
          <button type="button" aria-pressed={mode === "voice"} onClick={() => setMode("voice")}>ボイス会話</button>
          <button type="button" aria-pressed={mode === "ai"} onClick={() => { voiceRef.current?.stop(); setMode("ai"); }}>AIモード</button>
        </div>
        <div hidden={mode !== "voice"}>
          <ConversationPanel
            active={mode === "voice"}
            onAnimationRequest={requestConversationAnimation}
            voiceRef={voiceRef}
          />
        </div>
        <div hidden={mode !== "ai"}>
          <AIChatPanel active={mode === "ai"} onAnimationRequest={requestConversationAnimation} onBusyChange={setAiBusy} />
        </div>
        <SettingsPanel
          backgroundVisible={backgroundVisible}
          bgmVolume={bgmVolume}
          onBackgroundVisibleChange={setBackgroundVisible}
          onBgmVolumeChange={setBgmVolume}
          onReflectionResolutionChange={setReflectionResolution}
          reflectionResolution={reflectionResolution}
        />
        <BGMPlayer volume={bgmVolume} />
      </section>
    </main>
  );
}
