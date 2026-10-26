import { GlyphSheetView } from './dev/GlyphSheetView';
import { SpriteSheetView } from './dev/SpriteSheetView';

export const GAME_TITLE = 'DINO with FRIENDS';

// In dev, ?view=<name> opens a page for checking the drawing by eye instead of the game.
function devPage(view: string | null) {
  if (view === 'sprites') return <SpriteSheetView />;
  if (view === 'glyphs') return <GlyphSheetView />;
  return null;
}

export function App() {
  const view = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('view') : null;
  return <main data-testid="app">{(import.meta.env.DEV && devPage(view)) || <h1>{GAME_TITLE}</h1>}</main>;
}
