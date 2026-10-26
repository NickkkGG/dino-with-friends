import { InputState } from './input-state';

// Keys whose default would scroll the page.
const NO_SCROLL = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

// Whether an event comes from one of the screen's own controls (MENU, the speaker), which deal with it themselves.
function fromUi(e: Event): boolean {
  const t = e.target as { closest?: (selector: string) => unknown } | null;
  return typeof t?.closest === 'function' && t.closest('[data-ui]') !== null;
}

/**
 * Feeds the keyboard (anywhere on the page) and the touches and clicks on the play area into an InputState, and lets go
 * of everything when the page loses focus or is hidden.
 */
export class InputController {
  readonly state = new InputState();
  private readonly surface: HTMLElement;
  private readonly touchAction: string;

  constructor(surface: HTMLElement) {
    this.surface = surface;
    this.touchAction = surface.style.touchAction;
    surface.style.touchAction = 'none'; // no scrolling or zooming under the thumbs
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    surface.addEventListener('pointerdown', this.onPointerDown);
    surface.addEventListener('pointerup', this.onPointerUp);
    surface.addEventListener('pointercancel', this.onPointerCancel);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.surface.removeEventListener('pointerdown', this.onPointerDown);
    this.surface.removeEventListener('pointerup', this.onPointerUp);
    this.surface.removeEventListener('pointercancel', this.onPointerCancel);
    this.surface.style.touchAction = this.touchAction;
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (fromUi(e)) return;
    if (NO_SCROLL.has(e.code)) e.preventDefault();
    this.state.keyDown(e.code, e.repeat);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.state.keyUp(e.code);
  };

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (fromUi(e)) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return; // only a left click, as in the original
    const r = this.surface.getBoundingClientRect();
    this.state.pointerDown(e.pointerId, e.pointerType === 'mouse' ? 'mouse' : 'touch', e.clientX - r.left, r.width);
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    this.state.pointerUp(e.pointerId);
  };

  private readonly onPointerCancel = (e: PointerEvent): void => {
    this.state.pointerCancel(e.pointerId);
  };

  private readonly onBlur = (): void => {
    this.state.clear();
  };

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') this.state.clear();
  };
}
