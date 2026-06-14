"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const tracks = [
  "/music/bgm1.mp3",
  "/music/bgm2.mp3",
  "/music/bgm3.mp3",
  "/music/bgm4.mp3",
];

function getNextDelayMs() {
  return (5 + Math.random() * 15) * 1000;
}

export default function BGMPlayer() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const timeout = useRef<number | null>(null);
  const trackIndex = useRef(0);
  const [blocked, setBlocked] = useState(false);

  const clearNextTimer = useCallback(() => {
    if (timeout.current !== null) {
      window.clearTimeout(timeout.current);
      timeout.current = null;
    }
  }, []);

  const playTrack = useCallback(
    async (index: number) => {
      clearNextTimer();

      const currentAudio = audio.current;

      if (!currentAudio) {
        return;
      }

      trackIndex.current = index;
      currentAudio.src = tracks[index];
      currentAudio.currentTime = 0;
      currentAudio.volume = 0.55;

      try {
        await currentAudio.play();
        setBlocked(false);
      } catch {
        setBlocked(true);
      }
    },
    [clearNextTimer],
  );

  const playNextAfterDelay = useCallback(() => {
    clearNextTimer();
    timeout.current = window.setTimeout(() => {
      const nextIndex = (trackIndex.current + 1) % tracks.length;
      void playTrack(nextIndex);
    }, getNextDelayMs());
  }, [clearNextTimer, playTrack]);

  useEffect(() => {
    const currentAudio = new Audio();
    currentAudio.autoplay = true;
    currentAudio.preload = "auto";
    audio.current = currentAudio;

    currentAudio.addEventListener("ended", playNextAfterDelay);
    void playTrack(0);

    return () => {
      clearNextTimer();
      currentAudio.pause();
      currentAudio.removeEventListener("ended", playNextAfterDelay);
      audio.current = null;
    };
  }, [clearNextTimer, playNextAfterDelay, playTrack]);

  useEffect(() => {
    if (!blocked) {
      return;
    }

    const resume = () => {
      void playTrack(trackIndex.current);
    };

    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });
    window.addEventListener("touchstart", resume, { once: true });

    return () => {
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
      window.removeEventListener("touchstart", resume);
    };
  }, [blocked, playTrack]);

  return null;
}
