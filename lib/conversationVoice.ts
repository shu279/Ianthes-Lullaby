export type VoiceStatus = "idle" | "loading" | "playing" | "blocked" | "error";

/** One active clip at a time, including rapid choices and pending play promises. */
export class ConversationVoice {
  private audio: HTMLAudioElement | null = null;
  private request = 0;

  constructor(
    private readonly createAudio: () => HTMLAudioElement,
    private readonly onStatus: (status: VoiceStatus) => void,
  ) {}

  stop() {
    this.request += 1;
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

  async play(url: string) {
    this.stop();
    const request = this.request;
    const audio = this.createAudio();
    this.audio = audio;
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
