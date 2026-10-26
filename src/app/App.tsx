import { useEffect, useRef, useState } from 'react';
import { SOUND_URLS } from '../game/assets';
import { debugState, installDebugHook } from '../game/debug';
import { HI_KEY } from '../game/solo-rules';
import { Sound } from '../game/sound';
import { loadSpriteSet } from '../game/sprites';
import type { SpriteSet } from '../game/sprites';
import { readNumber } from '../game/storage';
import { NO_TEST_MODE, parseTestMode } from '../game/test-mode';
import type { TestMode } from '../game/test-mode';
import { PixelButton } from '../ui/PixelButton';
import { PixelText } from '../ui/PixelText';
import { GlyphSheetView } from './dev/GlyphSheetView';
import { SceneView } from './dev/SceneView';
import { SpriteSheetView } from './dev/SpriteSheetView';
import { SoloScreen } from './SoloScreen';

export const GAME_TITLE = 'DINO with FRIENDS';

type Screen = 'title' | 'solo' | 'credits';

// In dev, ?view=<name> opens a page for checking the drawing by eye instead of the game.
function devPage(view: string | null) {
  if (view === 'sprites') return <SpriteSheetView />;
  if (view === 'glyphs') return <GlyphSheetView />;
  if (view === 'scene') return <SceneView />;
  return null;
}

// A page may only make sound after a touch, click or key, and a touch only counts once it is lifted, so every one of
// them asks the sound to unlock (which does nothing once it has).
function useUnlockSound(sound: Sound): void {
  useEffect(() => {
    const unlock = () => void sound.unlock();
    const events = ['pointerdown', 'pointerup', 'keydown'] as const;
    for (const e of events) window.addEventListener(e, unlock, true);
    return () => {
      for (const e of events) window.removeEventListener(e, unlock, true);
    };
  }, [sound]);
}

// window.__dwf for the browser tests, on every screen of the dev build.
function useDebugHook(screen: Screen, sound: Sound): void {
  const current = useRef(screen);
  useEffect(() => {
    current.current = screen;
  }, [screen]);
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    return installDebugHook(() => debugState(current.current, readNumber(HI_KEY, 0), sound.muted));
  }, [sound]);
}

// The title screen until the real one, with the demo, comes: the name and the way into SOLO.
function TempTitle({ onSolo }: { onSolo(): void }) {
  return (
    <div data-testid="title-screen" className="temp-title">
      <PixelText text={GAME_TITLE} size={3} />
      <PixelButton label="SOLO" variant="outline" onClick={onSolo} testId="btn-solo" />
    </div>
  );
}

// The game: the sprites and the sound, loaded once, and the screen on show.
function Game({ first }: { first: Screen }) {
  const [screen, setScreen] = useState<Screen>(first);
  const [sprites, setSprites] = useState<SpriteSet | null>(null);
  const [sound] = useState(() => new Sound(SOUND_URLS));
  const [testMode] = useState<TestMode>(() =>
    import.meta.env.DEV ? parseTestMode(window.location.search, true) : { ...NO_TEST_MODE },
  );
  useUnlockSound(sound);
  useDebugHook(screen, sound);

  useEffect(() => {
    let live = true;
    void loadSpriteSet().then((set) => {
      if (live) setSprites(set);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!sprites) return null;
  if (screen === 'solo') {
    return <SoloScreen sprites={sprites} sound={sound} testMode={testMode} onMenu={() => setScreen('title')} />;
  }
  return <TempTitle onSolo={() => setScreen('solo')} />;
}

export function App() {
  const view = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('view') : null;
  const page = import.meta.env.DEV ? devPage(view) : null;
  return <main data-testid="app">{page ?? <Game first={view === 'solo' ? 'solo' : 'title'} />}</main>;
}
