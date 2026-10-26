import { useEffect, useRef, useState } from 'react';
import { botInput, earliestSafe, latestSafe } from '../../../shared/sim/autopilot';
import type { Policy } from '../../../shared/sim/autopilot';
import { mulberry32 } from '../../../shared/sim/rng';
import { NO_EVENTS, NO_INPUT, createWorld, stepWorld } from '../../../shared/sim/world';
import type { StepEvents, StepInput, World, WorldOptions } from '../../../shared/sim/world';
import { INK, PAPER } from '../../game/colors';
import { Scene } from '../../game/draw/scene';
import { chooseRenderParams, sizeCanvas } from '../../game/render-params';
import { loadSpriteSet, sheetFor } from '../../game/sprites';
import { SCENE_CASES } from './scene-cases';
import type { SceneCase } from './scene-cases';

// A dev page for checking the whole scene by eye, in one state of a seed-7 game, at the size of the window. A portrait
// window gets the HUD strip over the world, like the solo screen.

const SEED = 7;
const SKY = 40;
const STRIP = { scale: 1.75, h: 34 };
const HI = 1234;
const JUMP: StepInput = { ...NO_INPUT, jumpPressed: true };

type Input = (w: World) => StepInput;
const still: Input = () => NO_INPUT;
const bot = (policy: Policy): Input => (w) => botInput(w, policy);

// Steps the world and the scene together until `done` says so (or for good after `limit` steps).
function playUntil(w: World, scene: Scene, done: (w: World, ev: StepEvents) => boolean, input: Input = still, limit = 20000): void {
  for (let i = 0; i < limit; i++) {
    const ev = w.phase === 'dead' ? NO_EVENTS : stepWorld(w, input(w));
    scene.step(w, ev);
    if (done(w, ev)) return;
  }
}

function play(w: World, scene: Scene, n: number, input: Input = still): void {
  let left = n;
  playUntil(w, scene, () => --left <= 0, input);
}

function setUp(name: SceneCase, scene: Scene): World {
  const make = (o: Partial<WorldOptions> = {}): World => createWorld({ seed: SEED, playerId: 'solo', ...o });
  switch (name) {
    case 'waiting': {
      const w = make({ phase: 'waiting' });
      play(w, scene, 30);
      return w;
    }
    case 'intro': {
      const w = make({ phase: 'waiting' });
      play(w, scene, 1, () => JUMP);
      playUntil(w, scene, (x) => x.phase === 'intro' && x.introStep >= 12);
      return w;
    }
    case 'run': {
      const w = make({ invincible: true });
      play(w, scene, 700, bot(earliestSafe));
      return w;
    }
    case 'hurt': {
      const w = make();
      playUntil(w, scene, (_, ev) => ev.hit !== null);
      play(w, scene, 6);
      return w;
    }
    case 'low': {
      const w = make({ invincible: true });
      w.hp = 1;
      play(w, scene, 500, bot(earliestSafe));
      return w;
    }
    case 'ghost':
    case 'speed':
    case 'heart': {
      const w = make({ invincible: true, forcedSkill: name });
      playUntil(w, scene, (_, ev) => ev.picked !== null, bot(latestSafe));
      play(w, scene, name === 'heart' ? 24 : 40, bot(latestSafe));
      return w;
    }
    case 'double': {
      const w = make({ invincible: true, forcedSkill: 'doubleJump' });
      playUntil(w, scene, (_, ev) => ev.picked !== null, bot(latestSafe));
      playUntil(w, scene, (x) => !x.trex.jumping);
      play(w, scene, 1, () => JUMP);
      play(w, scene, 10);
      play(w, scene, 1, () => JUMP);
      play(w, scene, 3);
      return w;
    }
    case 'night': {
      const w = make({ invincible: true });
      playUntil(w, scene, (x) => x.night > 90);
      return w;
    }
    case 'over': {
      const w = make();
      playUntil(w, scene, (x) => x.phase === 'dead');
      play(w, scene, 100);
      return w;
    }
  }
}

export function SceneView() {
  const world = useRef<HTMLCanvasElement>(null);
  const strip = useRef<HTMLCanvasElement>(null);
  const [shown, setShown] = useState({ ready: false, night: false });
  const asked = new URLSearchParams(window.location.search).get('case');
  const name: SceneCase = SCENE_CASES.find((c) => c === asked) ?? 'run';
  const portrait = window.innerHeight > window.innerWidth;

  useEffect(() => {
    let live = true;
    void loadSpriteSet().then((set) => {
      const canvas = world.current;
      if (!live || !canvas) return;
      const vw = window.innerWidth;
      const dpr = window.devicePixelRatio || 1;
      const scene = new Scene(
        { sky: SKY, hud: portrait ? 'none' : 'inside', showScore: !portrait, showHi: !portrait, introClip: true, idleClouds: false },
        mulberry32(SEED),
      );
      const w = setUp(name, scene);
      const p = chooseRenderParams(vw, dpr);
      sizeCanvas(canvas, vw, (vw * (150 + SKY)) / 600, 600, 150 + SKY, p);
      const ctx = canvas.getContext('2d');
      if (ctx) scene.draw({ ctx, k: p.k, sheet: sheetFor(set, p), oy: SKY }, w, HI);
      if (portrait && strip.current) {
        const width = Math.round(600 / STRIP.scale);
        const sp = chooseRenderParams(vw, dpr, width);
        sizeCanvas(strip.current, vw, (vw * STRIP.h) / width, width, STRIP.h, sp);
        const sctx = strip.current.getContext('2d');
        if (sctx) scene.drawHudStrip({ ctx: sctx, k: sp.k, sheet: sheetFor(set, sp), oy: 0 }, w, HI, width);
      }
      setShown({ ready: true, night: w.night > 0 });
    });
    return () => {
      live = false;
    };
  }, [name, portrait]);

  return (
    <div
      data-testid="scene-view"
      data-ready={shown.ready}
      style={{ height: '100vh', overflow: 'hidden', background: PAPER, filter: shown.night ? 'invert(1)' : 'none' }}
    >
      <div style={{ paddingTop: portrait ? '24vh' : 48 }}>
        {portrait && <canvas ref={strip} style={{ display: 'block' }} />}
        <canvas ref={world} style={{ display: 'block' }} />
      </div>
      <p style={{ margin: 16, font: '14px/1.4 monospace', color: INK }}>scene: {name} (seed {SEED}, HI {HI})</p>
    </div>
  );
}
