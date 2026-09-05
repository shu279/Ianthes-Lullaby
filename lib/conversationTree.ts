export type ConversationAnimation = "idle" | "surprise" | "laugh";

export type ConversationNodeId =
  | "start" | "check_in" | "free_time" | "her_day" | "sleepy"
  | "busy_day" | "lazy_day" | "only_visitor" | "you_too"
  | "tuck_in" | "drowsy" | "quiet";

export type ConversationChoice = {
  label: string;
  next: ConversationNodeId;
};

export type ConversationNode = {
  id: ConversationNodeId;
  reply: string;
  animation: ConversationAnimation;
  voice?: `/voice/${string}.wav`;
  choices: ConversationChoice[];
  sleepRedirect?: boolean;
};

// Spoken replies follow the supplied recordings. Parentheses mark silent narration.
export const conversationTree: Record<ConversationNodeId, ConversationNode> = {
  start: {
    id: "start",
    reply: "あら、こんばんは。",
    animation: "idle",
    voice: "/voice/001.wav",
    choices: [{ label: "こんばんは。ちょっとお邪魔してもいい？", next: "check_in" }],
  },
  check_in: {
    id: "check_in",
    reply: "今日はどうしたのかしら？",
    animation: "idle",
    voice: "/voice/002.wav",
    choices: [
      { label: "暇だったから、話しに来た", next: "free_time" },
      { label: "眠れなくて。", next: "tuck_in" },
    ],
  },
  free_time: {
    id: "free_time",
    reply: "奇遇ね。私もちょうど暇してたのよ。",
    animation: "laugh",
    voice: "/voice/003.wav",
    choices: [
      { label: "今日は何をしてたの？", next: "her_day" },
    ],
  },
  her_day: {
    id: "her_day",
    reply: "今日はちょっと忙しかったかも。あなたは何してたのかしら？",
    animation: "idle",
    voice: "/voice/004.wav",
    choices: [
      { label: "勉強や仕事を頑張ってた", next: "busy_day" },
      { label: "好きなことをして過ごしてた", next: "busy_day" },
      { label: "特になにもしなかった", next: "lazy_day" },
    ],
  },
  busy_day: {
    id: "busy_day",
    reply: "ふーん。まあぼーっとしてるよりはいいかもね。",
    animation: "idle",
    voice: "/voice/006.wav",
    choices: [
      { label: "そっちは、まだ眠くない？", next: "sleepy" },
      { label: "誰かと遊んだりした？", next: "only_visitor" },
    ],
  },
  lazy_day: {
    id: "lazy_day",
    reply: "ちょっとは何かやったら？",
    animation: "surprise",
    voice: "/voice/007.wav",
    choices: [
      { label: "厳しいね", next: "sleepy" },
      { label: "そうだね", next: "sleepy" },
    ],
  },
  only_visitor: {
    id: "only_visitor",
    reply: "ここにはあなたぐらいしか来る人がいないのよ。",
    animation: "idle",
    voice: "/voice/008.wav",
    choices: [
      { label: "そうなんだ", next: "her_day" },
      { label: "さみしくないの？", next: "tuck_in" },
    ],
  },
  sleepy: {
    id: "sleepy",
    reply: "ちょっと眠くなってきちゃった。",
    animation: "idle",
    voice: "/voice/005.wav",
    choices: [
      { label: "私も、眠くなってきた", next: "you_too" },
      { label: "私はまだ眠れない。寝かしつけて？", next: "tuck_in" },
      { label: "無理しないで。おやすみ", next: "drowsy" },
    ],
  },
  you_too: {
    id: "you_too",
    reply: "あなたも？",
    animation: "surprise",
    voice: "/voice/009.wav",
    choices: [
      { label: "うん。寝かしつけてくれる？", next: "tuck_in" },
      { label: "うん、一緒に休もう", next: "drowsy" },
    ],
  },
  tuck_in: {
    id: "tuck_in",
    reply: "私が寝かしつけてあげる。",
    animation: "idle",
    voice: "/voice/010.wav",
    sleepRedirect: true,
    choices: [
      { label: "ありがとう", next: "drowsy" },
      { label: "うん", next: "quiet" },
    ],
  },
  drowsy: {
    id: "drowsy",
    reply: "んー。",
    animation: "idle",
    voice: "/voice/011.wav",
    sleepRedirect: true,
    choices: [{ label: "...", next: "quiet" }],
  },
  quiet: {
    id: "quiet",
    reply: "...",
    animation: "idle",
    sleepRedirect: true,
    choices: [{ label: "もう少し話しかける", next: "check_in" }],
  },
};

export const initialConversationNodeId: ConversationNodeId = "start";
