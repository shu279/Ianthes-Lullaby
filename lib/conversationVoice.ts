export type VoiceStatus = "idle" | "loading" | "playing" | "blocked" | "error";
export type VoiceEnvelope = { fps: number; samples: number[] };
type SpeechQueue = {
  endpoint: string;
  context: AudioContext | null;
  abort: AbortController;
  pending: string[];
  ready: { buffer: AudioBuffer; envelope: VoiceEnvelope }[];
  generating: boolean;
  finished: boolean;
  failure?: { status: "error" | "blocked"; message?: string };
};

/** Derive lip movement from the generated audio, including its silent pauses. */
export function speechEnvelope(buffer: AudioBuffer): VoiceEnvelope {
  const fps = 50;
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  const samples = [];
  let peak = 0.06;
  for (let frame = 0; frame < Math.ceil(buffer.duration * fps); frame++) {
    const start = Math.floor(frame * buffer.sampleRate / fps);
    const end = Math.min(buffer.length, Math.floor((frame + 1) * buffer.sampleRate / fps));
    let energy = 0;
    for (const channel of channels) {
      for (let index = start; index < end; index++) energy += channel[index] ** 2;
    }
    const rms = Math.sqrt(energy / Math.max(1, (end - start) * channels.length));
    peak = Math.max(peak, rms);
    samples.push(rms);
  }
  return { fps, samples: samples.map(rms => rms < 0.008 ? 0 : Math.min(0.85, rms / peak * 0.85)) };
}

/** Play generated speech in order and discard canceled replies. */
export class ConversationVoice {
  private envelope?: VoiceEnvelope;
  private context: AudioContext | null = null;
  private contextReady: Promise<boolean> = Promise.resolve(false);
  private reaction: AudioBufferSourceNode | null = null;
  private reactionStart = 0;
  private speechQueue: SpeechQueue | null = null;

  mouthOpen(): number {
    if (!this.envelope || !this.reaction || this.context?.state !== "running") return 0;
    const time = this.context.currentTime - this.reactionStart;
    const position = time * this.envelope.fps;
    const index = Math.floor(position);
    const current = this.envelope.samples[index] ?? 0;
    const next = this.envelope.samples[index + 1] ?? 0;
    return current + (next - current) * (position - index);
  }

  constructor(
    private readonly onStatus: (status: VoiceStatus, message?: string) => void,
    private readonly createContext: () => AudioContext = () => new AudioContext(),
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  /** Resume from the Send gesture, before waiting for the AI network response. */
  prepareAudio() {
    try {
      const context = this.context ??= this.createContext();
      this.contextReady = context.resume().then(() => context.state === "running", () => false);
    } catch {
      this.contextReady = Promise.resolve(false);
    }
  }

  private async loadSpeech(context: AudioContext, endpoint: string, text: string, signal: AbortSignal) {
    const fetcher = this.fetcher;
    const response = await fetcher(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }), signal: AbortSignal.any([signal, AbortSignal.timeout(70_000)]),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(typeof error?.error === "string" ? error.error : "音声を生成できませんでした。");
    }
    if (!response.headers.get("Content-Type")?.startsWith("audio/")) throw new Error("音声を読み取れませんでした。");
    return context.decodeAudioData(await response.arrayBuffer());
  }

  /** Accept completed lines while Gemini is still streaming; prefetch one clip ahead. */
  beginSpeech(endpoint: string) {
    this.stop();
    const queue: SpeechQueue = {
      endpoint, context: this.context, abort: new AbortController(),
      pending: [], ready: [], generating: false, finished: false,
    };
    this.speechQueue = queue;
    return {
      enqueue: (text: string) => {
        if (this.speechQueue !== queue || queue.finished || !text.trim()) return;
        queue.pending.push(text);
        void this.fillSpeechQueue(queue);
      },
      finish: () => {
        if (this.speechQueue !== queue) return;
        queue.finished = true;
        this.advanceSpeechQueue(queue);
      },
    };
  }

  private async fillSpeechQueue(queue: SpeechQueue) {
    if (this.speechQueue !== queue || queue.generating || !queue.pending.length || queue.ready.length) return;
    queue.generating = true;
    if (!this.reaction) this.onStatus("loading");
    try {
      const ready = await this.contextReady;
      if (this.speechQueue !== queue) return;
      if (!ready || queue.context?.state !== "running") {
        queue.failure = { status: "blocked" };
        throw new Error("Playback blocked");
      }
      while (this.speechQueue === queue && queue.pending.length && !queue.ready.length) {
        const buffer = await this.loadSpeech(queue.context, queue.endpoint, queue.pending.shift()!, queue.abort.signal);
        if (this.speechQueue !== queue) return;
        queue.ready.push({ buffer, envelope: speechEnvelope(buffer) });
        this.advanceSpeechQueue(queue);
      }
    } catch (error) {
      if (this.speechQueue !== queue) return;
      queue.failure ??= { status: "error", message: error instanceof Error && error.name !== "TimeoutError"
        ? error.message : "音声の準備に時間がかかっています。次の会話で再試行します。" };
      queue.pending = [];
      queue.ready = [];
      queue.finished = true;
      queue.abort.abort();
    } finally {
      queue.generating = false;
      this.advanceSpeechQueue(queue);
    }
  }

  private advanceSpeechQueue(queue: SpeechQueue) {
    if (this.speechQueue !== queue || this.reaction) return;
    const clip = queue.ready.shift();
    const context = queue.context;
    if (clip && context?.state === "running") {
      const source = context.createBufferSource();
      source.buffer = clip.buffer;
      source.connect(context.destination);
      source.onended = () => {
        if (this.speechQueue !== queue || this.reaction !== source) return;
        source.disconnect();
        this.reaction = null;
        this.envelope = undefined;
        this.advanceSpeechQueue(queue);
        void this.fillSpeechQueue(queue);
      };
      this.envelope = clip.envelope;
      this.reactionStart = context.currentTime;
      try { source.start(); }
      catch {
        source.disconnect();
        this.stop();
        this.onStatus("error", "音声を再生できませんでした。次の送信時に再試行します。");
        return;
      }
      this.reaction = source;
      this.onStatus("playing");
      return;
    }
    if (clip) {
      queue.failure = { status: "blocked" };
      queue.pending = [];
      queue.ready = [];
      queue.finished = true;
      queue.abort.abort();
    }
    if (queue.failure || (queue.finished && !queue.generating && !queue.pending.length)) {
      this.speechQueue = null;
      this.envelope = undefined;
      this.onStatus(queue.failure?.status ?? "idle", queue.failure?.message);
    } else {
      this.onStatus("loading");
    }
  }

  dispose() {
    this.stop();
    if (this.context) void this.context.close().catch(() => {});
    this.context = null;
  }

  stop() {
    this.speechQueue?.abort.abort();
    this.speechQueue = null;
    this.envelope = undefined;
    if (this.reaction) {
      this.reaction.onended = null;
      this.reaction.stop();
      this.reaction.disconnect();
      this.reaction = null;
    }
    this.onStatus("idle");
  }

}
