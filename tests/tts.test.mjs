import assert from 'node:assert/strict';
import test from 'node:test';
import { handleChat } from '../backend/chat.mjs';
import { handleTts } from '../backend/tts.mjs';

const env = { ALLOWED_ORIGINS: 'https://shu279.github.io' };
const base = `https://audio2.tts.quest/v1/data/${'a'.repeat(64)}/`;
const job = { success: true, audioStatusUrl: `${base}status.json` };
const text = 'ふふ、ゆっくり休んでね。';
const request = (body = { text }, options = {}) => new Request('https://chat.example/api/tts', {
  method: 'POST', headers: { Origin: env.ALLOWED_ORIGINS, 'Content-Type': 'application/json' },
  body: JSON.stringify(body), ...options,
});
const audio = () => new Response(new Uint8Array([73, 68, 51, 4]), { headers: { 'Content-Type': 'audio/mpeg' } });
function provider(calls, pending = 0) {
  return async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/synthesis')) return Response.json(job);
    if (url.endsWith('/status.json')) return Response.json({ success: true, isAudioReady: pending-- <= 0 });
    if (url.endsWith('/audio.mp3')) return audio();
    throw new Error(`Unexpected URL: ${url}`);
  };
}

test('TTS checks origin, preflight, input and rate limits without requiring a Gemini key', async () => {
  const noFetch = () => { throw new Error('Provider must not be called'); };
  assert.equal((await handleChat(request({}, { headers: { Origin: 'https://bad.example' } }), env, noFetch)).status, 403);
  assert.equal((await handleChat(request({}, { method: 'OPTIONS', body: undefined }), env, noFetch)).status, 204);
  assert.equal((await handleChat(request({}, { method: 'GET', body: undefined }), env, noFetch)).status, 405);
  assert.equal((await handleChat(request({}, { headers: { Origin: env.ALLOWED_ORIGINS, 'Content-Type': 'text/plain' } }), env, noFetch)).status, 415);
  for (const body of [null, {}, { text: '' }, { text: 3 }, { text: 'x'.repeat(1201) }]) {
    assert.equal((await handleChat(request(body), env, noFetch)).status, 400);
  }
  const limited = { ...env, TTS_LIMITER: { limit: async () => ({ success: false }) } };
  assert.equal((await handleChat(request(), limited, noFetch)).status, 429);
  assert.equal((await handleChat(request(), env, provider([]))).status, 200);
});

test('TTS posts only reply text and fixed speaker, proxies audio, and keeps optional key private', async () => {
  const calls = [];
  const response = await handleChat(request({ text, speaker: 99, url: 'https://bad.example' }), {
    ...env, VOICEVOX_API_KEY: 'secret-voice-key',
  }, provider(calls));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'audio/mpeg');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), env.ALLOWED_ORIGINS);
  assert.deepEqual([...new URLSearchParams(calls[0].init.body)], [['speaker', '0'], ['text', text], ['key', 'secret-voice-key']]);
  assert.ok(calls.every(call => call.init.redirect === 'error'));
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([73, 68, 51, 4]));
  assert.ok(!JSON.stringify([...response.headers]).includes('secret-voice-key'));
});

test('TTS polls the existing job without requesting synthesis twice', async () => {
  const calls = [];
  const waits = [];
  const response = await handleTts(request(), { text }, env, new Headers(), provider(calls, 2), async ms => waits.push(ms));
  assert.equal(response.status, 200);
  assert.deepEqual(waits, [2500, 2500]);
  assert.equal(calls.filter(call => call.url.endsWith('/synthesis')).length, 1);
});

test('TTS preserves provider retry delay and never retries synthesis automatically', async () => {
  for (const upstream of [Response.json({ retryAfter: 45 }, { status: 429 }), new Response('busy', { status: 429, headers: { 'Retry-After': '20' } })]) {
    let calls = 0;
    const response = await handleChat(request(), env, async () => { calls++; return upstream; });
    assert.equal(response.status, 429);
    assert.ok(Number(response.headers.get('Retry-After')) >= 20);
    assert.ok((await response.json()).error.includes('秒'));
    assert.equal(calls, 1);
  }
});

test('TTS rejects untrusted job URLs and derives audio from the validated job', async () => {
  for (const url of ['http://127.0.0.1/status.json', base.replace('audio2.tts.quest', 'audio2.tts.quest.bad.example') + 'status.json',
    base.replace('https://', 'https://user:password@') + 'status.json', `${base}status.json?target=private`, `${base}other.json`]) {
    let calls = 0;
    const response = await handleChat(request(), env, async () => { calls++; return Response.json({ ...job, audioStatusUrl: url }); });
    assert.equal(response.status, 502);
    assert.equal(calls, 1);
  }
  const calls = [];
  const fetcher = provider(calls);
  const response = await handleChat(request(), env, (url, init) => url.endsWith('/synthesis')
    ? Response.json({ ...job, mp3DownloadUrl: 'http://127.0.0.1/private' }) : fetcher(url, init));
  assert.equal(response.status, 200);
  assert.equal(calls.at(-1).url, `${base}audio.mp3`);
});

test('TTS bounds pending jobs, cancellation, failed jobs and audio responses', async () => {
  const calls = [];
  const pending = await handleTts(request(), { text }, env, new Headers(), provider(calls, Infinity), async () => {});
  assert.equal(pending.status, 504);
  assert.equal(calls.length, 21);
  const controller = new AbortController();
  const abortedCalls = [];
  const canceled = await handleTts(request({ text }, { signal: controller.signal }), { text }, env, new Headers(),
    provider(abortedCalls, Infinity), async () => controller.abort());
  assert.equal(canceled.status, 504);
  assert.equal(abortedCalls.length, 2);
  for (const badAudio of [new Response('<html>error</html>', { headers: { 'Content-Type': 'text/html' } }),
    new Response('too big', { headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': '8000001' } }),
    new Response(new Uint8Array(8_000_001), { headers: { 'Content-Type': 'audio/mpeg' } }),
    new Response('', { headers: { 'Content-Type': 'audio/mpeg' } })]) {
    const fetcher = provider([]);
    const response = await handleChat(request(), env, (url, init) => url.endsWith('/audio.mp3') ? badAudio : fetcher(url, init));
    assert.equal(response.status, 502);
  }
  const failed = await handleChat(request(), env, async url => Response.json(url.endsWith('/synthesis') ? job : { success: true, isAudioError: true }));
  assert.equal(failed.status, 502);
});
