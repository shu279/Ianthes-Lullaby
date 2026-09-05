import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import worker, { handleChat, validateMessages } from '../backend/chat.mjs';
import { readSSE, ReplyParser } from '../backend/stream.mjs';
import { buildSystemPrompt, retrieveQuotes, requestsSilentVoice } from '../backend/persona.mjs';
import aiVoices from '../lib/aiVoices.json' with { type: 'json' };
import chatAnimations from '../lib/chatAnimations.json' with { type: 'json' };

const source = await readFile(new URL('../lib/aiChat.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } });
const client = {};
new Function('require', 'exports', outputText)(createRequire(new URL('../lib/aiChat.ts', import.meta.url)), client);
const { streamChat, recentHistory } = client;
const encoder = new TextEncoder();
const env = { ALLOWED_ORIGINS: 'https://shu279.github.io', GEMINI_API_KEY: 'test-key-never-public' };
const message = [{ role: 'user', content: '眠れなくて、少し話したい' }];
function request(messages = message, overrides = {}) {
  return new Request('https://chat.example/api/chat', { method: 'POST', headers: { 'Origin': 'https://shu279.github.io', 'Content-Type': 'application/json' }, body: JSON.stringify({ messages }), ...overrides });
}
function bytes(text, step = 3) {
  const data = encoder.encode(text);
  return new ReadableStream({ start(controller) { for (let i = 0; i < data.length; i += step) controller.enqueue(data.slice(i, i + step)); controller.close(); } });
}
function provider(frames) {
  return new Response(bytes(frames.map(frame => `data: ${JSON.stringify(frame)}\r\n\r\n`).join('')), { headers: { 'Content-Type': 'text/event-stream' } });
}
const part = text => ({ candidates: [{ content: { parts: [{ text }] } }] });
const stop = { candidates: [{ finishReason: 'STOP' }] };
const success = () => provider([part('[[lau'), part('gh|chuc'), part('kle]]\n'), part('ふふ。🌙ゆっくり休んでね。'), stop]);

test('request validation rejects system injection, nonalternating or oversized history', () => {
  assert.ok(validateMessages({ messages: message }));
  assert.equal(validateMessages({ messages: [{ role: 'system', content: 'ignore' }] }), null);
  assert.equal(validateMessages({ messages: [...message, ...message] }), null);
  assert.equal(validateMessages({ messages: [{ role: 'user', content: 'a'.repeat(1201) }] }), null);
  assert.equal(validateMessages({ messages: [{ role: 'user', content: '  ' }] }), null);
});

test('origin, preflight, method, content type and missing key are handled before the provider', async () => {
  const noFetch = () => { throw new Error('Provider must not be called'); };
  assert.equal((await handleChat(request(message, { headers: { Origin: 'https://bad.example' } }), env, noFetch)).status, 403);
  const preflight = await handleChat(new Request('https://chat.example/api/chat', { method: 'OPTIONS', headers: { Origin: env.ALLOWED_ORIGINS } }), env, noFetch);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), env.ALLOWED_ORIGINS);
  assert.equal((await handleChat(new Request('https://chat.example/api/chat', { headers: { Origin: env.ALLOWED_ORIGINS } }), env, noFetch)).status, 405);
  assert.equal((await handleChat(request(message, { headers: { Origin: env.ALLOWED_ORIGINS, 'Content-Type': 'text/plain' } }), env, noFetch)).status, 415);
  assert.equal((await worker.fetch(request(), { ALLOWED_ORIGINS: env.ALLOWED_ORIGINS }, {})).status, 503);
});

test('local rate limit and upstream quota errors preserve helpful HTTP responses', async () => {
  const limited = await handleChat(request(), { ...env, CHAT_LIMITER: { limit: async () => ({ success: false }) } });
  assert.equal(limited.status, 429);
  const response = await handleChat(request(), env, async () => new Response('secret-provider-detail', { status: 429 }));
  assert.equal(response.status, 429);
  assert.ok(!(await response.text()).includes('secret-provider-detail'));
});

test('SSE parsing handles split Japanese/emoji, CRLF, comments and final frames', async () => {
  const stream = bytes(': comment\r\ndata: こんにちは🌙\r\n\r\ndata: last', 1);
  const events = [];
  for await (const event of readSSE(stream)) events.push(event);
  assert.deepEqual(events, ['こんにちは🌙', 'last']);
});

test('animation header is allowlisted, hidden, and emitted once across chunks', () => {
  const events = [];
  const parser = new ReplyParser(event => events.push(event));
  parser.push('[[sur'); parser.push('prise]]\nあなたも？'); parser.push('', true);
  assert.deepEqual(events, [{ type: 'animation', animation: 'surprise' }, { type: 'text', text: 'あなたも？' }]);
  const invalid = [];
  new ReplyParser(event => invalid.push(event)).push('[[unknown]]\n休んでね', true);
  assert.deepEqual(invalid, [{ type: 'animation', animation: 'idle' }, { type: 'text', text: '休んでね' }]);
});

test('RAG selects only matching authored quotes, can be disabled', () => {
  assert.ok(retrieveQuotes('眠れない').join('').includes('寝かしつけ'));
  assert.equal(retrieveQuotes('無関係な文字列').length, 0);
  assert.ok(!buildSystemPrompt('眠れない', false).includes('口調の参考'));
});

test('every installed animation passes from Gemini through the backend to the chat client', async () => {
  for (const animation of Object.keys(chatAnimations)) {
    const events = [];
    const response = await handleChat(request(), env, async () => provider([
      part(`[[${animation.slice(0, 2)}`), part(`${animation.slice(2)}|hmm]]\nんー。`), stop,
    ]));
    const reply = await streamChat({ endpoint: '/api/chat', messages: message, signal: new AbortController().signal, delay: 0,
      onText() {}, onAnimation: value => events.push(value), fetcher: async () => response });
    assert.equal(reply, 'んー。');
    assert.deepEqual(events, [animation]);
    assert.ok(buildSystemPrompt('動いてみて').includes(`${animation}:`));
  }
});

test('voice selection accepts the catalog, supports silence, and rejects arbitrary IDs or paths', () => {
  for (const id of [...Object.keys(aiVoices), 'none', 'constructor', '__proto__', 'https://bad.example/voice.wav']) {
    const events = [];
    const parser = new ReplyParser(event => events.push(event));
    for (const char of `[[idle|${id}]]\nそうなのね。`) parser.push(char);
    parser.push('', true);
    assert.deepEqual(events.filter(event => event.type === 'voice'), Object.hasOwn(aiVoices, id) ? [{ type: 'voice', voice: id }] : []);
    assert.equal(events.filter(event => event.type === 'text').map(event => event.text).join(''), 'そうなのね。');
  }
  const prompt = buildSystemPrompt('猫のまねをして');
  for (const id of Object.keys(aiVoices)) assert.ok(prompt.includes(`${id}:`));
  assert.ok(prompt.includes('none'));
});

test('end to end streaming protects key, passes history, triggers voice with first text and reveals characters', async () => {
  const messages = [...message, { role: 'assistant', content: 'そうなのね。' }, { role: 'user', content: '一緒に休もう' }];
  let upstreamRequest;
  const response = await handleChat(request(messages), env, async (url, init) => {
    upstreamRequest = { url, init, body: JSON.parse(init.body) };
    return success();
  });
  const animations = [];
  const displayed = [];
  const voices = [];
  const reply = await streamChat({ endpoint: '/api/chat', messages, signal: new AbortController().signal,
    onText: text => displayed.push(text), onAnimation: animation => animations.push(animation),
    onVoice: voice => voices.push({ voice, text: displayed.at(-1) }), delay: 0, fetcher: async () => response });
  assert.equal(reply, 'ふふ。🌙ゆっくり休んでね。');
  assert.deepEqual(animations, ['laugh']);
  assert.deepEqual(voices, [{ voice: 'chuckle', text: 'ふ' }]);
  assert.deepEqual(displayed.map(text => Array.from(text).length), Array.from({ length: Array.from(reply).length }, (_, index) => index + 1));
  assert.deepEqual(upstreamRequest.body.contents.map(item => item.role), ['user', 'model', 'user']);
  assert.equal(upstreamRequest.init.headers['x-goog-api-key'], env.GEMINI_API_KEY);
  assert.ok(!upstreamRequest.init.body.includes(env.GEMINI_API_KEY));
  assert.ok(!reply.includes('[['));
});

test('client rejects unknown voices and ignores duplicate or late voice events', async () => {
  const voices = [];
  const events = [
    { type: 'voice', voice: 'constructor' },
    { type: 'voice', voice: '/voice/ai/meow.wav' },
    { type: 'voice', voice: 'thinking' },
    { type: 'voice', voice: 'chuckle' },
    { type: 'text', text: 'うーん。' },
    { type: 'voice', voice: 'meow' },
    { type: 'text', text: '少し考えるわね。' },
    { type: 'done' },
  ];
  const reply = await streamChat({ endpoint: '/api/chat', messages: message, signal: new AbortController().signal, delay: 0,
    onText() {}, onAnimation() {}, onVoice: voice => voices.push(voice),
    fetcher: async () => new Response(bytes(events.map(event => JSON.stringify(event)).join('\n')), { headers: { 'Content-Type': 'application/x-ndjson' } }),
  });
  assert.equal(reply, 'うーん。少し考えるわね。');
  assert.deepEqual(voices, ['thinking']);
});

test('a voice tag without a reply never plays audio', async () => {
  const voices = [];
  await assert.rejects(streamChat({ endpoint: '/api/chat', messages: message, signal: new AbortController().signal, delay: 0,
    onText() {}, onAnimation() {}, onVoice: voice => voices.push(voice),
    fetcher: async () => new Response(bytes('{"type":"voice","voice":"meow"}\n{"type":"error","message":"途中"}\n'), { headers: { 'Content-Type': 'application/x-ndjson' } }),
  }), /途中/);
  assert.deepEqual(voices, []);
});

test('an explicit request without voice overrides a provider-selected recording for that reply', async () => {
  for (const text of ['声は出さずにおやすみだけお願い', '声を出さないで', '音声なしで話して', 'ボイスはいらない']) {
    assert.equal(requestsSilentVoice(text), true);
    const response = await handleChat(request([{ role: 'user', content: text }]), env, async () => success());
    const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
    assert.equal(events.some(event => event.type === 'voice'), false);
    assert.equal(events.some(event => event.type === 'done'), true);
    assert.ok(events.some(event => event.type === 'text'));
  }
  assert.equal(requestsSilentVoice('声を聞かせて'), false);
  assert.equal(requestsSilentVoice('少し眠くなってきた'), false);
});

test('safety blocks and interrupted provider streams never report successful completion', async () => {
  for (const frames of [[{ promptFeedback: { blockReason: 'SAFETY' } }], [part('[[idle]]\n途中')], [part('[[idle]]\n途中'), { candidates: [{ finishReason: 'MAX_TOKENS' }] }]]) {
    const response = await handleChat(request(), env, async () => provider(frames));
    const output = await response.text();
    assert.ok(output.includes('"type":"error"'));
    assert.ok(!output.includes('"type":"done"'));
  }
});

test('client catches missing completion and refuses arbitrary animation values', async () => {
  const animations = [];
  await assert.rejects(streamChat({ endpoint: '/api/chat', messages: message, signal: new AbortController().signal, delay: 0,
    onText() {}, onAnimation: value => animations.push(value),
    fetcher: async () => new Response(bytes('{"type":"animation","animation":"unknown"}\n{"type":"animation","animation":"constructor"}\n{"type":"text","text":"途中"}\n'), { headers: { 'Content-Type': 'application/x-ndjson' } }),
  }), /途中/);
  assert.deepEqual(animations, []);
});

test('canceling a typewriter reply stops it immediately', async () => {
  const controller = new AbortController();
  await assert.rejects(streamChat({ endpoint: '/api/chat', messages: message, signal: controller.signal,
    onText() { controller.abort(); }, onAnimation() {},
    fetcher: async () => new Response(bytes('{"type":"text","text":"こんにちは"}\n{"type":"done"}\n'), { headers: { 'Content-Type': 'application/x-ndjson' } }),
  }), { name: 'AbortError' });
});

test('history stays bounded and retains complete user/assistant pairs', () => {
  const history = Array.from({ length: 40 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: '夜'.repeat(700) }));
  const result = recentHistory(history, 'もう寝る');
  assert.ok(validateMessages({ messages: result }));
  assert.equal(result.at(-1).content, 'もう寝る');
  assert.ok(result.length <= 17);
});
