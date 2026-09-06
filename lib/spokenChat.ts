import { streamChat, type ChatAnimation, type ChatMessage } from "./aiChat";
import type { ConversationVoice } from "./conversationVoice";

/** Keep received text private until its own audio starts; retain a text-only fallback. */
export async function streamSpokenChat({ endpoint, speechEndpoint, messages, signal, voice, onText, onAnimation, fetcher }: {
  endpoint: string;
  speechEndpoint: string;
  messages: ChatMessage[];
  signal: AbortSignal;
  voice: Pick<ConversationVoice, "beginSpeech"> | null;
  onText: (text: string) => void;
  onAnimation: (animation: ChatAnimation) => void;
  fetcher?: typeof fetch;
}) {
  signal.throwIfAborted();
  let received = "";
  let shown = "";
  let speechEnabled = false;
  let fallback = !voice;
  let animation: ChatAnimation | undefined;
  const showAnimation = () => {
    if (animation) { onAnimation(animation); animation = undefined; }
  };
  const queue = voice?.beginSpeech(speechEndpoint, {
    onStart(text) {
      if (signal.aborted || fallback) return;
      shown += (shown ? "\n" : "") + text;
      showAnimation();
      onText(shown);
    },
    onSettled(result) {
      if (signal.aborted || result === "complete") return;
      fallback = true;
      showAnimation();
      onText(received);
    },
  });
  const cancel = () => queue?.cancel();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const reply = await streamChat({ endpoint, messages, signal, speech: "voicevox", delay: 0, fetcher,
      onSpeech(enabled) { speechEnabled = enabled; },
      onAnimation(value) {
        animation = value;
        if (!speechEnabled || fallback) showAnimation();
      },
      onText(text) {
        received = text;
        if (!speechEnabled || fallback) onText(text);
      },
      onSpeechChunk(text) { if (!fallback) queue?.enqueue(text); },
    });
    await queue?.finish();
    signal.throwIfAborted();
    return reply;
  } finally {
    signal.removeEventListener("abort", cancel);
    queue?.cancel();
  }
}
