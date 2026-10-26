import type { StepInput } from '../../shared/sim/world';

/** What the player did since the last step: the world's input, and what may restart a round that is over. */
export interface InputFrame {
  step: StepInput;
  /** Which of the original's restart controls were let go of since the last step. */
  restart: { jumpKey: boolean; enter: boolean; pointer: boolean };
}

type Role = 'jump' | 'duck' | 'none';

const KEY_ROLES: Readonly<Record<string, Role>> = { Space: 'jump', ArrowUp: 'jump', ArrowDown: 'duck' };
const ENTER_KEYS = new Set(['Enter', 'NumpadEnter']);

/**
 * The keys and touches that are down, turned into one StepInput per step. A key or touch is a press on the step it goes
 * down and a release on the step it comes up, never again while it is held; only what was seen going down can come up.
 * On a touch screen the left half ducks and the right half jumps ('split'), or the whole screen jumps ('any'). A touch
 * keeps what it does until it is lifted. A mouse never plays: its release only counts towards a restart.
 */
export class InputState {
  private readonly keys = new Map<string, Role>();
  private readonly pointers = new Map<number, Role>();
  private mode: 'split' | 'any' = 'split';
  private jumpPressed = false;
  private jumpReleased = false;
  private duckPressed = false;
  private restart = { jumpKey: false, enter: false, pointer: false };

  keyDown(code: string, repeat: boolean): void {
    if (repeat || this.keys.has(code)) return;
    if (ENTER_KEYS.has(code)) this.keys.set(code, 'none');
    const role = KEY_ROLES[code];
    if (role) {
      this.keys.set(code, role);
      this.press(role);
    }
  }

  keyUp(code: string): void {
    const role = this.keys.get(code);
    if (role === undefined) return;
    this.keys.delete(code);
    this.release(role);
    if (role === 'jump') this.restart.jumpKey = true;
    if (ENTER_KEYS.has(code)) this.restart.enter = true;
  }

  /** A touch or a click on the play area, `x` CSS px from its left edge, which is `width` wide. Pens count as touches. */
  pointerDown(id: number, kind: 'touch' | 'mouse', x: number, width: number): void {
    if (this.pointers.has(id)) this.pointerCancel(id);
    let role: Role = 'none';
    if (kind === 'touch') role = this.mode === 'any' || x >= width / 2 ? 'jump' : 'duck';
    this.pointers.set(id, role);
    this.press(role);
  }

  pointerUp(id: number): void {
    if (!this.pointers.has(id)) return;
    this.pointerCancel(id);
    this.restart.pointer = true;
  }

  /** A touch the browser took away, to scroll or for a system gesture: it lets go, but asks for nothing. */
  pointerCancel(id: number): void {
    const role = this.pointers.get(id);
    if (role === undefined) return;
    this.pointers.delete(id);
    this.release(role);
  }

  /** What a touch that starts from now on does. Touches that are down keep theirs. */
  setTouchMode(m: 'split' | 'any'): void {
    this.mode = m;
  }

  /** Lets go of everything at once, without releases, as when the page loses focus with keys or touches down. */
  clear(): void {
    this.keys.clear();
    this.pointers.clear();
    this.take();
  }

  /** The input for one step, and the restart controls let go of since the last one. */
  take(): InputFrame {
    const frame: InputFrame = {
      step: {
        jumpPressed: this.jumpPressed,
        jumpReleased: this.jumpReleased,
        duckPressed: this.duckPressed,
        duckHeld: this.holds('duck'),
      },
      restart: this.restart,
    };
    this.jumpPressed = false;
    this.jumpReleased = false;
    this.duckPressed = false;
    this.restart = { jumpKey: false, enter: false, pointer: false };
    return frame;
  }

  private press(role: Role): void {
    if (role === 'jump') this.jumpPressed = true;
    if (role === 'duck') this.duckPressed = true;
  }

  private release(role: Role): void {
    if (role === 'jump') this.jumpReleased = true;
  }

  private holds(role: Role): boolean {
    for (const r of this.keys.values()) if (r === role) return true;
    for (const r of this.pointers.values()) if (r === role) return true;
    return false;
  }
}
