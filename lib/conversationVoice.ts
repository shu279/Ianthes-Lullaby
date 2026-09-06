export type VoiceStatus = "idle" | "loading" | "playing" | "blocked" | "error";
export type VoiceEnvelope = { fps: number; samples: number[] };

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

/** One active clip at a time, including rapid choices and pending play promises. */
export class ConversationVoice {
  private audio: HTMLAudioElement | null = null;
  private request = 0;
  private envelope?: VoiceEnvelope;
  private context: AudioContext | null = null;
  private contextReady: Promise<boolean> = Promise.resolve(false);
  private reaction: AudioBufferSourceNode | null = null;
  private reactionStart = 0;
  private buffers = new Map<string, Promise<AudioBuffer>>();
  private speechAbort: AbortController | null = null;

  mouthOpen(): number {
    if (!this.envelope) return 0;
    let time: number;
    if (this.reaction && this.context?.state === "running") {
      time = this.context.currentTime - this.reactionStart;
    } else if (this.audio && !this.audio.paused && !this.audio.ended) {
      time = this.audio.currentTime;
    } else {
      return 0;
    }
    const position = time * this.envelope.fps;
    const index = Math.floor(position);
    const current = this.envelope.samples[index] ?? 0;
    const next = this.envelope.samples[index + 1] ?? 0;
    return current + (next - current) * (position - index);
  }

  constructor(
    private readonly createAudio: () => HTMLAudioElement,
    private readonly onStatus: (status: VoiceStatus, message?: string) => void,
    private readonly createContext: () => AudioContext = () => new AudioContext(),
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  /** Resume from the Send gesture, before waiting for the AI network response. */
  prepareReactions(urls: string[]) {
    try {
      const context = this.context ??= this.createContext();
      this.contextReady = context.resume().then(() => context.state === "running", () => false);
      for (const url of urls) void this.loadReaction(url, context).catch(() => {});
    } catch {
      this.contextReady = Promise.resolve(false);
    }
  }

  private loadReaction(url: string, context: AudioContext): Promise<AudioBuffer> {
    const cached = this.buffers.get(url);
    if (cached) return cached;
    // Native browser fetch rejects a ConversationVoice instance as its receiver.
    const fetcher = this.fetcher;
    const pending = fetcher(url).then(async response => {
      if (!response.ok) throw new Error("Voice unavailable");
      return context.decodeAudioData(await response.arrayBuffer());
    }).catch(error => {
      if (this.buffers.get(url) === pending) this.buffers.delete(url);
      throw error;
    });
    this.buffers.set(url, pending);
    return pending;
  }

  /** Short recorded reaction; text generation proceeds even if audio is unavailable. */
  async playReaction(url: string, envelope?: VoiceEnvelope) {
    this.stop();
    const request = this.request;
    const context = this.context;
    if (!context) { this.onStatus("blocked"); return; }
    this.onStatus("loading");
    try {
      const [buffer, ready] = await Promise.all([this.loadReaction(url, context), this.contextReady]);
      if (request !== this.request) return;
      if (!ready || context.state !== "running") { this.onStatus("blocked"); return; }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.onended = () => { if (request === this.request) this.stop(); };
      this.envelope = envelope;
      this.reactionStart = context.currentTime;
      try { source.start(); }
      catch (error) { source.disconnect(); throw error; }
      this.reaction = source;
      this.onStatus("playing");
    } catch {
      if (request !== this.request) return;
      this.stop();
      this.onStatus("error");
    }
  }

  /** Full AI reply via VOICEVOX. Generated speech is never retained in the clip cache. */
  async playSpeech(endpoint: string, text: string) {
    this.stop();
    const request = this.request;
    const context = this.context;
    if (!context) { this.onStatus("blocked"); return; }
    const abort = new AbortController();
    this.speechAbort = abort;
    this.onStatus("loading");
    try {
      const ready = await this.contextReady;
      if (request !== this.request) return;
      if (!ready || context.state !== "running") { this.onStatus("blocked"); return; }
      const fetcher = this.fetcher;
      const response = await fetcher(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }), signal: AbortSignal.any([abort.signal, AbortSignal.timeout(70_000)]),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(typeof error?.error === "string" ? error.error : "音声を生成できませんでした。");
      }
      if (!response.headers.get("Content-Type")?.startsWith("audio/")) throw new Error("音声を読み取れませんでした。");
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      if (request !== this.request) return;
      if (context.state !== "running") { this.onStatus("blocked"); return; }
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.onended = () => { if (request === this.request) this.stop(); };
      this.envelope = speechEnvelope(buffer);
      this.reactionStart = context.currentTime;
      try { source.start(); }
      catch (error) { source.disconnect(); throw error; }
      this.reaction = source;
      this.onStatus("playing");
    } catch (error) {
      if (request !== this.request) return;
      this.stop();
      this.onStatus("error", error instanceof Error && error.name !== "TimeoutError"
        ? error.message : "音声の準備に時間がかかっています。次の会話で再試行します。");
    } finally {
      if (this.speechAbort === abort) this.speechAbort = null;
    }
  }

  dispose() {
    this.stop();
    if (this.context) void this.context.close().catch(() => {});
    this.context = null;
    this.buffers.clear();
  }

  /** A late AI cancellation must not interrupt a newly chosen voiced branch. */
  stopReaction() {
    if (!this.audio) this.stop();
  }

  stop() {
    this.request += 1;
    this.speechAbort?.abort();
    this.speechAbort = null;
    this.envelope = undefined;
    if (this.reaction) {
      this.reaction.onended = null;
      this.reaction.stop();
      this.reaction.disconnect();
      this.reaction = null;
    }
    if (this.audio) {
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio.pause();
      this.audio.removeAttribute("src");
      this.audio.load();
      this.audio = null;
    }
    this.onStatus("idle");
  }

  async play(url: string, envelope?: VoiceEnvelope) {
    this.stop();
    const request = this.request;
    const audio = this.createAudio();
    this.audio = audio;
    this.envelope = envelope;
    audio.src = url;
    audio.volume = 1;
    audio.onended = () => {
      if (request === this.request) this.stop();
    };
    audio.onerror = () => {
      if (request !== this.request) return;
      this.stop();
      this.onStatus("error");
    };
    this.onStatus("loading");
    try {
      await audio.play();
      if (request === this.request) this.onStatus("playing");
    } catch (error) {
      if (request !== this.request) return;
      this.stop();
      this.onStatus(
        error instanceof Error && error.name === "NotAllowedError"
          ? "blocked"
          : "error",
      );
    }
  }
}
