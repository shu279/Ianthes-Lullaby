# Ianthe’s Lullaby

オリジナルキャラクター「イアンサ」と、声やしぐさを楽しみながら会話できるWebアプリです。

**[公開デモ](https://shu279.github.io/Ianthes-Lullaby/)**

## 主な機能

- Geminiによる日本語チャットと、会話に合わせた8種類のアニメーション
- VOICEVOXの読み上げに合わせた、行ごとの文字表示と口パク
- 3Dキャラクターのカメラ操作、チャットの開閉
- BGM音量・水面の反射品質の調整、Zen丸ゴシックによる日本語表示

会話履歴はページを開いている間だけ保持します。音声生成が遅れたり失敗した場合は、待機表示や文字のみの返答に切り替わります。

## 使用技術

Next.js / React / TypeScript、Three.js / React Three Fiber / Drei（WebGL）、Web Audio API、Gemini API、VOICEVOX（TTS Quest API）、Cloudflare Workers、GitHub Pages。

## ローカル起動

Node.js 22を推奨します。プロジェクトのルートで実行してください。

```sh
npm ci
npm ci --prefix backend
cp backend/.dev.vars.example backend/.dev.vars
```

`backend/.dev.vars` に `GEMINI_API_KEY` を設定し、2つのターミナルでそれぞれ起動します。APIキーはGitや `NEXT_PUBLIC_` 変数に入れません。

```sh
npm run dev:api # ターミナル1：API
npm run dev     # ターミナル2：フロントエンド
```

[localhost:3000](http://localhost:3000) を開くと会話できます。テストは `npm test` で実行します。

## 公開・カスタマイズ

`main` へのプッシュでGitHub Pagesへ自動公開します。APIの設定・デプロイ方法は [backend/README.md](backend/README.md) を参照してください。

口調は [backend/persona.mjs](backend/persona.mjs)、動作の対応は [lib/chatAnimations.json](lib/chatAnimations.json) で変更できます。

旧ボイス素材と背景モデルはGit管理対象外です。ローカルの `public/` 内には残っている場合があるため、公開用ビルドにはクリーンなチェックアウトを使います。

## クレジット

- 音声：[VOICEVOX:四国めたん](https://voicevox.hiroshiba.jp/product/shikoku_metan/)（あまあま）／ [TTS Quest API](https://github.com/ts-klassen/ttsQuestV3Voicevox)
- フォント：[Zen丸ゴシック](https://github.com/googlefonts/zen-marugothic)（[SIL Open Font License](public/fonts/zen-maru-gothic-OFL.txt)）
