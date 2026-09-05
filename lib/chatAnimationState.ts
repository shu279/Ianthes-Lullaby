import type { ChatAnimation } from "./aiChat";

export type ChatAnimationState = {
  animation: ChatAnimation;
  sleep: "awake" | "entering" | "asleep" | "waking";
  queued: ChatAnimation | null;
  playId: number;
  opening: boolean;
};

export type ChatAnimationEvent =
  | { type: "request"; animation: ChatAnimation }
  | { type: "idleTimeout" }
  | { type: "finished"; playId: number };

export const initialChatAnimationState: ChatAnimationState = {
  animation: "intro", sleep: "awake", queued: null, playId: 0, opening: true,
};

function play(state: ChatAnimationState, animation: ChatAnimation, queued: ChatAnimation | null = null): ChatAnimationState {
  return {
    animation,
    sleep: animation === "sleepIn" ? "entering" : animation === "sleepOut" ? "waking" : "awake",
    queued, playId: state.playId + 1, opening: false,
  };
}

/** Route requests through the sleeping/waking clips and ignore stale completions. */
export function chatAnimationReducer(state: ChatAnimationState, event: ChatAnimationEvent): ChatAnimationState {
  if (event.type === "idleTimeout") {
    return state.sleep === "awake" && state.animation === "idle" ? play(state, "sleepIn") : state;
  }
  if (event.type === "finished") {
    if (event.playId !== state.playId || state.animation === "idle" || state.sleep === "asleep") return state;
    if (state.sleep === "entering") return { ...state, sleep: "asleep" };
    if (state.sleep === "waking") return play(state, state.queued ?? "idle");
    return play(state, "idle");
  }
  const animation = event.animation;
  if (state.sleep === "waking") {
    return { ...state, queued: animation === "sleepOut" ? null : animation };
  }
  if (state.sleep === "entering" || state.sleep === "asleep") {
    if (animation === "sleepIn") return state;
    return play(state, "sleepOut", animation === "sleepOut" ? null : animation);
  }
  return play(state, animation);
}
