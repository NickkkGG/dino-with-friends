import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { DIM, SOFT } from '../game/colors';
import { menuSizes, raceLayout } from '../game/layout';
import type { Rect } from '../game/layout';
import { RaceGame } from '../game/race';
import type { RaceView } from '../game/race-run';
import { HI_KEY } from '../game/solo-rules';
import type { Sound } from '../game/sound';
import type { SpriteSet } from '../game/sprites';
import { readNumber } from '../game/storage';
import type { TestMode } from '../game/test-mode';
import { WatchGame } from '../game/watch';
import type { LobbySession, SessionView } from '../net/session';
import { FONT_ROWS } from '../ui/font';
import { PixelText, useDevicePixelRatio } from '../ui/PixelText';
import { IdleStrip } from './IdleStrip';
import { Leaderboard } from './Leaderboard';
import type { BoardRow } from './Leaderboard';
import { MuteButton } from './MuteButton';
import { PeekRow } from './PeekRow';
import { TouchHints } from './TouchHints';
import { WATCH_AFTER_MS, useWatchTarget, watchersOf } from './watch-target';

export interface RaceScreenProps {
  sprites: SpriteSet;
  sound: Sound;
  testMode: TestMode;
  view: SessionView;
  session: LobbySession;
}

const FIRST_VIEW: RaceView = { phase: 'countdown', count: null, inverted: false, hints: false };

// YOU PLAY NEXT ROUND under WATCHING NAME, in CSS pixels per cell.
const NEXT_CELL = 1.5;

const viewport = () => ({ w: window.innerWidth, h: window.innerHeight });

/**
 * The race, with the tower in the top left corner. A runner whose line still runs when the screen opens runs their own
 * dino on the track, with the countdown over it before the start, and 2 s after their GAME OVER watches the top runner
 * still running. Anyone else watches at once: the screen of the runner watched, with WATCHING NAME over it, switched
 * with ← and → or a tap on a name in the tower. Along the right edge peek the heads of those watching the screen on
 * show. With nobody to watch, a player who came in after the start waits for the next round. At night the whole screen
 * turns over, as in solo.
 */
export function RaceScreen({ sprites, sound, testMode, view, session }: RaceScreenProps) {
  const surface = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hudCanvas = useRef<HTMLCanvasElement>(null);
  const raceGame = useRef<RaceGame | null>(null);
  const watchGame = useRef<WatchGame | null>(null);
  const [coarse] = useState(() => window.matchMedia('(pointer: coarse)').matches);
  const [size, setSize] = useState(viewport);
  const [race, setRace] = useState(FIRST_VIEW);
  const [night, setNight] = useState(false);
  const dpr = useDevicePixelRatio();
  const layout = useMemo(() => raceLayout(size.w, size.h, coarse, dpr), [size, coarse, dpr]);
  const { you, countdown } = view;
  // The round on now, whose countdown has come.
  const round = countdown?.round === view.round ? countdown : null;
  const runner = view.players.some((p) => p.id === you && p.playing);
  const own = view.tower.find((r) => r.id === you);
  const out = view.phase === 'playing' && own !== undefined && !own.alive;
  // Whether this player runs their own dino, as a runner whose line still ran when the screen opened; and whether
  // WATCH_AFTER_MS have gone by since its GAME OVER.
  const [runs] = useState(() => runner && own?.alive !== false);
  const [over, setOver] = useState(false);
  const { target, pick, step } = useWatchTarget({
    rows: view.tower, you, ready: round !== null && (!runs || over), watch: (t) => session.watch(t),
  });
  // A runner stays on their GAME OVER while there is nobody to watch.
  const mode = round === null ? 'idle' : runs && (!over || target === null) ? 'run' : target !== null ? 'watch' : 'idle';
  const running = mode === 'run';
  const watching = mode === 'watch' ? target : null;

  useEffect(() => {
    if (!running || !round || you === null) return undefined;
    const g = new RaceGame({
      canvas: canvas.current!, hudCanvas: hudCanvas.current!, surface: surface.current!,
      sprites, sound, coarse, testMode, seed: round.seed, you, startAt: round.startAt, hi: readNumber(HI_KEY, 0),
      clock: () => session.serverNow(),
      send: { state: (s) => session.sendState(s), dead: (d) => session.sendDead(d) },
      onView: setRace,
    });
    raceGame.current = g;
    g.start();
    // The run ends when the round does or the player starts watching, and a best score it was making is kept.
    return () => {
      g.end();
      g.dispose();
      raceGame.current = null;
    };
  }, [running, round, you, sprites, sound, coarse, testMode, session]);

  useEffect(() => {
    if (watching === null || !round) return undefined;
    const g = new WatchGame({
      canvas: canvas.current!, hudCanvas: hudCanvas.current!, sprites, seed: round.seed, target: watching,
      startAt: round.startAt, hi: readNumber(HI_KEY, 0), clock: () => session.serverNow(),
      relays: (fn) => session.onRelay(fn), onView: (v) => setNight(v.inverted),
    });
    watchGame.current = g;
    g.start();
    return () => {
      g.dispose();
      watchGame.current = null;
    };
  }, [watching, round, sprites, session]);

  // After a game is made, as well as on a new layout.
  useEffect(() => {
    raceGame.current?.setLayout(layout, dpr);
    watchGame.current?.setLayout(layout, dpr);
  }, [layout, dpr, round, running, watching]);

  // The lobby has this player out while the round here still runs, as after the tab was away too long.
  useEffect(() => {
    if (out) raceGame.current?.serverDead();
  }, [out]);

  useEffect(() => {
    if (race.phase !== 'dead') return undefined;
    const id = window.setTimeout(() => setOver(true), WATCH_AFTER_MS);
    return () => window.clearTimeout(id);
  }, [race.phase]);

  // The tower has the runner watched out: GAME OVER on their screen, at their crash if it has come in.
  const watchedOut = watching !== null && view.tower.some((r) => r.id === watching && !r.alive);
  useEffect(() => {
    if (watchedOut) watchGame.current?.out();
  }, [watchedOut, watching]);

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    if (!e.repeat) step(e.key === 'ArrowLeft' ? -1 : 1);
  });
  const switching = watching !== null;
  useEffect(() => {
    if (!switching) return undefined;
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [switching]);

  useEffect(() => {
    const onResize = () => setSize(viewport());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);

  const snap = (v: number) => Math.round(v * dpr) / dpr;
  const at = (r: Rect): CSSProperties => ({ position: 'absolute', left: snap(r.x), top: snap(r.y) });
  // A line centred over the track, with its top at `y`.
  const overTrack = (y: number): CSSProperties => ({ left: snap(layout.canvas.x), width: layout.canvas.w, top: snap(y) });
  const sizes = menuSizes(size.w);
  const rows: BoardRow[] = view.tower.map((r) => ({
    id: r.id, name: view.names.get(r.id) ?? '', score: r.score, alive: r.alive, me: r.id === you,
  }));
  const inverted = running ? race.inverted : watching !== null && night;
  // Whose screen is on show, for the heads of those watching it.
  const shown = running ? you : watching;

  return (
    <div ref={surface} data-testid="race-screen" className={inverted ? 'race-screen inverted' : 'race-screen'}>
      <div className="race-board" style={{ left: layout.board.x, top: layout.board.y }}>
        <Leaderboard
          title={`ROUND ${view.round}`} rows={rows} heads={sprites.heads} cell={layout.board.cell} mode="race"
          testId="race-board" framed={watching} onPick={watching !== null ? pick : undefined}
        />
      </div>
      {mode === 'idle' ? (
        <>
          <div className="race-next">
            <span data-testid="next-round">
              <PixelText text="YOU PLAY NEXT ROUND" size={sizes.body} color={SOFT} />
            </span>
          </div>
          <div className="race-strip">
            <IdleStrip sprites={sprites} />
          </div>
        </>
      ) : (
        <>
          <canvas ref={hudCanvas} data-testid="race-hud-canvas" style={layout.hud ? at(layout.hud) : { display: 'none' }} />
          <canvas ref={canvas} data-testid="race-canvas" data-mode={mode} style={at(layout.canvas)} />
          {running && race.hints && layout.zones && <TouchHints zones={layout.zones} portrait={layout.mode === 'portrait'} />}
          {running && race.phase === 'countdown' && (
            <div className="race-count" style={{ top: snap(layout.count.y) }}>
              <div className={race.hints ? 'race-count-box covered' : 'race-count-box'}>
                <div className="race-count-number" style={{ height: FONT_ROWS * layout.count.cell }}>
                  {race.count !== null && (
                    <span key={race.count} className="race-count-pulse">
                      <PixelText text={String(race.count)} size={layout.count.cell} />
                    </span>
                  )}
                </div>
                <span data-testid="get-ready" className="race-get-ready">
                  <PixelText text="GET READY" size={sizes.body} color={SOFT} />
                </span>
              </div>
            </div>
          )}
          {watching !== null && (
            <>
              <div className="race-watch" style={overTrack(layout.label.y)}>
                <span data-testid="watch-label">
                  <PixelText text={`WATCHING ${view.names.get(watching) ?? ''}`} size={layout.label.cell} />
                </span>
                {!runner && (
                  <span data-testid="next-round">
                    <PixelText text="YOU PLAY NEXT ROUND" size={NEXT_CELL} color={SOFT} />
                  </span>
                )}
              </div>
              <div className="race-watch" style={overTrack(layout.hint.y)}>
                <span data-testid="switch-hint">
                  <PixelText text={coarse ? 'TAP A NAME TO SWITCH' : '← → TO SWITCH'} size={layout.hint.cell} color={SOFT} />
                </span>
              </div>
            </>
          )}
          {shown !== null && (
            <PeekRow
              peekers={watchersOf(view.watching, shown, view.names, you)} heads={sprites.heads}
              top={snap(layout.peek.y)} cell={layout.peek.cell} max={layout.peek.max}
            />
          )}
        </>
      )}
      {layout.code && (
        <span data-testid="lobby-line" className="race-code" style={{ left: layout.code.x, top: snap(layout.code.y) }}>
          <PixelText text={`LOBBY ${view.code}`} size={sizes.small} color={DIM} />
        </span>
      )}
      <MuteButton sound={sound} />
    </div>
  );
}
