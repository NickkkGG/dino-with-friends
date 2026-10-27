import { readFlag, writeFlag } from './storage';

export type SoundName = 'press' | 'hit' | 'reached' | 'pickup' | 'countdown';

type ToneSound = 'pickup' | 'countdown';
type FileSound = Exclude<SoundName, ToneSound>;

const FILES: readonly FileSound[] = ['press', 'hit', 'reached'];
const MUTE_KEY = 'dwf.muted';
// The sounds the original does not have, as square-wave notes that each fade out: three rising ones for the skill
// pickup, and one a second for the countdown to a race.
const TONES: Readonly<Record<ToneSound, { notes: readonly number[]; noteS: number }>> = {
  pickup: { notes: [523.25, 659.25, 1046.5], noteS: 0.05 },
  countdown: { notes: [440], noteS: 0.1 },
};
const TONE_GAIN = 0.06;

/**
 * The original's three sounds, the pickup and the countdown, played as the original plays its sounds: each one straight
 * to the speakers.
 * Browsers only let a page make sound after a touch, click or key, so nothing plays until unlock() runs in one.
 */
export class Sound {
  private readonly urls: Readonly<Record<FileSound, string>>;
  private readonly buffers: Partial<Record<FileSound, AudioBuffer>> = {};
  private ctx: AudioContext | null = null;
  private loading: Promise<void> | null = null;
  private isMuted: boolean;

  constructor(urls: { press: string; hit: string; reached: string }) {
    this.urls = urls;
    this.isMuted = readFlag(MUTE_KEY, false);
  }

  get muted(): boolean {
    return this.isMuted;
  }

  setMuted(m: boolean): void {
    this.isMuted = m;
    writeFlag(MUTE_KEY, m);
  }

  /**
   * Call from a touch, click or key handler. The first call makes the AudioContext and loads the sounds; any call
   * resumes a context the browser has suspended. Settles once the sounds are loaded, or have failed to, and the context
   * has started, or the browser has refused to start it: Safari takes a moment to start one, often longer than the
   * sounds take to load.
   */
  unlock(): Promise<void> {
    const ctx = this.ctx ?? this.createContext();
    if (!ctx) return Promise.resolve();
    const started = ctx.state === 'running' ? null : ctx.resume().catch(() => {});
    return Promise.all([started, (this.loading ??= this.load(ctx))]).then(() => {});
  }

  /** Plays a sound now. Nothing happens while muted, before unlock(), or while a sound is not loaded yet. */
  play(name: SoundName): void {
    const ctx = this.ctx;
    if (this.isMuted || !ctx || ctx.state !== 'running') return;
    if (name === 'pickup' || name === 'countdown') {
      this.playTone(ctx, TONES[name]);
      return;
    }
    const buffer = this.buffers[name];
    if (!buffer) return;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  }

  private createContext(): AudioContext | null {
    if (typeof AudioContext === 'undefined') return null;
    try {
      this.ctx = new AudioContext();
    } catch {
      return null; // no sound, as in a browser without Web Audio
    }
    return this.ctx;
  }

  private async load(ctx: AudioContext): Promise<void> {
    await Promise.all(
      FILES.map(async (name) => {
        try {
          const res = await fetch(this.urls[name]);
          this.buffers[name] = await ctx.decodeAudioData(await res.arrayBuffer());
        } catch {
          // This sound stays silent; the others still play.
        }
      }),
    );
  }

  private playTone(ctx: AudioContext, tone: (typeof TONES)[ToneSound]): void {
    const t0 = ctx.currentTime;
    const at = (i: number) => t0 + i * tone.noteS;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    tone.notes.forEach((f, i) => {
      osc.frequency.setValueAtTime(f, at(i));
      gain.gain.setValueAtTime(TONE_GAIN, at(i));
      gain.gain.linearRampToValueAtTime(0, at(i + 1));
    });
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(at(tone.notes.length));
  }
}
