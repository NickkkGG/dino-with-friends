import type { SkillId } from '../../shared/sim/boxes';

/** What the dev build's test URL can fix: ?seed=7&timeScale=4&box=ghost&invincible=1&autopilot=1&version=old&loseAt=20. */
export interface TestMode {
  /** Every round on this seed; null for a random one each round. */
  seed: number | null;
  /** How much faster than real time the game runs, 1 to 8. */
  timeScale: number;
  /** Every box holds this skill. */
  box: SkillId | null;
  invincible: boolean;
  /** The demo's bot plays, from the first jump on. */
  autopilot: boolean;
  /** The build version the page says it is, in place of its own: 1 to 32 of a–z and 0–9. Dev only. */
  version: string | null;
  /** The second of a race this dino is out at, even one that cannot lose: 1 to 600. Dev only. */
  loseAt: number | null;
}

export const NO_TEST_MODE: Readonly<TestMode> = Object.freeze({
  seed: null, timeScale: 1, box: null, invincible: false, autopilot: false, version: null, loseAt: null,
});

const SKILLS: readonly SkillId[] = ['doubleJump', 'heart', 'ghost', 'speed'];
const MAX_TIME_SCALE = 8;
const MAX_LOSE_AT = 600;

// A flag is on when it is given with no value, or as 1 or true.
function flag(q: URLSearchParams, name: string): boolean {
  const v = q.get(name);
  return v === '' || v === '1' || v === 'true';
}

/** The test mode in the URL's query string. Outside the dev build there is none, whatever the URL says. */
export function parseTestMode(search: string, dev: boolean): TestMode {
  if (!dev) return { ...NO_TEST_MODE };
  const q = new URLSearchParams(search);
  const seedText = q.get('seed') ?? '';
  const seed = /^\d{1,10}$/.test(seedText) && Number(seedText) <= 0xffffffff ? Number(seedText) : null;
  const scale = Number(q.get('timeScale'));
  const box = SKILLS.find((id) => id === q.get('box')) ?? null;
  const version = q.get('version') ?? '';
  const loseText = q.get('loseAt') ?? '';
  const loseAt = /^\d{1,3}$/.test(loseText) && Number(loseText) >= 1 && Number(loseText) <= MAX_LOSE_AT ? Number(loseText) : null;
  return {
    seed,
    timeScale: Number.isFinite(scale) ? Math.min(MAX_TIME_SCALE, Math.max(1, scale)) : 1,
    box,
    invincible: flag(q, 'invincible'),
    autopilot: flag(q, 'autopilot'),
    version: /^[a-z0-9]{1,32}$/.test(version) ? version : null,
    loseAt,
  };
}
