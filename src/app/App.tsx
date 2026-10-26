import { SpriteSheetView } from './dev/SpriteSheetView';

export const GAME_TITLE = 'DINO with FRIENDS';

export function App() {
  // In dev, ?view=<name> opens a page for checking the drawing by eye.
  const view = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('view') : null;
  return (
    <main data-testid="app">
      {import.meta.env.DEV && view === 'sprites' ? <SpriteSheetView /> : <h1>{GAME_TITLE}</h1>}
    </main>
  );
}
