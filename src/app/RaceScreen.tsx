import { useEffect, useMemo, useRef, useState } from 'react';
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
import type { LobbySession, SessionView } from '../net/session';
import { FONT_ROWS } from '../ui/font';
import { PixelText, useDevicePixelRatio } from '../ui/PixelText';
import { IdleStrip } from './IdleStrip';
import { Leaderboard } from './Leaderboard';
import type { BoardRow } from './Leaderboard';
import { MuteButton } from './MuteButton';
import { TouchHints } from './TouchHints';

export interface RaceScreenProps {
  sprites: SpriteSet;
  sound: Sound;
  testMode: TestMode;
  view: SessionView;
  session: LobbySession;
}

const FIRST_VIEW: RaceView = { phase: 'countdown', count: null, inverted: false, hints: false };

const viewport = () => ({ w: window.innerWidth, h: window.innerHeight });

/**
 * The race: the tower in the top left corner, and for a player in the round the track, with the countdown over it
 * before the start. A player who came in after the start watches the tower until the next round. At night the whole
 * screen turns over, as in solo.
 */
export function RaceScreen({ sprites, sound, testMode, view, session }: RaceScreenProps) {
  const surface = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const hudCanvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<RaceGame | null>(null);
  const [coarse] = useState(() => window.matchMedia('(pointer: coarse)').matches);
  const [size, setSize] = useState(viewport);
  const [race, setRace] = useState(FIRST_VIEW);
  const dpr = useDevicePixelRatio();
  const layout = useMemo(() => raceLayout(size.w, size.h, coarse, dpr), [size, coarse, dpr]);
  const { you, countdown } = view;
  const playing = view.players.some((p) => p.id === you && p.playing);
  // The round this player runs in: one they are on the list of, whose countdown has come.
  const round = playing && countdown?.round === view.round ? countdown : null;
  const own = view.tower.find((r) => r.id === you);
  const out = view.phase === 'playing' && own !== undefined && !own.alive;

  useEffect(() => {
    if (!round || you === null) return undefined;
    const g = new RaceGame({
      canvas: canvas.current!, hudCanvas: hudCanvas.current!, surface: surface.current!,
      sprites, sound, coarse, testMode, seed: round.seed, you, startAt: round.startAt, hi: readNumber(HI_KEY, 0),
      clock: () => session.serverNow(),
      send: { state: (s) => session.sendState(s), dead: (d) => session.sendDead(d) },
      onView: setRace,
    });
    game.current = g;
    g.start();
    return () => {
      g.dispose();
      game.current = null;
    };
  }, [round, you, sprites, sound, coarse, testMode, session]);

  // After the game of a new round is made, as well as on a new layout.
  useEffect(() => {
    game.current?.setLayout(layout, dpr);
  }, [layout, dpr, round]);

  // The lobby has this player out while the round here still runs, as after the tab was away too long.
  useEffect(() => {
    if (out) game.current?.serverDead();
  }, [out]);

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
  const sizes = menuSizes(size.w);
  const rows: BoardRow[] = view.tower.map((r) => ({
    id: r.id, name: view.names.get(r.id) ?? '', score: r.score, alive: r.alive, me: r.id === you,
  }));
  const inverted = round !== null && race.inverted;

  return (
    <div ref={surface} data-testid="race-screen" className={inverted ? 'race-screen inverted' : 'race-screen'}>
      <div className="race-board" style={{ left: layout.board.x, top: layout.board.y }}>
        <Leaderboard
          title={`ROUND ${view.round}`} rows={rows} heads={sprites.heads} cell={layout.board.cell} mode="race"
          testId="race-board"
        />
      </div>
      {round ? (
        <>
          <canvas ref={hudCanvas} data-testid="race-hud-canvas" style={layout.hud ? at(layout.hud) : { display: 'none' }} />
          <canvas ref={canvas} data-testid="race-canvas" style={at(layout.canvas)} />
          {race.hints && layout.zones && <TouchHints zones={layout.zones} portrait={layout.mode === 'portrait'} />}
          {race.phase === 'countdown' && (
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
        </>
      ) : (
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
