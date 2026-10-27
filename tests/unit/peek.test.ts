import { expect, it } from 'vitest';
import { peekSlots } from '../../src/app/peek';

it('shows the first ones up to the limit, and counts the rest', () => {
  const p = (id: string) => ({ id, name: id.toUpperCase(), me: false });
  expect(peekSlots([p('a'), p('b')], 3)).toEqual({ shown: [p('a'), p('b')], more: 0 });
  expect(peekSlots([p('a'), p('b'), p('c'), p('d'), p('e')], 3)).toEqual({ shown: [p('a'), p('b'), p('c')], more: 2 });
});
