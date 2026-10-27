import type { SoundName } from './sound';

/** The part of the page that clicks come from: the window, in the game. */
export interface ClickSource {
  addEventListener(type: 'click', fn: (e: { target: unknown }) => void, capture: boolean): void;
  removeEventListener(type: 'click', fn: (e: { target: unknown }) => void, capture: boolean): void;
}

/** What a press needs of the sound. */
export interface PressSound {
  unlock(): Promise<void>;
  play(name: SoundName): void;
}

// What a click lands on: an element, which may be a button or be inside one.
interface Clicked {
  closest(selector: string): { disabled?: boolean } | null;
}

const isClicked = (t: unknown): t is Clicked =>
  typeof t === 'object' && t !== null && typeof (t as { closest?: unknown }).closest === 'function';

/**
 * Every button that is pressed answers with the original's press sound, the sound of a jump: a click on it or on
 * anything in it, by touch, mouse or key, even on a button that greys out as it is pressed. The very first press is
 * heard once the sounds have loaded. A muted game stays quiet, and the sound button is heard as it turns the sound
 * back on. Gives the way to stop.
 */
export function soundOnButtons(page: ClickSource, sound: PressSound): () => void {
  // Looks at the button before the game's own handlers do: one may grey it out at once, as CREATE LOBBY does.
  const onClick = (e: { target: unknown }) => {
    const button = isClicked(e.target) ? e.target.closest('button') : null;
    if (!button || button.disabled) return;
    const unlocked = sound.unlock();
    // Plays after those handlers, so the sound button has already turned the sound on or off.
    setTimeout(() => void unlocked.then(() => sound.play('press')), 0);
  };
  page.addEventListener('click', onClick, true);
  return () => page.removeEventListener('click', onClick, true);
}
