import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Sound } from '../../src/game/sound';
import { setStorageForTests } from '../../src/game/storage';
import { memoryStorage } from './helpers/fake-storage';

const URLS = { press: '/press.mp3', hit: '/hit.mp3', reached: '/reached.mp3' };

// Just enough of the Web Audio API to see what Sound asks of it.
class FakeParam {
  readonly events: (readonly [string, number, number])[] = [];
  setValueAtTime(v: number, t: number) {
    this.events.push(['set', v, t]);
    return this;
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.events.push(['ramp', v, t]);
    return this;
  }
}

class FakeNode {
  readonly kind: string;
  readonly to: unknown[] = [];
  readonly starts: number[] = [];
  readonly stops: number[] = [];
  buffer: unknown = null;
  type = '';
  readonly frequency = new FakeParam();
  readonly gain = new FakeParam();
  constructor(kind: string) {
    this.kind = kind;
  }
  connect<T>(n: T): T {
    this.to.push(n);
    return n;
  }
  start(t = 0) {
    this.starts.push(t);
  }
  stop(t = 0) {
    this.stops.push(t);
  }
}

class FakeAudioContext {
  static made: FakeAudioContext[] = [];
  state = 'suspended';
  resumes = 0;
  readonly currentTime = 2;
  readonly destination = { kind: 'destination' };
  readonly nodes: FakeNode[] = [];
  constructor() {
    FakeAudioContext.made.push(this);
  }
  resume() {
    this.resumes += 1;
    this.state = 'running';
    return Promise.resolve();
  }
  // A "decoded" sound is the text of the file it came from.
  decodeAudioData(data: ArrayBuffer) {
    const text = new TextDecoder().decode(data);
    return text.startsWith('bad') ? Promise.reject(new Error('cannot decode')) : Promise.resolve({ text });
  }
  private node(kind: string) {
    const n = new FakeNode(kind);
    this.nodes.push(n);
    return n;
  }
  createBufferSource() {
    return this.node('source');
  }
  createOscillator() {
    return this.node('oscillator');
  }
  createGain() {
    return this.node('gain');
  }
}

let fetched: string[];
beforeEach(() => {
  setStorageForTests(memoryStorage());
  FakeAudioContext.made = [];
  fetched = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// Web Audio as a browser has it; each file holds its own name, or "bad" for the ones in `bad`.
function withAudio(bad: string[] = []) {
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('fetch', async (url: string) => {
    fetched.push(url);
    if (url === 'offline') throw new TypeError('Failed to fetch');
    return new Response(bad.includes(url) ? 'bad' : url);
  });
}

it('remembers mute in dwf.muted and never throws without audio', async () => {
  const store = memoryStorage();
  setStorageForTests(store);
  const a = new Sound(URLS);
  expect(a.muted).toBe(false); // sound is on until it is turned off
  a.setMuted(true);
  expect(a.muted).toBe(true);
  expect(store.getItem('dwf.muted')).toBe('1');
  expect(new Sound(URLS).muted).toBe(true);
  a.setMuted(false);
  expect(new Sound(URLS).muted).toBe(false);

  // No AudioContext here, as in a browser without Web Audio: unlock settles, play does nothing.
  expect(typeof globalThis.AudioContext).toBe('undefined');
  await expect(a.unlock()).resolves.toBeUndefined();
  for (const name of ['press', 'hit', 'reached', 'pickup'] as const) expect(() => a.play(name)).not.toThrow();
  setStorageForTests('throw');
  expect(() => new Sound(URLS).setMuted(true)).not.toThrow();
});

it('unlock makes one AudioContext, resumes it and decodes the three sounds once', async () => {
  withAudio();
  const s = new Sound(URLS);
  await s.unlock();
  await s.unlock();
  expect(FakeAudioContext.made).toHaveLength(1);
  expect(FakeAudioContext.made[0]!.state).toBe('running');
  expect(fetched.sort()).toEqual(['/hit.mp3', '/press.mp3', '/reached.mp3']);
});

it('unlock again resumes a context the browser suspended', async () => {
  withAudio();
  const s = new Sound(URLS);
  await s.unlock();
  const ctx = FakeAudioContext.made[0]!;
  ctx.state = 'interrupted'; // Safari, after a call
  await s.unlock();
  expect(ctx.resumes).toBe(2);
  await s.unlock();
  expect(ctx.resumes).toBe(2); // running: nothing to do
  expect(FakeAudioContext.made).toHaveLength(1);
});

it('play sends the decoded sound straight to the speakers, as the original does', async () => {
  withAudio();
  const s = new Sound(URLS);
  await s.unlock();
  const ctx = FakeAudioContext.made[0]!;
  s.play('hit');
  expect(ctx.nodes).toHaveLength(1);
  const [src] = ctx.nodes;
  expect(src!.kind).toBe('source');
  expect(src!.buffer).toEqual({ text: '/hit.mp3' });
  expect(src!.to).toEqual([ctx.destination]);
  expect(src!.starts).toEqual([0]);
  s.play('press');
  s.play('reached');
  expect(ctx.nodes.map((n) => n.buffer)).toEqual([{ text: '/hit.mp3' }, { text: '/press.mp3' }, { text: '/reached.mp3' }]);
});

it('nothing plays while muted, before unlock, or while the context is not running', async () => {
  withAudio();
  const s = new Sound(URLS);
  s.play('hit'); // before unlock
  await s.unlock();
  const ctx = FakeAudioContext.made[0]!;
  s.setMuted(true);
  s.play('hit');
  s.play('pickup');
  expect(ctx.nodes).toHaveLength(0);
  s.setMuted(false);
  ctx.state = 'suspended';
  s.play('hit');
  s.play('pickup');
  expect(ctx.nodes).toHaveLength(0);
});

it('a sound that fails to load or decode is silent, and the others still play', async () => {
  withAudio(['/hit.mp3']);
  const s = new Sound({ ...URLS, reached: 'offline' });
  await expect(s.unlock()).resolves.toBeUndefined();
  const ctx = FakeAudioContext.made[0]!;
  s.play('hit');
  s.play('reached');
  expect(ctx.nodes).toHaveLength(0);
  s.play('press');
  expect(ctx.nodes.map((n) => n.buffer)).toEqual([{ text: '/press.mp3' }]);
});

it('pickup: three square notes of 50 ms, 523.25 → 659.25 → 1046.5 Hz, each fading from 0.06 to 0', async () => {
  withAudio();
  const s = new Sound(URLS);
  await s.unlock();
  const ctx = FakeAudioContext.made[0]!;
  s.play('pickup');
  const osc = ctx.nodes.find((n) => n.kind === 'oscillator')!;
  const gain = ctx.nodes.find((n) => n.kind === 'gain')!;
  expect(osc.type).toBe('square');
  const t = ctx.currentTime;
  const at = (i: number) => t + i * 0.05;
  expect(osc.frequency.events).toEqual([523.25, 659.25, 1046.5].map((f, i) => ['set', f, at(i)]));
  expect(gain.gain.events).toEqual(
    [0, 1, 2].flatMap((i) => [
      ['set', 0.06, at(i)],
      ['ramp', 0, at(i + 1)],
    ]),
  );
  expect(osc.to).toEqual([gain]);
  expect(gain.to).toEqual([ctx.destination]);
  expect(osc.starts).toEqual([t]);
  expect(osc.stops).toEqual([at(3)]);
});
