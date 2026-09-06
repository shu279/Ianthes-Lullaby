import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../lib/conversationVoice.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { ConversationVoice, speechEnvelope } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

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
  const player = new ConversationVoice(status => statuses.push(status), () => context, fetcher);
  return { player, context, sources, statuses };
}

function speechBuffer() {
  const pcm = new Float32Array(80);
  pcm.fill(0.25, 20, 40);
  return { duration: 0.08, sampleRate: 1000, length: pcm.length, numberOfChannels: 1, getChannelData: () => pcm };
}

const flush = () => new Promise(resolve => setImmediate(resolve));
const mp3 = () => new Response(new Uint8Array([1]), { headers: { 'Content-Type': 'audio/mpeg' } });

test('Send resumes audio without downloading recordings, and synthesized speech uses unbound browser fetch', async () => {
  let calls = 0;
  function browserFetch(url, init) {
    if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
    calls++;
    assert.equal(url, '/api/tts');
    assert.deepEqual(JSON.parse(init.body), { text: 'こんばんは。' });
    return Promise.resolve(mp3());
  }
  const { player, context, sources, statuses } = fixture(browserFetch);
  context.decodeAudioData = async () => speechBuffer();
  player.prepareAudio();
  assert.equal(context.resumes, 1);
  assert.equal(calls, 0);
  assert.equal(sources.length, 0);
  assert.deepEqual(speechEnvelope(speechBuffer()), { fps: 50, samples: [0, 0.85, 0, 0] });
  const queue = player.beginSpeech('/api/tts');
  queue.enqueue('こんばんは。');
  queue.finish();
  await flush();
  assert.equal(calls, 1);
  assert.equal(statuses.at(-1), 'playing');
  context.currentTime = 0.02;
  assert.equal(player.mouthOpen(), 0.85);
  context.state = 'suspended';
  assert.equal(player.mouthOpen(), 0);
  context.state = 'running';
  context.currentTime = 0.04;
  assert.equal(player.mouthOpen(), 0);
  player.dispose();
  assert.ok(sources[0].stopped && sources[0].disconnected);
  assert.equal(context.state, 'closed');
});

test('an unavailable audio context fails gracefully without requesting speech', async () => {
  const statuses = [];
  const player = new ConversationVoice(status => statuses.push(status), () => { throw new Error('Unavailable'); },
    () => { assert.fail('Blocked audio must not request synthesis'); });
  player.prepareAudio();
  const queue = player.beginSpeech('/api/tts');
  queue.enqueue('こんばんは。');
  queue.finish();
  await flush();
  assert.equal(statuses.at(-1), 'blocked');
  assert.equal(player.mouthOpen(), 0);
  player.dispose();
});

function queuedSpeechFixture() {
  const downloads = [];
  const result = fixture((url, init) => {
    const pending = deferred();
    downloads.push({ ...pending, url, init, text: JSON.parse(init.body).text });
    return pending.promise;
  });
  result.context.decodeAudioData = async () => speechBuffer();
  result.player.prepareAudio();
  return { ...result, downloads };
}

test('speech plays the first completed line immediately and prefetches only one clip ahead in order', async () => {
  const { player, context, sources, statuses, downloads } = queuedSpeechFixture();
  const queue = player.beginSpeech('/api/tts');
  queue.enqueue('最初の行。');
  await flush();
  assert.deepEqual(downloads.map(item => item.text), ['最初の行。']);
  downloads[0].resolve(mp3());
  await flush();
  assert.equal(sources.length, 1, 'playback starts even before later lines or finish arrive');
  assert.ok(sources[0].started);
  context.currentTime = 0.02;
  assert.equal(player.mouthOpen(), 0.85);

  queue.enqueue('次の行。');
  queue.enqueue('最後の行。');
  queue.finish();
  await flush();
  assert.equal(downloads.length, 2, 'the next request starts during the first playback');
  downloads[1].resolve(mp3());
  await flush();
  assert.equal(sources.length, 1, 'ready audio must wait its turn');
  assert.equal(downloads.length, 2, 'only one clip may be prefetched');
  context.currentTime = 0.08;
  sources[0].onended();
  assert.ok(sources[0].disconnected && sources[1].started);
  assert.equal(player.mouthOpen(), 0, 'the next clip has its own mouth timeline');
  context.currentTime = 0.10;
  assert.ok(Math.abs(player.mouthOpen() - 0.85) < 0.0001);
  await flush();
  assert.deepEqual(downloads.map(item => item.text), ['最初の行。', '次の行。', '最後の行。']);
  downloads[2].resolve(mp3());
  await flush();
  assert.equal(sources.length, 2);
  sources[1].onended();
  assert.ok(sources[2].started);
  assert.equal(statuses.slice(statuses.indexOf('playing')).includes('idle'), false);
  sources[2].onended();
  await flush();
  assert.equal(statuses.at(-1), 'idle');
  assert.equal(player.mouthOpen(), 0);
  player.dispose();
});

test('a slow next line leaves silence until ready without repeating or overlapping speech', async () => {
  const { player, sources, statuses, downloads } = queuedSpeechFixture();
  const queue = player.beginSpeech('/api/tts');
  queue.enqueue('最初。');
  queue.enqueue('次。');
  queue.finish();
  await flush();
  downloads[0].resolve(mp3());
  await flush();
  sources[0].onended();
  assert.equal(statuses.at(-1), 'loading');
  assert.equal(player.mouthOpen(), 0);
  assert.equal(sources.length, 1);
  downloads[1].resolve(mp3());
  await flush();
  assert.equal(sources.length, 2);
  assert.equal(statuses.at(-1), 'playing');
  sources[1].onended();
  assert.equal(statuses.at(-1), 'idle');
  player.dispose();
});

test('stop clears playing and prefetched speech and makes old stream handles inert', async () => {
  const { player, sources, statuses, downloads } = queuedSpeechFixture();
  const queue = player.beginSpeech('/api/tts');
  queue.enqueue('最初。');
  queue.enqueue('次。');
  queue.enqueue('最後。');
  await flush();
  downloads[0].resolve(mp3());
  await flush();
  downloads[1].resolve(mp3());
  await flush();
  const staleEnded = sources[0].onended;
  player.stop();
  assert.ok(sources[0].stopped && sources[0].disconnected);
  assert.ok(downloads[1].init.signal.aborted);
  queue.enqueue('停止後。');
  queue.finish();
  staleEnded();
  await flush();
  assert.equal(sources.length, 1);
  assert.equal(downloads.length, 2);
  assert.equal(statuses.at(-1), 'idle');
  assert.equal(player.mouthOpen(), 0);
  player.dispose();
});

test('an aborted download cannot resume or interrupt a newer speech queue', async () => {
  const { player, sources, statuses, downloads } = queuedSpeechFixture();
  const oldQueue = player.beginSpeech('/api/tts');
  oldQueue.enqueue('古い返事。');
  await flush();
  const nextQueue = player.beginSpeech('/api/tts');
  nextQueue.enqueue('新しい返事。');
  nextQueue.finish();
  await flush();
  assert.ok(downloads[0].init.signal.aborted);
  downloads[1].resolve(mp3());
  await flush();
  downloads[0].resolve(mp3());
  oldQueue.enqueue('古い続き。');
  oldQueue.finish();
  await flush();
  assert.equal(sources.length, 1);
  assert.equal(downloads.length, 2);
  assert.equal(statuses.at(-1), 'playing');
  assert.equal(sources[0].stopped, false);
  player.dispose();
});

test('a failed next-line request finishes current speech, drops the tail, and allows a new turn', async () => {
  const { player, sources, statuses, downloads } = queuedSpeechFixture();
  const queue = player.beginSpeech('/api/tts');
  queue.enqueue('最初。');
  queue.enqueue('次。');
  queue.enqueue('最後。');
  queue.finish();
  await flush();
  downloads[0].resolve(mp3());
  await flush();
  downloads[1].resolve(Response.json({ error: '混み合っています。' }, { status: 429 }));
  await flush();
  assert.equal(statuses.at(-1), 'playing');
  assert.equal(sources[0].stopped, false);
  sources[0].onended();
  assert.equal(statuses.at(-1), 'error');
  assert.equal(player.mouthOpen(), 0);
  assert.equal(downloads.length, 2);
  const nextQueue = player.beginSpeech('/api/tts');
  nextQueue.enqueue('もう一度。');
  nextQueue.finish();
  await flush();
  downloads[2].resolve(mp3());
  await flush();
  assert.equal(statuses.at(-1), 'playing');
  player.dispose();
});

test('empty and blocked speech queues never request audio', async () => {
  const { player, context, statuses, downloads } = queuedSpeechFixture();
  const silent = player.beginSpeech('/api/tts');
  silent.finish();
  assert.equal(statuses.at(-1), 'idle');
  context.resume = () => Promise.reject(new Error('Blocked'));
  player.prepareAudio();
  const queue = player.beginSpeech('/api/tts');
  queue.enqueue('こんばんは。');
  queue.finish();
  await flush();
  assert.equal(statuses.at(-1), 'blocked');
  assert.equal(downloads.length, 0);
  player.dispose();
});
