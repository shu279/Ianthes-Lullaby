import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import aiVoices from '../lib/aiVoices.json' with { type: 'json' };

const source = await readFile(new URL('../lib/conversationVoice.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { ConversationVoice, speechEnvelope } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const envelope = { fps: 50, samples: [0, 0.8, 0, 0] };

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function fixture(fetcher = async () => new Response(new Uint8Array([0]))) {
  const sources = [];
  const statuses = [];
  const context = {
    state: 'suspended', currentTime: 0, destination: {}, resumes: 0,
    resume() { this.resumes++; this.state = 'running'; return Promise.resolve(); },
    close() { this.state = 'closed'; return Promise.resolve(); },
    decodeAudioData: async () => ({ duration: 0.8 }),
    createBufferSource() {
      const source = {
        onended: null, started: false, stopped: false, disconnected: false,
        connect() {}, start() { this.started = true; },
        stop() { this.stopped = true; }, disconnect() { this.disconnected = true; },
      };
      sources.push(source);
      return source;
    },
  };
  const audio = {
    paused: false, play: async () => {}, pause() { this.paused = true; },
    removeAttribute() {}, load() {},
  };
  const player = new ConversationVoice(() => audio, status => statuses.push(status), () => context, fetcher);
  return { player, context, sources, statuses, audio };
}

test('every AI voice has a published PCM recording and a matching non-silent mouth envelope', async () => {
  const envelopes = JSON.parse(await readFile(new URL('../lib/voiceEnvelopes.json', import.meta.url)));
  assert.equal(new Set(Object.values(aiVoices).map(voice => voice.file)).size, Object.keys(aiVoices).length);
  for (const voice of Object.values(aiVoices)) {
    assert.ok(voice.file.startsWith('/voice/ai/'));
    assert.ok(voice.line && voice.use);
    const wav = await readFile(new URL(`../public${voice.file}`, import.meta.url));
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
    const byteRate = wav.readUInt32LE(28);
    const dataStart = wav.indexOf('data');
    const duration = wav.readUInt32LE(dataStart + 4) / byteRate;
    const envelope = envelopes[voice.file];
    assert.equal(envelope.fps, 50);
    assert.ok(Math.abs(envelope.samples.length / envelope.fps - duration) <= 0.02);
    assert.ok(envelope.samples.some(value => value > 0));
    assert.ok(envelope.samples.every(value => value >= 0 && value <= 0.85));
  }
});

test('Send prepares audio immediately, cached clips replay, and the mouth follows the audio clock', async () => {
  let downloads = 0;
  const { player, context, sources } = fixture(async () => { downloads++; return new Response(new Uint8Array([0])); });
  player.prepareReactions(['/voice/ai/hmm.wav']);
  assert.equal(context.resumes, 1);
  assert.equal(sources.length, 0, 'preparation must not make a sound');
  await player.playReaction('/voice/ai/hmm.wav', envelope);
  assert.ok(sources[0].started);
  context.currentTime = 0.02;
  assert.equal(player.mouthOpen(), 0.8);
  context.currentTime = 0.03;
  assert.ok(Math.abs(player.mouthOpen() - 0.4) < 0.0001);
  context.state = 'suspended';
  assert.equal(player.mouthOpen(), 0);
  context.state = 'running';
  await player.playReaction('/voice/ai/hmm.wav', envelope);
  assert.ok(sources[0].stopped && sources[0].disconnected);
  assert.equal(downloads, 1);
  sources[1].onended();
  assert.equal(player.mouthOpen(), 0);
  player.dispose();
  assert.equal(context.state, 'closed');
});

test('voice downloads call browser fetch without a player object as the receiver', async () => {
  function browserFetch() {
    if (this !== undefined && this !== globalThis) throw new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation");
    return Promise.resolve(new Response(new Uint8Array([0])));
  }
  const { player, statuses, sources } = fixture(browserFetch);
  player.prepareReactions(['/voice/ai/chuckle.wav']);
  await player.playReaction('/voice/ai/chuckle.wav', envelope);
  assert.equal(statuses.at(-1), 'playing');
  assert.equal(sources.length, 1);
  assert.ok(sources[0].started);
});

test('stopping or switching to a recorded branch cancels even a late AI audio download', async () => {
  const download = deferred();
  const { player, sources, statuses, audio } = fixture(() => download.promise);
  player.prepareReactions(['/voice/ai/thinking.wav']);
  const pending = player.playReaction('/voice/ai/thinking.wav', envelope);
  player.stop();
  await player.play('/voice/001.wav', envelope);
  player.stopReaction();
  assert.equal(audio.paused, false, 'late AI cancellation must leave the new branch playing');
  download.resolve(new Response(new Uint8Array([0])));
  await pending;
  assert.equal(sources.length, 0);
  assert.equal(statuses.at(-1), 'playing', 'a canceled reaction must not change the new branch playback');
});

test('mode changes stop an active reaction and AI playback stops a preceding branch voice', async () => {
  const { player, sources, audio } = fixture();
  await player.play('/voice/001.wav', envelope);
  player.prepareReactions(['/voice/ai/chuckle.wav']);
  await player.playReaction('/voice/ai/chuckle.wav', envelope);
  assert.ok(audio.paused);
  player.stop();
  assert.ok(sources[0].stopped && sources[0].disconnected);
  assert.equal(sources[0].onended, null);
  assert.equal(player.mouthOpen(), 0);
});

test('a failed recording is recoverable without rejecting the chat response', async () => {
  let attempts = 0;
  const { player, statuses, sources } = fixture(async () => new Response(new Uint8Array([0]), { status: ++attempts === 1 ? 404 : 200 }));
  player.prepareReactions([]);
  await player.playReaction('/voice/ai/chuckle.wav', envelope);
  assert.equal(statuses.at(-1), 'error');
  assert.equal(player.mouthOpen(), 0);
  await player.playReaction('/voice/ai/chuckle.wav', envelope);
  assert.equal(statuses.at(-1), 'playing');
  assert.equal(sources.length, 1);
});

test('an unavailable or blocked audio context remains silent without rejecting the chat', async () => {
  const statuses = [];
  const unavailable = new ConversationVoice(() => {}, status => statuses.push(status), () => { throw new Error('Unavailable'); });
  unavailable.prepareReactions([]);
  await unavailable.playReaction('/voice/ai/hmm.wav', envelope);
  assert.equal(statuses.at(-1), 'blocked');
  assert.equal(unavailable.mouthOpen(), 0);
  const { player, context, sources } = fixture();
  context.resume = () => Promise.reject(new Error('Blocked'));
  player.prepareReactions([]);
  await player.playReaction('/voice/ai/hmm.wav', envelope);
  assert.equal(sources.length, 0);
});

function speechBuffer() {
  const pcm = new Float32Array(80);
  pcm.fill(0.25, 20, 40);
  return { duration: 0.08, sampleRate: 1000, length: pcm.length, numberOfChannels: 1, getChannelData: () => pcm };
}

test('generated speech uses the audio clock and closes the mouth during actual silence', async () => {
  const calls = [];
  const { player, context, sources } = fixture(async (url, init) => {
    calls.push({ url, init });
    return new Response(new Uint8Array([1]), { headers: { 'Content-Type': 'audio/mpeg' } });
  });
  context.decodeAudioData = async () => speechBuffer();
  player.prepareReactions([]);
  assert.deepEqual(speechEnvelope(speechBuffer()), { fps: 50, samples: [0, 0.85, 0, 0] });
  await player.playSpeech('/api/tts', 'ふふ、こんばんは。');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body), { text: 'ふふ、こんばんは。' });
  context.currentTime = 0.02;
  assert.equal(player.mouthOpen(), 0.85);
  context.currentTime = 0.04;
  assert.equal(player.mouthOpen(), 0);
  await player.playSpeech('/api/tts', '次のお話。');
  assert.ok(sources[0].stopped && sources[0].disconnected);
  assert.equal(calls.length, 2, 'generated replies must not reuse a cached audio buffer');
  sources[1].onended();
  assert.equal(player.mouthOpen(), 0);
  player.dispose();
});

test('stopping speech aborts synthesis and a late result cannot play over a newer turn', async () => {
  const pending = deferred();
  let signal;
  const { player, context, sources, statuses } = fixture((url, init) => { signal = init.signal; return pending.promise; });
  context.decodeAudioData = async () => speechBuffer();
  player.prepareReactions([]);
  const playing = player.playSpeech('/api/tts', '遅い返事');
  await new Promise(resolve => setImmediate(resolve));
  player.stop();
  assert.ok(signal.aborted);
  pending.resolve(new Response(new Uint8Array([1]), { headers: { 'Content-Type': 'audio/mpeg' } }));
  await playing;
  assert.equal(sources.length, 0);
  assert.equal(statuses.at(-1), 'idle');
});

test('speech failures are recoverable and a blocked player does not request synthesis', async () => {
  let calls = 0;
  const { player, context, statuses } = fixture(async () => ++calls === 1
    ? Response.json({ error: '混み合っています。' }, { status: 429 })
    : new Response(new Uint8Array([1]), { headers: { 'Content-Type': 'audio/mpeg' } }));
  context.decodeAudioData = async () => speechBuffer();
  player.prepareReactions([]);
  await player.playSpeech('/api/tts', 'こんばんは。');
  assert.equal(statuses.at(-1), 'error');
  await player.playSpeech('/api/tts', 'こんばんは。');
  assert.equal(statuses.at(-1), 'playing');
  player.stop();
  context.resume = () => Promise.reject(new Error('Blocked'));
  player.prepareReactions([]);
  await player.playSpeech('/api/tts', 'こんばんは。');
  assert.equal(statuses.at(-1), 'blocked');
  assert.equal(calls, 2);
});
