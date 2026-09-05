import aiVoices from "./aiVoices.json";

export type ChatVoice = keyof typeof aiVoices;
export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ChatAnimation = "idle" | "laugh" | "surprise";

export function recentHistory(history: ChatMessage[], content: string): ChatMessage[] {
  const messages = history.slice(-16);
  while (messages.length && messages.reduce((sum, message) => sum + message.content.length, content.length) > 8000) {
    messages.splice(0, 2);
  }
  return [...messages, { role: "user", content }];
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException("Aborted", "AbortError")); return; }
    const abort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}

export async function streamChat({ endpoint, messages, signal, onText, onAnimation, onVoice, delay = 22, fetcher = fetch }: {
  endpoint: string;
  messages: ChatMessage[];
  signal: AbortSignal;
  onText: (text: string) => void;
  onAnimation: (animation: ChatAnimation) => void;
  onVoice?: (voice: ChatVoice) => void;
  delay?: number;
  fetcher?: typeof fetch;
}): Promise<string> {
  const response = await fetcher(endpoint, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }), signal,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(typeof error?.error === "string" ? error.error : "AIに接続できませんでした。");
  }
  if (!response.body || !response.headers.get("Content-Type")?.includes("application/x-ndjson")) {
    throw new Error("AIの応答を読み取れませんでした。");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let reply = "";
  let done = false;
  let voice: ChatVoice | undefined;
  let voiceStarted = false;
  try {
    while (!done) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      buffer += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
      if (buffer.length > 20_000) throw new Error("AIの応答が長すぎます。");
      if (chunk.done && buffer.trim()) buffer += "\n";
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end).trim();
        buffer = buffer.slice(end + 1);
        if (!line) continue;
        signal.throwIfAborted();
        const event = JSON.parse(line);
        if (event.type === "animation" && ["idle", "laugh", "surprise"].includes(event.animation)) {
          onAnimation(event.animation);
        } else if (event.type === "voice" && !voiceStarted && !voice && typeof event.voice === "string" && Object.hasOwn(aiVoices, event.voice)) {
          voice = event.voice as ChatVoice;
        } else if (event.type === "text" && typeof event.text === "string") {
          for (const character of Array.from(event.text)) {
            signal.throwIfAborted();
            reply += character;
            if (reply.length > 1200) throw new Error("AIの応答が長すぎます。");
            onText(reply);
            if (!voiceStarted && reply.trim()) {
              voiceStarted = true;
              signal.throwIfAborted();
              if (voice) onVoice?.(voice);
            }
            if (delay) await wait(delay, signal);
          }
        } else if (event.type === "error") {
          throw new Error(typeof event.message === "string" ? event.message : "返事が途中で止まりました。");
        } else if (event.type === "done") { done = true; break; }
      }
      if (chunk.done) break;
    }
    if (!done || !reply.trim()) throw new Error("返事が途中で止まりました。もう一度お試しください。");
    return reply;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
