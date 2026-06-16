"use client";

import { useMemo, useState } from "react";
import {
  conversationTree,
  initialConversationNodeId,
  type ConversationAnimation,
  type ConversationNodeId,
} from "@/lib/conversationTree";

type ConversationPanelProps = {
  onAnimationRequest: (animation: ConversationAnimation) => void;
};

export default function ConversationPanel({
  onAnimationRequest,
}: ConversationPanelProps) {
  const [currentNodeId, setCurrentNodeId] = useState<ConversationNodeId>(
    initialConversationNodeId,
  );
  const [turnCount, setTurnCount] = useState(0);
  const currentNode = conversationTree[currentNodeId];
  const shouldSuggestSleep = turnCount >= 4 && !currentNode.sleepRedirect;

  const choices = useMemo(() => {
    if (!shouldSuggestSleep) {
      return currentNode.choices;
    }

    return [
      { label: "もう休む", next: "sleep_redirect" as ConversationNodeId },
      ...currentNode.choices.slice(0, 2),
    ];
  }, [currentNode.choices, shouldSuggestSleep]);

  function choose(nextNodeId: ConversationNodeId) {
    const nextNode = conversationTree[nextNodeId];

    setCurrentNodeId(nextNodeId);
    setTurnCount((value) => (nextNodeId === "start" ? 0 : value + 1));
    onAnimationRequest(nextNode.animation);
  }

  return (
    <aside className="conversationPanel" aria-live="polite">
      <p className="conversationReply">{currentNode.reply}</p>

      <div className="choiceList">
        {choices.map((choice) => (
          <button
            key={`${currentNode.id}-${choice.label}-${choice.next}`}
            type="button"
            onClick={() => choose(choice.next)}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </aside>
  );
}
