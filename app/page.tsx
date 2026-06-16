"use client";

import BGMPlayer from "@/components/BGMPlayer";
import CharacterCanvas from "@/components/CharacterCanvas";
import ConversationPanel from "@/components/ConversationPanel";
import SettingsPanel from "@/components/SettingsPanel";
import type { ConversationAnimation } from "@/lib/conversationTree";
import { useState } from "react";

const defaultBgmVolume = 0.55;
const defaultBackgroundVisible = false;
const defaultReflectionResolution = 128;

export default function Home() {
  const [bgmVolume, setBgmVolume] = useState(defaultBgmVolume);
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

  function requestConversationAnimation(animation: ConversationAnimation) {
    setConversationAnimation(animation);
    setConversationAnimationNonce((value) => value + 1);
  }

  return (
    <main className="viewerShell">
      <section className="stage">
        <CharacterCanvas
          backgroundVisible={backgroundVisible}
          conversationAnimation={conversationAnimation}
          conversationAnimationNonce={conversationAnimationNonce}
          reflectionResolution={reflectionResolution}
        />
        <ConversationPanel
          onAnimationRequest={requestConversationAnimation}
        />
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
