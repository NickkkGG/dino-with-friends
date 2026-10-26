import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// The inputs and conditions that most often break a game like this one: a key held down, the page losing focus, a
// phone turned on its side, two thumbs at once, and storage that refuses.

const isPhone = (project: string) => project.endsWith('-phone');

const dwf = (page: Page) =>
  page.evaluate(() => {
    const d = window.__dwf!;
    return { phase: d.phase, step: d.step, hp: d.hp, hi: d.hi, score: d.score, trex: d.trex, skills: d.skills, canvas: d.canvas };
  });

// The phase, or null while the page is still loading and has no window.__dwf yet.
const phase = (page: Page) => page.evaluate(() => window.__dwf?.phase ?? null);

// The first jump, from a touch on the right half, so the round starts the same way on every project.
async function startRound(page: Page) {
  await expect.poll(() => phase(page)).toBe('waiting');
  await page.evaluate(() => {
    const at = { pointerId: 50, pointerType: 'touch', clientX: innerWidth * 0.75, clientY: innerHeight * 0.9, bubbles: true };
    const surface = document.querySelector('[data-testid="solo-screen"]')!;
    surface.dispatchEvent(new PointerEvent('pointerdown', at));
    surface.dispatchEvent(new PointerEvent('pointerup', at));
  });
  await expect.poll(() => phase(page)).toBe('running');
}

// Waits in the page until the dino is on the ground, between two obstacles' jumps.
const onGround = (page: Page) =>
  page.evaluate(async () => {
    while (window.__dwf!.trex!.jumping) await new Promise((r) => requestAnimationFrame(r));
  });

test('a held key does not air jump or restart twice', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/?view=solo&seed=7&box=doubleJump&invincible=1&timeScale=2');
  await startRound(page);
  await expect.poll(async () => (await dwf(page)).skills!.doubleJump, { timeout: 40_000 }).toBeGreaterThan(200);
  await onGround(page);
  // Space goes down once and stays down; from the top of the jump on it auto-repeats. A repeat that counted as a press
  // would air jump on the way down, and the dino would rise again.
  const held = await page.evaluate(async () => {
    const ys: number[] = [];
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
    let left = 120;
    let up = false;
    let falling = false;
    while (left-- > 0) {
      if (falling) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', repeat: true }));
      await new Promise((r) => requestAnimationFrame(r));
      const t = window.__dwf!.trex!;
      if (ys.length > 0 && t.y > ys.at(-1)!) falling = true;
      ys.push(t.y);
      if (t.jumping) up = true;
      else if (up) break;
    }
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' }));
    return ys;
  });
  expect(Math.min(...held)).toBeLessThan(80); // it did jump
  const firstFall = held.findIndex((y, i) => i > 0 && y > held[i - 1]!);
  expect(firstFall).toBeGreaterThan(0);
  for (let i = firstFall + 1; i < held.length; i++) {
    expect(held[i]!, `frame ${i}: rose again on the way down`).toBeGreaterThanOrEqual(held[i - 1]!);
  }
  // A second press in the air is an air jump: the skill is on, so the held key above was the only thing holding it back.
  await onGround(page);
  const pressed = await page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const ys: number[] = [];
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
    for (let i = 0; i < 6; i++) await frame();
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' }));
    for (let i = 0; i < 6; i++) await frame();
    const before = window.__dwf!.trex!.y;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
    for (let i = 0; i < 6; i++) {
      await frame();
      ys.push(window.__dwf!.trex!.y);
    }
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' }));
    return { before, ys };
  });
  expect(Math.min(...pressed.ys)).toBeLessThan(pressed.before);

  // At GAME OVER a held key restarts once, on its release, and its repeats do nothing more.
  await page.goto('/?view=solo&seed=7&timeScale=8');
  await startRound(page);
  await expect.poll(() => phase(page), { timeout: 40_000 }).toBe('dead');
  await page.waitForTimeout(400); // past the 1.2 s of game time before a jump key restarts
  const phases = await page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const seen: (string | null)[] = [];
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
    for (let i = 0; i < 10; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', repeat: true }));
      await frame();
      seen.push(window.__dwf!.phase);
    }
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' }));
    for (let i = 0; i < 10; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', repeat: true }));
      await frame();
      seen.push(window.__dwf!.phase);
    }
    return { seen, step: window.__dwf!.step };
  });
  expect(phases.seen.slice(0, 10).every((p) => p === 'dead')).toBe(true); // nothing on the press or its repeats
  expect(phases.seen.at(-1)).toBe('running'); // the release restarted
  expect(phases.seen.slice(10).filter((p) => p === 'dead')).toHaveLength(0);
});

test('switching away clears a held duck and resumes without a burst', async ({ page }) => {
  await page.goto('/?view=solo&seed=7&invincible=1');
  await startRound(page);
  await onGround(page);
  await page.keyboard.down('ArrowDown');
  await expect.poll(async () => (await dwf(page)).trex!.ducking).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const paused = (await dwf(page)).step;
  await page.waitForTimeout(500);
  expect((await dwf(page)).step).toBe(paused); // stopped while away
  const resumed = await page.evaluate(async () => {
    const before = window.__dwf!.step;
    window.dispatchEvent(new Event('focus'));
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    return { grew: window.__dwf!.step - before, ducking: window.__dwf!.trex!.ducking };
  });
  expect(resumed.grew).toBeLessThanOrEqual(2);
  expect(resumed.ducking).toBe(false); // ↓ is still down, but it was let go of while away
  await page.keyboard.up('ArrowDown');
  await page.waitForTimeout(300);
  expect((await dwf(page)).step).toBeGreaterThan(paused + 5); // and the round goes on
});

test('rotating the phone keeps the run going and re-picks the scale', async ({ page }, info) => {
  test.skip(!isPhone(info.project.name), 'phones only');
  await page.goto('/?view=solo&seed=7&invincible=1');
  await startRound(page);
  const before = await dwf(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(async () => (await dwf(page)).canvas!.cssWidth).toBe(844);
  const turned = await dwf(page);
  expect(turned.phase).toBe('running');
  expect(turned.canvas!.k).not.toBe(before.canvas!.k);
  expect(turned.canvas!.width).toBe(600 * turned.canvas!.k);
  await page.waitForTimeout(300);
  expect((await dwf(page)).step).toBeGreaterThan(turned.step);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => (await dwf(page)).canvas!.cssWidth).toBe(390);
  expect((await dwf(page)).phase).toBe('running');
  await expect(page.getByTestId('solo-hud-canvas')).toBeVisible();
});

test('holding left while tapping right does not jump', async ({ page }) => {
  await page.goto('/?view=solo&seed=7&invincible=1');
  await startRound(page);
  await onGround(page);
  const result = await page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const surface = document.querySelector('[data-testid="solo-screen"]')!;
    const touch = (type: string, pointerId: number, x: number) =>
      surface.dispatchEvent(new PointerEvent(type, { pointerId, pointerType: 'touch', clientX: x, clientY: innerHeight * 0.9, bubbles: true }));
    const left = innerWidth * 0.25;
    const right = innerWidth * 0.75;
    touch('pointerdown', 1, left); // the left thumb holds
    for (let i = 0; i < 3; i++) await frame();
    const ducking = window.__dwf!.trex!.ducking;
    touch('pointerdown', 2, right); // the right thumb taps
    touch('pointerup', 2, right);
    let jumped = false;
    for (let i = 0; i < 20; i++) {
      await frame();
      if (window.__dwf!.trex!.jumping) jumped = true;
    }
    const stillDucking = window.__dwf!.trex!.ducking;
    touch('pointerup', 1, left);
    for (let i = 0; i < 3; i++) await frame();
    const stoodUp = !window.__dwf!.trex!.ducking;
    touch('pointerdown', 3, right); // the same tap with the left thumb up is a jump
    touch('pointerup', 3, right);
    let jumpedAfter = false;
    for (let i = 0; i < 10; i++) {
      await frame();
      if (window.__dwf!.trex!.jumping) jumpedAfter = true;
    }
    return { ducking, jumped, stillDucking, stoodUp, jumpedAfter };
  });
  expect(result).toEqual({ ducking: true, jumped: false, stillDucking: true, stoodUp: true, jumpedAfter: true });
});

test('blocked localStorage keeps HI and mute working', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
  });
  await page.goto('/?seed=7&timeScale=8');
  await page.getByTestId('btn-solo').click();
  await startRound(page);
  await expect.poll(() => phase(page), { timeout: 40_000 }).toBe('dead');
  const dead = await dwf(page);
  expect(dead.hi).toBeGreaterThan(0);
  expect(dead.hi).toBe(dead.score);
  await page.getByTestId('btn-menu').click();
  await expect(page.getByText(`HI ${String(dead.hi).padStart(5, '0')}`, { exact: true })).toBeVisible();
  const mute = page.getByTestId('btn-mute');
  await expect(mute).toHaveAttribute('aria-label', 'SOUND ON');
  await mute.click();
  await expect(mute).toHaveAttribute('aria-label', 'SOUND OFF');
  expect(await page.evaluate(() => window.__dwf!.muted)).toBe(true);
  expect(errors).toEqual([]);
});
