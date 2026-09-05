export type VoiceStatus = "idle" | "loading" | "playing" | "blocked" | "error";
export type VoiceEnvelope = { fps: number; samples: number[] };

/** One active clip at a time, including rapid choices and pending play promises. */
export class ConversationVoice {
  private audio: HTMLAudioElement | null = null;
  private request = 0;
  private envelope?: VoiceEnvelope;

  mouthOpen(): number {
    if (!this.audio || this.audio.paused || this.audio.ended || !this.envelope) return 0;
    const position = this.audio.currentTime * this.envelope.fps;
    const index = Math.floor(position);
    const current = this.envelope.samples[index] ?? 0;
    const next = this.envelope.samples[index + 1] ?? 0;
    return current + (next - current) * (position - index);
  }

  constructor(
    private readonly createAudio: () => HTMLAudioElement,
    private readonly onStatus: (status: VoiceStatus) => void,
  ) {}

  stop() {
    this.request += 1;
    this.envelope = undefined;
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
