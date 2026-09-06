import chatAnimations from "./chatAnimations.json";

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ChatAnimation = keyof typeof chatAnimations;

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

export async function streamChat({ endpoint, messages, signal, onText, onAnimation, onSpeech, onSpeechChunk, speech, delay = 22, fetcher = fetch }: {
  endpoint: string;
  messages: ChatMessage[];
  signal: AbortSignal;
  onText: (text: string) => void;
  onAnimation: (animation: ChatAnimation) => void;
  onSpeech?: (enabled: boolean) => void;
  onSpeechChunk?: (text: string) => void;
  speech?: 'voicevox';
  delay?: number;
  fetcher?: typeof fetch;
}): Promise<string> {
  const response = await fetcher(endpoint, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, ...(speech ? { speech } : {}) }), signal,
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
  let receivedReply = "";
  let typing = Promise.resolve();
  const displayAbort = new AbortController();
  const activeSignal = AbortSignal.any([signal, displayAbort.signal]);
  const cancelReader = () => { void reader.cancel().catch(() => {}); };
  activeSignal.addEventListener("abort", cancelReader, { once: true });
  let done = false;
  let speechReceived = false;
  let speechEnabled = false;
  let speechBuffer = "";
  let speechChunks = 0;
  function emitSpeech(text: string) {
    const content = text.trim();
    if (!content || !/[\p{L}\p{N}]/u.test(content)) return;
    activeSignal.throwIfAborted();
    speechChunks++;
    onSpeechChunk?.(content);
  }
  function collectSpeech(text: string) {
    if (!speechEnabled || !onSpeechChunk) return;
    speechBuffer += text;
    // Keep at most six requests per reply; unusually fragmented tails are grouped.
    while (speechChunks < 5) {
      const boundary = /[。！？!?\n]+[」』）】”’"]*/u.exec(speechBuffer);
      if (!boundary) break;
      const end = boundary.index + boundary[0].length;
      const content = speechBuffer.slice(0, end);
      speechBuffer = speechBuffer.slice(end);
      emitSpeech(content);
    }
  }
  function displayText(text: string) {
    // Reading the network must not wait for the character-by-character display.
    typing = typing.then(async () => {
      for (const character of Array.from(text)) {
        activeSignal.throwIfAborted();
        reply += character;
        onText(reply);
        activeSignal.throwIfAborted();
        if (delay) await wait(delay, activeSignal);
      }
    }).catch(error => { displayAbort.abort(error); });
  }
  try {
    while (!done) {
      activeSignal.throwIfAborted();
      const chunk = await reader.read();
      activeSignal.throwIfAborted();
      buffer += chunk.done ? decoder.decode() : decoder.decode(chunk.value, { stream: true });
      if (buffer.length > 20_000) throw new Error("AIの応答が長すぎます。");
      if (chunk.done && buffer.trim()) buffer += "\n";
      let end;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end).trim();
        buffer = buffer.slice(end + 1);
        if (!line) continue;
        activeSignal.throwIfAborted();
        const event = JSON.parse(line);
        if (event.type === "speech" && !speechReceived && !receivedReply && typeof event.enabled === "boolean") {
          speechReceived = true;
          speechEnabled = event.enabled;
          onSpeech?.(event.enabled);
        } else if (event.type === "animation" && typeof event.animation === "string" && Object.hasOwn(chatAnimations, event.animation)) {
          onAnimation(event.animation as ChatAnimation);
        } else if (event.type === "text" && typeof event.text === "string") {
          if (receivedReply.length + event.text.length > 1200) throw new Error("AIの応答が長すぎます。");
          receivedReply += event.text;
          // Start synthesis as soon as a complete line arrives, ahead of the typewriter.
          collectSpeech(event.text);
          displayText(event.text);
        } else if (event.type === "error") {
          throw new Error(typeof event.message === "string" ? event.message : "返事が途中で止まりました。");
        } else if (event.type === "done") { done = true; break; }
      }
      if (chunk.done) break;
    }
    if (!done || !receivedReply.trim()) throw new Error("返事が途中で止まりました。もう一度お試しください。");
    if (speechEnabled && onSpeechChunk) emitSpeech(speechBuffer);
    await typing;
    activeSignal.throwIfAborted();
    return reply;
  } finally {
    displayAbort.abort();
    activeSignal.removeEventListener("abort", cancelReader);
    await reader.cancel().catch(() => {});
    await typing;
    reader.releaseLock();
  }
}
