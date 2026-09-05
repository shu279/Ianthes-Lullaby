import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { AnimationClip, AnimationMixer, LoopOnce, NumberKeyframeTrack, Object3D } from 'three';
import catalog from '../lib/chatAnimations.json' with { type: 'json' };

const source = await readFile(new URL('../lib/chatAnimationState.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { chatAnimationReducer: reduce, initialChatAnimationState: initial } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const request = (state, animation) => reduce(state, { type: 'request', animation });
const finish = state => reduce(state, { type: 'finished', playId: state.playId });

test('the catalog exposes every animation file and each contains playable tracks', async () => {
  const files = (await readdir(new URL('../public/animations/', import.meta.url))).filter(file => file.endsWith('.glb')).sort();
  assert.deepEqual(Object.values(catalog).map(entry => entry.file.split('/').at(-1)).sort(), files);
  for (const entry of Object.values(catalog)) {
    assert.ok(entry.label && entry.use);
    const bytes = await readFile(new URL(`../public${entry.file}`, import.meta.url));
    assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
    assert.equal(bytes.readUInt32LE(4), 2);
    assert.equal(bytes.readUInt32LE(8), bytes.length);
    const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
    const clip = gltf.animations[0];
    assert.ok(clip.channels.length > 0);
    const duration = Math.max(...clip.samplers.map(sampler => gltf.accessors[sampler.input].max[0]));
    assert.ok(Number.isFinite(duration) && duration > 0);
  }
});

test('intro, anger, pose, laugh, surprise and waking finish in idle', () => {
  for (const animation of ['intro', 'attack', 'pose', 'laugh', 'surprise', 'sleepOut']) {
    const playing = request(initial, animation);
    assert.equal(playing.animation, animation);
    const completed = finish(playing);
    assert.equal(completed.animation, 'idle');
    assert.equal(completed.sleep, 'awake');
  }
  assert.equal(initial.opening, true);
  assert.equal(finish(initial).opening, false);
});

test('repeated reactions replay fully and an old completion cannot end the new reaction', () => {
  const first = request(initial, 'attack');
  const second = request(first, 'attack');
  assert.ok(second.playId > first.playId);
  assert.equal(reduce(second, { type: 'finished', playId: first.playId }), second);
  assert.equal(finish(second).animation, 'idle');
});

test('sleep holds its final pose and a new reaction wakes before playing', () => {
  const entering = request(initial, 'sleepIn');
  assert.equal(entering.sleep, 'entering');
  const asleep = finish(entering);
  assert.equal(asleep.sleep, 'asleep');
  assert.equal(asleep.animation, 'sleepIn');
  assert.equal(request(asleep, 'sleepIn'), asleep);
  assert.equal(finish(asleep), asleep);
  const waking = request(asleep, 'attack');
  assert.equal(waking.animation, 'sleepOut');
  assert.equal(waking.queued, 'attack');
  const angry = finish(waking);
  assert.equal(angry.animation, 'attack');
  assert.equal(angry.sleep, 'awake');
  assert.equal(finish(angry).animation, 'idle');
});

test('requests during waking keep the latest reaction without restarting the waking clip', () => {
  const waking = request(request(initial, 'sleepIn'), 'idle');
  const laughing = request(waking, 'laugh');
  const posing = request(laughing, 'pose');
  assert.equal(posing.playId, waking.playId);
  assert.equal(posing.queued, 'pose');
  assert.equal(finish(posing).animation, 'pose');
  const sleepAgain = request(posing, 'sleepIn');
  assert.equal(finish(sleepAgain).sleep, 'entering');
  const justWake = request(posing, 'sleepOut');
  assert.equal(finish(justWake).animation, 'idle');
});

test('automatic sleep starts only from awake idle and cannot interrupt a reaction', () => {
  const idle = finish(initial);
  assert.equal(reduce(idle, { type: 'idleTimeout' }).animation, 'sleepIn');
  for (const animation of Object.keys(catalog).filter(value => value !== 'idle')) {
    const playing = request(initial, animation);
    assert.equal(reduce(playing, { type: 'idleTimeout' }), playing);
  }
});

test('Three.js completion events advance a reaction only after its playback actually finishes', () => {
  let state = request(initial, 'attack');
  const playId = state.playId;
  const mixer = new AnimationMixer(new Object3D());
  const clip = new AnimationClip('reaction', 1, [new NumberKeyframeTrack('.position[x]', [0, 1], [0, 1])]);
  const action = mixer.clipAction(clip).setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  mixer.addEventListener('finished', event => {
    if (event.action === action) state = reduce(state, { type: 'finished', playId });
  });
  action.play();
  mixer.update(0.5);
  assert.equal(state.animation, 'attack');
  mixer.update(0.6);
  assert.equal(state.animation, 'idle');
});
