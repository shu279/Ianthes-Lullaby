# AI chat backend

The existing GitHub Pages app stays a static site. This Worker serves
`POST /api/chat` at https://ianthe-chat-api.ianthe-chat-api.workers.dev/api/chat.
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
  voice tag, for example `[[laugh|chuckle]]`. Legacy `[[idle]]` tags still work.
- `../lib/aiVoices.json`: shared recorded-voice catalog, including the spoken
  reactions and when they fit. Gemini picks one voice ID or `none` per reply.
  Changes to this catalog require both frontend and backend deployment.
- `GEMINI_MODEL`: defaults to `gemini-3.5-flash-lite`; change it in the Worker vars
  if needed for your account. The endpoint is Gemini's `streamGenerateContent` API.

The browser sends `{ "messages": [{ "role": "user", "content": "眠れない" }] }`.
Only alternating `user`/`assistant` messages are accepted, ending with `user`.
At most eight prior turns plus the new message, 8,000 characters total, are sent.
Provider roles, prompts, URLs, or model IDs cannot be supplied by the browser.

Response events are NDJSON, for example:

```jsonl
{"type":"animation","animation":"idle"}
{"type":"voice","voice":"hmm"}
{"type":"text","text":"んー。今夜は、ゆっくり休みましょう。"}
{"type":"done"}
```

Animations are restricted to `idle`, `laugh`, and `surprise`; text renders as
plain React text. Responses appear character by character. Leaving the page or
**停止** aborts the request. Failed/partial responses are not added to history.
The optional `voice` event names an allowlisted recording, never an arbitrary
URL. The browser starts it once, when the first reply text appears, using audio
prepared from the Send gesture. Short recordings have mouth envelopes; the rest
of the AI reply remains text. Stop, errors, page exit and page hiding cancel
playback. BGM volume stays unchanged. The former branching voice UI is no longer
displayed; AI chat owns audio setup and cleanup.
Explicit requests such as 「声を出さないで」 or 「音声なし」 suppress the voice
event for that reply even if the provider selects a recording.

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
