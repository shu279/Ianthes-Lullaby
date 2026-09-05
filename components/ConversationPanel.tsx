"use client";

import { useEffect, useState, type RefObject } from "react";
import voiceEnvelopes from "@/lib/voiceEnvelopes.json";
import { assetPath } from "@/lib/assetPath";
import { ConversationVoice, type VoiceStatus } from "@/lib/conversationVoice";
import {
  conversationTree,
  initialConversationNodeId,
  type ConversationAnimation,
  type ConversationNodeId,
} from "@/lib/conversationTree";

type ConversationPanelProps = {
  active: boolean;
  onAnimationRequest: (animation: ConversationAnimation) => void;
  voiceRef: RefObject<ConversationVoice | null>;
};

export default function ConversationPanel({
  active,
  onAnimationRequest,
  voiceRef,
}: ConversationPanelProps) {
  const [currentNodeId, setCurrentNodeId] = useState<ConversationNodeId>(
    initialConversationNodeId,
  );
  const [started, setStarted] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const player = voiceRef;
  const currentNode = conversationTree[currentNodeId];

  useEffect(() => {
    const voice = new ConversationVoice(() => new Audio(), setVoiceStatus);
    player.current = voice;
    const onVisibilityChange = () => {
      if (document.hidden) voice.stop();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      voice.dispose();
      player.current = null;
    };
  }, [player]);

  useEffect(() => {
    if (!active) player.current?.stop();
  }, [active, player]);

  function playNode(nodeId: ConversationNodeId) {
    const node = conversationTree[nodeId];
    if (!node.voice) {
      player.current?.stop();
      return;
    }
    // Called directly from a click so browser autoplay restrictions are respected.
    void player.current?.play(assetPath(node.voice), voiceEnvelopes[node.voice as keyof typeof voiceEnvelopes]);
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

  return (
    <aside className="conversationPanel" aria-label="イアンセとチャットする">
      <p className="conversationReply" aria-live="polite">
        {started ? currentNode.reply : " "}
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
      {(voiceStatus === "blocked" || voiceStatus === "error") && (
        <p className="voiceStatus" role="status">
          音声を再生できませんでした。会話はそのまま続けられます。
        </p>
      )}
    </aside>
  );
}
