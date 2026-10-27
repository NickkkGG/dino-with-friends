import { expect, it } from 'vitest';
import { ClockSync } from '../../src/net/clock';

it('finds the server clock from one ping', () => {
  const c = new ClockSync();
  c.add({ sent: 1000, received: 1100, server: 50_000 }); // the server read its clock halfway: 1050 here
  expect(c.offset()).toBe(48_950);
  expect(c.toServer(2000)).toBe(50_950);
  expect(c.count).toBe(1);
});

it('knows nothing before the first ping', () => {
  const c = new ClockSync();
  expect([c.count, c.offset(), c.toServer(1234)]).toEqual([0, 0, 1234]);
});

it('takes the median of the last five, so one slow ping does not move it', () => {
  const c = new ClockSync();
  c.add({ sent: 1000, received: 1100, server: 50_000 }); // 48 950
  c.add({ sent: 2000, received: 2080, server: 50_992 }); // 48 952
  c.add({ sent: 3000, received: 3900, server: 52_050 }); // 900 ms there and back, most of it on the way back: 48 600
  c.add({ sent: 4000, received: 4120, server: 53_008 }); // 48 948
  c.add({ sent: 5000, received: 5060, server: 53_981 }); // 48 951
  expect(c.offset()).toBe(48_950);
});

it('takes the middle two of an even count', () => {
  const c = new ClockSync();
  for (const offset of [40, 10, 30, 20]) c.add({ sent: 0, received: 0, server: offset });
  expect(c.offset()).toBe(25);
});

it('works for a phone whose clock is minutes off', () => {
  const behind = new ClockSync();
  behind.add({ sent: 400_000, received: 400_100, server: 100_050 });
  expect(behind.offset()).toBe(-300_000);
  expect(behind.toServer(400_050)).toBe(100_050);
  const ahead = new ClockSync();
  ahead.add({ sent: 1000, received: 1040, server: 301_020 });
  expect(ahead.offset()).toBe(300_000);
});

it('keeps only the last five samples', () => {
  const c = new ClockSync();
  c.add({ sent: 0, received: 0, server: -9000 });
  c.add({ sent: 0, received: 0, server: -9000 });
  for (let i = 0; i < 5; i++) c.add({ sent: i * 100, received: i * 100 + 20, server: i * 100 + 1010 });
  expect(c.count).toBe(5);
  expect(c.offset()).toBe(1000);
});
