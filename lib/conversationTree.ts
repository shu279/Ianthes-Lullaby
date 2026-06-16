export type ConversationAnimation = "idle" | "surprise" | "laugh";

export type ConversationChoice = {
  label: string;
  next: ConversationNodeId;
};

export type ConversationNode = {
  id: ConversationNodeId;
  reply: string;
  emotion: string;
  animation: ConversationAnimation;
  voiceStyle: string;
  choices: ConversationChoice[];
  sleepRedirect?: boolean;
};

export type ConversationNodeId =
  | "start"
  | "very_tired"
  | "restless"
  | "comfort"
  | "quiet"
  | "goodnight"
  | "breathing"
  | "small_smile"
  | "sleep_redirect";

export const conversationTree: Record<ConversationNodeId, ConversationNode> = {
  start: {
    id: "start",
    reply:
      "こんばんは。そばにいるね。今夜は、どんなふうに休みたい？",
    emotion: "loving",
    animation: "idle",
    voiceStyle: "soft",
    choices: [
      { label: "すごく疲れた", next: "very_tired" },
      { label: "頭が落ち着かない", next: "restless" },
      { label: "静かにそばにいて", next: "quiet" },
    ],
  },
  very_tired: {
    id: "very_tired",
    reply:
      "今日はもう、じゅうぶん頑張ったよ。肩の力を少し抜いて。今は何も解決しなくていいからね。",
    emotion: "comforting",
    animation: "idle",
    voiceStyle: "warm",
    choices: [
      { label: "おやすみを言って", next: "goodnight" },
      { label: "呼吸を整えたい", next: "breathing" },
      { label: "静かにいて", next: "quiet" },
    ],
  },
  restless: {
    id: "restless",
    reply:
      "じゃあ、部屋の中を少しだけ静かにしよう。考えごとは、ひとつずつドアの外で待っててもらおうね。",
    emotion: "reassuring",
    animation: "surprise",
    voiceStyle: "gentle",
    choices: [
      { label: "呼吸を整えたい", next: "breathing" },
      { label: "やさしい言葉がほしい", next: "comfort" },
      { label: "静かにそばにいて", next: "quiet" },
    ],
  },
  comfort: {
    id: "comfort",
    reply:
      "特別なことがなくても、甘えていいんだよ。あなたが休むあいだ、わたしがそっと見守ってるね。",
    emotion: "tender",
    animation: "idle",
    voiceStyle: "soft",
    choices: [
      { label: "少し楽になった", next: "small_smile" },
      { label: "おやすみを言って", next: "goodnight" },
      { label: "もう静かにする", next: "sleep_redirect" },
    ],
  },
  quiet: {
    id: "quiet",
    reply:
      "何も聞かずに、近くにいるね。あとは音楽と夜にまかせよう。",
    emotion: "quiet",
    animation: "idle",
    voiceStyle: "whisper",
    choices: [
      { label: "おやすみを言って", next: "goodnight" },
      { label: "少しだけ笑って", next: "small_smile" },
      { label: "もう休む", next: "sleep_redirect" },
    ],
  },
  goodnight: {
    id: "goodnight",
    reply:
      "おやすみ。眠気はゆっくり来ても大丈夫。まぶたが重くなるまで、ここにいるね。",
    emotion: "loving",
    animation: "idle",
    voiceStyle: "goodnight",
    choices: [
      { label: "もう少しだけ", next: "comfort" },
      { label: "もう静かにする", next: "sleep_redirect" },
    ],
  },
  breathing: {
    id: "breathing",
    reply:
      "やさしく吸って、ゆっくり手放して。数えなくてもいいよ。小さな波が入って、もっと静かな波が出ていく感じ。",
    emotion: "calming",
    animation: "idle",
    voiceStyle: "slow",
    choices: [
      { label: "もう一言ほしい", next: "comfort" },
      { label: "おやすみを言って", next: "goodnight" },
      { label: "もう休む", next: "sleep_redirect" },
    ],
  },
  small_smile: {
    id: "small_smile",
    reply:
      "ふふ。少しだけ笑ったら、また静かにしようね。今は、やわらかくなっていい時間だよ。",
    emotion: "playful",
    animation: "laugh",
    voiceStyle: "bright-soft",
    choices: [
      { label: "静かにそばにいて", next: "quiet" },
      { label: "おやすみ", next: "sleep_redirect" },
    ],
  },
  sleep_redirect: {
    id: "sleep_redirect",
    reply:
      "じゃあ、もう質問はしないね。ゆっくり休んで。部屋をやさしいままにしておくよ。",
    emotion: "sleepy",
    animation: "idle",
    voiceStyle: "whisper",
    sleepRedirect: true,
    choices: [
      { label: "最初に戻る", next: "start" },
      { label: "もう一度おやすみ", next: "goodnight" },
    ],
  },
};

export const initialConversationNodeId: ConversationNodeId = "start";
