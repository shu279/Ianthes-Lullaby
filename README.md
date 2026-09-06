# Ianthe’s Lullaby

オリジナルキャラクター「イアンサ」と会話できるWebアプリです。

**[公開デモ](https://shu279.github.io/Ianthes-Lullaby/)**

## 主な機能

- 会話に合わせた8種類のアニメーション
- VOICEVOXの読み上げと口パク
- カメラ操作

## 使用技術

Next.js / React / TypeScript、Three.js / React Three Fiber / Drei（WebGL）、Web Audio API、Gemini API、VOICEVOX（TTS Quest API）、Cloudflare Workers、GitHub Pages。

## カスタマイズ

口調は [backend/persona.mjs](backend/persona.mjs)、動作の対応は [lib/chatAnimations.json](lib/chatAnimations.json) で変更できます。

## クレジット

- 音声：[VOICEVOX:四国めたん](https://voicevox.hiroshiba.jp/product/shikoku_metan/)（あまあま）／ [TTS Quest API](https://github.com/ts-klassen/ttsQuestV3Voicevox)
- フォント：[Zen丸ゴシック](https://github.com/googlefonts/zen-marugothic)（[SIL Open Font License](public/fonts/zen-maru-gothic-OFL.txt)）
