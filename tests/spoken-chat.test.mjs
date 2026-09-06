import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

function load(file) {
  const url = new URL(file, import.meta.url);
  const { outputText } = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  });
  const exports = {};
  const require = createRequire(url);
  new Function('require', 'exports', outputText)(name => name === './aiChat' ? load('../lib/aiChat.ts') : require(name), exports);
  return exports;
}
const { streamSpokenChat } = load('../lib/spokenChat.ts');
const flush = () => new Promise(resolve => setImmediate(resolve));
const reply = 'ふふ。こんばんは。\nゆっくり休んでね。';

function fixture(enabled = true) {
  let settle;
  let settled = false;
  const completed = new Promise(resolve => { settle = resolve; });
  const lines = [];
  const shown = [];
  const animations = [];
  let callbacks;
  let finished = false;
  const voice = {
    beginSpeech(endpoint, handlers) {
      assert.equal(endpoint, '/api/tts');
      callbacks = handlers;
      return {
        enqueue: text => { if (!settled) lines.push(text); },
        finish() {
          finished = true;
          if (!lines.length && !settled) end('complete');
          return completed;
        },
        cancel() { if (!settled) end('stopped'); },
      };
    },
  };
  function end(result) {
    settled = true;
    callbacks.onSettled(result);
    settle(result);
  }
  const controller = new AbortController();
  const events = [{ type: 'speech', enabled }, { type: 'animation', animation: 'laugh' },
    { type: 'text', text: reply }, { type: 'done' }];
  const options = { endpoint: '/api/chat', speechEndpoint: '/api/tts', voice, messages: [{ role: 'user', content: 'こんばんは' }],
    signal: controller.signal, onText: text => shown.push(text), onAnimation: animation => animations.push(animation),
    fetcher: async () => new Response(events.map(event => JSON.stringify(event)).join('\n') + '\n',
      { headers: { 'Content-Type': 'application/x-ndjson' } }),
  };
  return { options, lines, shown, animations, controller, end, get finished() { return finished; },
    start(index) { callbacks.onStart(lines[index]); } };
}

test('each line and its animation appear only when its audio starts; the complete reply stays hidden', async () => {
  const f = fixture();
  let completed = false;
  const pending = streamSpokenChat(f.options).then(text => { completed = true; return text; });
  await flush();
  assert.equal(f.finished, true, 'the AI stream has already finished');
  assert.deepEqual(f.lines, ['ふふ。こんばんは。', 'ゆっくり休んでね。'], 'punctuation within one line must not multiply requests');
  assert.deepEqual(f.shown, []);
  assert.deepEqual(f.animations, []);
  assert.equal(completed, false);
  f.start(0);
  assert.deepEqual(f.shown, ['ふふ。こんばんは。']);
  assert.deepEqual(f.animations, ['laugh']);
  assert.equal(completed, false);
  f.start(1);
  assert.equal(f.shown.at(-1), reply);
  assert.equal(f.animations.length, 1);
  f.end('complete');
  assert.equal(await pending, reply);
});

test('silent replies show text without waiting for audio', async () => {
  const f = fixture(false);
  assert.equal(await streamSpokenChat(f.options), reply);
  assert.equal(f.shown.at(-1), reply);
  assert.deepEqual(f.lines, []);
  assert.deepEqual(f.animations, ['laugh']);
});

test('voice failures or tab hiding reveal the remaining text and complete the turn', async () => {
  for (const result of ['error', 'blocked', 'stopped']) {
    const f = fixture();
    const pending = streamSpokenChat(f.options);
    await flush();
    f.start(0);
    f.end(result);
    assert.equal(await pending, reply);
    assert.equal(f.shown.at(-1), reply);
  }
  const f = fixture();
  assert.equal(await streamSpokenChat({ ...f.options, voice: null }), reply);
  assert.equal(f.shown.at(-1), reply);
});

test('Stop cancels the voice queue and cannot reveal or commit the unspoken tail', async () => {
  const f = fixture();
  const pending = streamSpokenChat(f.options);
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await flush();
  f.start(0);
  f.controller.abort();
  await rejected;
  f.start(1);
  assert.deepEqual(f.shown, ['ふふ。こんばんは。']);
});
