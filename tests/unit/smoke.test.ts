import { expect, it } from 'vitest';
import { GAME_TITLE } from '../../src/app/App';

it('names the game', () => {
  expect(GAME_TITLE).toBe('DINO with FRIENDS');
});
