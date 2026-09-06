# AI chat backend

The existing GitHub Pages app stays a static site. This Worker serves
`POST /api/chat` and `POST /api/tts` at https://ianthe-chat-api.ianthe-chat-api.workers.dev.
The GitHub Pages workflow uses this public URL by default; repository variable
`CHAT_API_URL` can override it. No Gemini
key is compiled into the browser, and the backend does not persist chat history.

## Local development

1. Run `npm ci --prefix backend` from the project root.
2. Copy `backend/.dev.vars.example` to `backend/.dev.vars` and set
   `GEMINI_API_KEY` there. Obtain a key from [Google AI Studio](https://aistudio.google.com/apikey).
   The actual file is ignored by Git. Do not paste the key into a chat or a
   `NEXT_PUBLIC_` variable.
3. In one terminal run `npm run dev:api`.
4. In another terminal run `npm run dev`, then open http://localhost:3000.
   Development automatically uses http://localhost:8787/api/chat.
5. AI chat is visible immediately. Send a message to talk to Gemini; opening
   the page alone does not send a model request.

`npm test` runs the existing voice tests plus mocked streaming API/client tests.
`npm --prefix backend run check` verifies the Worker bundle without deployment.
Neither command calls a real model. A real-key smoke test has verified Gemini streaming replies and animation tags.
Repeat it after changing the account, model, or API configuration.

## Publish with GitHub Pages

1. Sign in to Cloudflare with `npm --prefix backend run login`.
2. Run `npm --prefix backend run deploy` to create the `ianthe-chat-api` Worker.
3. Run `npm --prefix backend run secret`
   from the project root and enter the key in the terminal prompt. Alternatively,
   add `GEMINI_API_KEY` as a **Secret** in that Worker's Settings on Cloudflare.
4. In GitHub repository **Settings → Secrets and variables → Actions → Variables**,
   create `CHAT_API_URL` with `https://<your-worker-host>/api/chat`.
   This is a public URL, not a secret. This step is optional for the current
   deployment, whose URL is already the default in the Pages workflow.
5. Rerun **Deploy to GitHub Pages** from GitHub Actions. The workflow embeds
   `CHAT_API_URL` (or the checked-in default) as `NEXT_PUBLIC_CHAT_API_URL`.
   Builds without an API URL show a preparation message in AI mode.

`wrangler.jsonc` permits the current Pages origin and local development origins.
Update `ALLOWED_ORIGINS` if the site gets a custom domain. Deploy from `backend/`
(or use the npm script) so the Worker configuration is found.

For automatic backend updates, add GitHub Actions secrets
`CLOUDFLARE_API_TOKEN` (Workers edit permission) and `CLOUDFLARE_ACCOUNT_ID`, then
set repository variable `CHAT_API_DEPLOY_ENABLED` to `true`. The separate
**Deploy AI chat API** workflow then deploys backend changes on `main`. Leave
this disabled until Cloudflare is configured. The Gemini key stays in the
Worker's secret storage; it is not needed by GitHub Actions.

## Conversation and protocol

- `persona.mjs`: personality and Japanese phrasing. A small keyword search selects
  up to two matching authored quote examples. Set `ENABLE_RAG` to `false` to omit
  this optional retrieval; no embeddings or external database are required.
- `chat.mjs`: validates history, adds the server-owned system prompt, sends a Gemini
  streaming request, and returns newline-delimited JSON events.
- `stream.mjs`: parses Gemini SSE chunks and extracts the first-line animation and
  animation tag, for example `[[laugh]]`. Older recorded-voice clients can still
  use `[[laugh|chuckle]]`.
- `tts.mjs`: requests full-reply speech from the unofficial TTS Quest VOICEVOX API,
  waits for that job, and returns MP3 audio. Speaker `0` is 四国めたん（あまあま）.
- `../lib/aiVoices.json`: shared recorded-voice catalog, including the spoken
  reactions and when they fit. Gemini picks one voice ID or `none` per reply.
  Changes to this catalog require both frontend and backend deployment.
- `../lib/chatAnimations.json`: shared catalog of all eight installed animation
  IDs, files and usage descriptions. Deploy both sides when changing it.
- `GEMINI_MODEL`: defaults to `gemini-3.5-flash-lite`; change it in the Worker vars
  if needed for your account. The endpoint is Gemini's `streamGenerateContent` API.

The browser sends `{ "messages": [{ "role": "user", "content": "眠れない" }], "speech": "voicevox" }`.
Only alternating `user`/`assistant` messages are accepted, ending with `user`.
At most eight prior turns plus the new message, 8,000 characters total, are sent.
Provider roles, prompts, URLs, or model IDs cannot be supplied by the browser.

Response events are NDJSON, for example:

```jsonl
{"type":"animation","animation":"idle"}
{"type":"speech","enabled":true}
{"type":"text","text":"んー。今夜は、ゆっくり休みましょう。"}
{"type":"done"}
```

Animations are restricted to the shared catalog: `idle`, `laugh`, `surprise`,
`attack`, `pose`, `intro`, `sleepIn`, and `sleepOut`; text renders as
plain React text. Responses appear character by character. Leaving the page or
**停止** aborts the request. Failed/partial responses are not added to history.
The server emits one `speech` event for VOICEVOX clients. Once the complete
reply is displayed, the browser sends `{ "text": "…" }` to `/api/tts` if speech
is enabled. Requests such as 「声を出さないで」「音声なし」「読み上げないで」
set `enabled` to `false` for that reply. These clients do not play recorded
reactions over synthesized speech. Clients that omit `speech` retain the legacy
allowlisted `voice` event and recorded reaction behavior.

`/api/tts` accepts up to 1,200 characters, fixes the voice on the server, and
applies a separate limit of 6 synthesis requests per minute per IP/location.
No extra key is required. Optionally set `VOICEVOX_API_KEY` as a Worker secret
(and in the ignored `.dev.vars` locally) to use TTS Quest's free faster mode.
Keep that key out of `NEXT_PUBLIC_` variables and Git.
Only the reply text is sent to TTS Quest; Gemini credentials and chat history
are never forwarded. Generated audio is returned with `Cache-Control: no-store`.
The provider generates downloadable audio URLs that may remain available until
it deletes them; do not assume private or permanent storage at the provider.

The Worker follows only validated `audio[1-9].tts.quest` job URLs, rejects
redirects, bounds audio size to 8 MB, and limits synthesis/polling to 60 seconds
and at most 22 outbound requests. It honors provider rate limits without
automatically repeating synthesis. Provider errors leave text chat usable.

Web Audio is resumed from Send. The browser computes a 50 Hz RMS mouth envelope
from the decoded MP3 and tracks playback time. Stop, a new message, reset, page
exit and tab hiding cancel pending synthesis and playback; late results cannot
start speaking. Automatic sleep waits until synthesis/playback has finished.
BGM volume stays unchanged. The Settings panel displays the required credit:
**VOICEVOX:四国めたん**. See the
[TTS Quest API](https://github.com/ts-klassen/ttsQuestV3Voicevox) and
[voice-library terms](https://zunko.jp/con_ongen_kiyaku.html).
The browser routes sleep/wake transitions and returns one-shot reactions to
idle on animation completion. The model selects a reaction ID; it cannot set
animation URLs, control BGM, or change the camera.

## Limits

The Worker limits request size, reply size, runtime, and per-IP request frequency
(10 per minute per Cloudflare location). IP limits can affect people sharing a
network. CORS restricts browser origins; it is not authentication or a global
spending cap. For a public demo, use a Gemini project without paid billing if
spending must remain zero. This app does not enable billing or upgrade tiers.

Gemini free usage is subject to the selected model/account quota; it is not
unlimited. Free-tier content can be used to improve Google's products. Confirm
the current [Gemini pricing and data-use table](https://ai.google.dev/gemini-api/docs/pricing)
before entering private information. API docs:
[streamGenerateContent](https://ai.google.dev/api/generate-content#method:-models.streamgeneratecontent),
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[Workers rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).
