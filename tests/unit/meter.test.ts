import { expect, it } from 'vitest';
import { MeterView } from '../../src/game/draw/meter';
import { callsOf } from './helpers/fake-ctx';
import { SHEET, fakeDc } from './helpers/fake-dc';

// The drawImage of character `index` of the 1x number strip (0-9, then H and I) drawn at world (x, y).
const char = (index: number, x: number, y: number) => [SHEET, 655 + 10 * index, 2, 10, 13, x, y, 10, 13];

it('meter: 5 digits, then 6 above 99999; HI drawn at alpha 0.8 left of the score', () => {
  const m = new MeterView();
  m.step(0, false);
  expect(m.digits()).toBe('00000');
  m.step(123, false);
  expect(m.digits()).toBe('00123');
  m.step(99999, false);
  expect(m.digits()).toBe('99999');
  m.step(100001, false);
  expect(m.digits()).toBe('100001');

  const n = new MeterView();
  n.step(42, false);
  const { dc, calls } = fakeDc();
  n.draw(dc, { width: 600, y: 10, hi: 1234, showScore: true });
  const images = callsOf(calls, 'drawImage');
  // the score at x = 600 - 11 × 6 = 534, one digit every 11 px, drawn from the last digit to the first
  expect(images.slice(0, 5)).toEqual([4, 3, 2, 1, 0].map((i) => char(Number('00042'[i]), 534 + 11 * i, 10)));
  // HI 01234 from x = 534 - 5 × 2 × 10 = 434; the space is skipped
  const hi = [...'HI 01234'].map((ch, i) => (ch === ' ' ? null : char(ch === 'H' ? 10 : ch === 'I' ? 11 : Number(ch), 434 + 11 * i, 10)));
  expect(images.slice(5)).toEqual(hi.filter((c) => c !== null).reverse());
  const alpha = calls.filter((c) => c.op === 'set globalAlpha' || c.op === 'drawImage').map((c) => (c.op === 'drawImage' ? 'draw' : c.args[0]));
  expect(alpha.slice(5, 7)).toEqual([0.8, 'draw']); // the HI only
  expect(dc.ctx.globalAlpha).toBe(1);

  const bare = fakeDc();
  n.draw(bare.dc, { width: 600, y: 4, hi: 0, showScore: false });
  expect(callsOf(bare.calls, 'drawImage')).toEqual([]); // no HI before there is one, and no score when asked not to
  const six = fakeDc();
  m.draw(six.dc, { width: 600, y: 10, hi: 0, showScore: true });
  expect(callsOf(six.calls, 'drawImage').at(-1)).toEqual(char(1, 523, 10)); // 6 digits from x = 600 - 11 × 7
});

it('meter: on an achievement the digits freeze and flash 250 ms off / 250 ms on, about 2 s in total', () => {
  const m = new MeterView();
  m.step(99, false);
  m.step(100, true);
  expect([m.digits(), m.visible()]).toEqual(['00100', true]);
  const shown: boolean[] = [];
  let score = 100;
  while (m.digits() === '00100') {
    score += 1;
    m.step(score, false);
    shown.push(m.visible());
    if (shown.length > 500) break;
  }
  // 15 steps of 1000 / 60 ms add up to just under 250 ms, so each flash is 15 steps off and 15 on: 250 ms each
  const flash = [...Array<boolean>(15).fill(false), ...Array<boolean>(15).fill(true)];
  // four flashes of 30 steps, a step that ends them, then the next step shows the score again
  expect(shown).toEqual([...flash, ...flash, ...flash, ...flash, true, true]);
  expect(m.digits()).toBe(String(score).padStart(5, '0'));
  const { dc, calls } = fakeDc();
  const hidden = new MeterView();
  hidden.step(100, true);
  hidden.step(101, false);
  hidden.draw(dc, { width: 600, y: 10, hi: 0, showScore: true });
  expect(callsOf(calls, 'drawImage')).toEqual([]); // off: the digits are not drawn
});
