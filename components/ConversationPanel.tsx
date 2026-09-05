"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { assetPath } from "@/lib/assetPath";
import { ConversationVoice, type VoiceStatus } from "@/lib/conversationVoice";
import {
  conversationTree,
  initialConversationNodeId,
  type ConversationAnimation,
  type ConversationNodeId,
} from "@/lib/conversationTree";

type ConversationPanelProps = {
  onAnimationRequest: (animation: ConversationAnimation) => void;
  onSpeakingChange: (speaking: boolean) => void;
};

export default function ConversationPanel({
  onAnimationRequest,
  onSpeakingChange,
}: ConversationPanelProps) {
  const [currentNodeId, setCurrentNodeId] = useState<ConversationNodeId>(
    initialConversationNodeId,
  );
  const [started, setStarted] = useState(false);
  const [muted, setMuted] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const player = useRef<ConversationVoice | null>(null);
  const currentNode = conversationTree[currentNodeId];

  const updateVoiceStatus = useCallback((status: VoiceStatus) => {
    setVoiceStatus(status);
    onSpeakingChange(status === "loading" || status === "playing");
  }, [onSpeakingChange]);

  useEffect(() => {
    const voice = new ConversationVoice(() => new Audio(), updateVoiceStatus);
    player.current = voice;
    const onVisibilityChange = () => {
      if (document.hidden) voice.stop();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      voice.stop();
      player.current = null;
    };
  }, [updateVoiceStatus]);

  function playNode(nodeId: ConversationNodeId) {
    const node = conversationTree[nodeId];
    if (muted || !node.voice) {
      player.current?.stop();
      return;
    }
    // Called directly from a click so browser autoplay restrictions are respected.
    void player.current?.play(assetPath(node.voice));
  }

  function choose(nextNodeId: ConversationNodeId) {
    setCurrentNodeId(nextNodeId);
    onAnimationRequest(conversationTree[nextNodeId].animation);
    playNode(nextNodeId);
  }

  function begin() {
    setStarted(true);
    playNode(initialConversationNodeId);
  }

  function toggleMuted() {
    if (!muted) player.current?.stop();
    setMuted((value) => !value);
  }

  return (
    <aside className="conversationPanel" aria-label="イアンテとの会話">
      <p className="conversationReply" aria-live="polite">
        {started ? currentNode.reply : "夜のひとときを、イアンテと。"}
      </p>
      <div className="choiceList">
        {started ? currentNode.choices.map((choice) => (
          <button
            key={`${currentNode.id}-${choice.label}-${choice.next}`}
            type="button"
            onClick={() => choose(choice.next)}
          >
            {choice.label}
          </button>
        )) : <button type="button" onClick={begin}>話しかける</button>}
      </div>
      <div className="voiceControls">
        <button type="button" onClick={toggleMuted} aria-pressed={muted}>
          {muted ? "ボイス：オフ" : "ボイス：オン"}
        </button>
        {started && currentNode.voice && !muted && (
          <button type="button" onClick={() => playNode(currentNodeId)}>
            もう一度聞く
          </button>
        )}
        {voiceStatus === "playing" && (
          <button type="button" onClick={() => player.current?.stop()}>声を止める</button>
        )}
        <span role="status">
          {voiceStatus === "blocked" ? "「もう一度聞く」を押すと声が流れます。"
            : voiceStatus === "error" ? "音声を読み込めませんでした。もう一度お試しください。"
            : voiceStatus === "loading" ? "声を準備しています…" : ""}
        </span>
      </div>
    </aside>
  );
}
