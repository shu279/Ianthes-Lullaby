import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadTypeScript(path) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

const { conversationTree: tree } = await loadTypeScript('../lib/conversationTree.ts');
const { ConversationVoice } = await loadTypeScript('../lib/conversationVoice.ts');

function reachable(start) {
  const visited = new Set();
  const pending = [start];
  while (pending.length) {
    const id = pending.pop();
    if (visited.has(id)) continue;
    assert.ok(tree[id], `Missing node: ${id}`);
    visited.add(id);
    pending.push(...tree[id].choices.map(choice => choice.next));
  }
  return visited;
}

test('all dialogue is reachable, has real audio, and offers a path to rest', async () => {
  assert.equal(reachable('start').size, Object.keys(tree).length);
  const voices = new Set();
  for (const [id, node] of Object.entries(tree)) {
    assert.equal(node.id, id);
    assert.ok(reachable(id).has('quiet'), `${id} cannot reach quiet`);
    assert.equal(new Set(node.choices.map(c => c.label)).size, node.choices.length);
    if (node.voice) {
      voices.add(node.voice);
      await access(new URL(`../public${node.voice}`, import.meta.url));
    }
  }
  assert.equal(voices.size, 11);
  assert.equal(tree.quiet.voice, undefined);
});

function fixture() {
  const clips = [];
  const statuses = [];
  const player = new ConversationVoice(() => {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    const clip = {
      src: '', volume: 0, paused: false, onended: null, onerror: null,
      play: () => promise,
      pause() { this.paused = true; },
      removeAttribute() { this.src = ''; },
      load() {}, resolve, reject,
    };
    clips.push(clip);
    return clip;
  }, (status) => statuses.push(status));
  return { player, clips, statuses };
}

test('rapid choices stop old audio and ignore a late rejection', async () => {
  const { player, clips, statuses } = fixture();
  const first = player.play('/voice/001.wav');
  const second = player.play('/voice/002.wav');
  assert.ok(clips[0].paused);
  assert.equal(clips[0].onended, null);
  clips[1].resolve();
  await second;
  clips[0].reject(new Error('interrupted'));
  await first;
  assert.equal(statuses.at(-1), 'playing');
  clips[1].onended();
  assert.equal(statuses.at(-1), 'idle');
});

test('mute or leaving the page cancels pending playback', async () => {
  const { player, clips, statuses } = fixture();
  const pending = player.play('/voice/001.wav');
  player.stop();
  clips[0].resolve();
  await pending;
  assert.ok(clips[0].paused);
  assert.equal(statuses.at(-1), 'idle');
});

test('autoplay failure is recoverable with another user gesture', async () => {
  const { player, clips, statuses } = fixture();
  const pending = player.play('/voice/001.wav');
  clips[0].reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
  await pending;
  assert.equal(statuses.at(-1), 'blocked');
  const retry = player.play('/voice/001.wav');
  clips[1].resolve();
  await retry;
  assert.equal(statuses.at(-1), 'playing');
});

test('failed assets release the speaking state and ignore later play resolution', async () => {
  const { player, clips, statuses } = fixture();
  const pending = player.play('/missing.wav');
  clips[0].onerror();
  clips[0].resolve();
  await pending;
  assert.ok(clips[0].paused);
  assert.equal(statuses.at(-1), 'error');
});
