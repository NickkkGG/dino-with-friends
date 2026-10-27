import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { cleanName } from '../../shared/lobby/name';
import { reportLobby } from '../game/debug';
import type { Sound } from '../game/sound';
import type { SpriteSet } from '../game/sprites';
import { readText, writeText } from '../game/storage';
import type { TestMode } from '../game/test-mode';
import { holdScreenOn } from '../game/wake-lock';
import { createLobby } from '../net/api';
import { LobbySession } from '../net/session';
import type { SessionError, SessionView } from '../net/session';
import { resultsOnShow } from './flow';
import { LobbyScreen } from './LobbyScreen';
import { MultiplayerScreen } from './MultiplayerScreen';
import { NameScreen } from './NameScreen';
import { RaceScreen } from './RaceScreen';
import { ResultsScreen } from './ResultsScreen';

/** Where the player's name is kept on the device. */
export const NAME_KEY = 'dwf.name';

export interface MultiplayerFlowProps {
  sprites: SpriteSet;
  sound: Sound;
  testMode: TestMode;
  onExit(): void;
  /** Told which screen is on show: name, multiplayer, lobby, race or results. */
  onScreen(screen: string): void;
}

type Action = { kind: 'create' } | { kind: 'join'; code: string };

/** What a session shows now, or null without one, for React to render from. */
function useSessionView(session: LobbySession | null): SessionView | null {
  const subscribe = useCallback((fn: () => void) => (session ? session.subscribe(fn) : () => {}), [session]);
  const view = useCallback(() => (session ? session.view() : null), [session]);
  return useSyncExternalStore(subscribe, view);
}

/**
 * Everything after MULTIPLAYER on the title: YOUR NAME the first time, then MULTIPLAYER, where a lobby is made or
 * joined, the lobby once the server has said welcome, the race from the countdown to the end of the round, and its
 * results until the player goes back to the lobby. A lobby that fails takes the player back to MULTIPLAYER with what
 * went wrong.
 */
export function MultiplayerFlow({ sprites, sound, testMode, onExit, onScreen }: MultiplayerFlowProps) {
  const [name, setName] = useState(() => cleanName(readText(NAME_KEY, '')));
  const [naming, setNaming] = useState(() => name === '');
  const [session, setSession] = useState<LobbySession | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<SessionError | null>(null);
  // The last round whose results the player has left.
  const [closed, setClosed] = useState(0);
  const view = useSessionView(session);
  // Kept in refs as well, so a second click in the same moment, before React has rendered, sees them.
  const busy = useRef(false);
  const current = useRef<LobbySession | null>(null);
  const last = useRef<Action | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      current.current?.dispose();
      current.current = null;
    };
  }, []);

  const open = (code: string) => {
    const s = new LobbySession({ code, name, version: testMode.version ?? undefined });
    current.current = s;
    last.current = { kind: 'join', code }; // TRY AGAIN comes back in here, also for the one who made the lobby
    setSession(s);
    setClosed(0); // a new lobby counts its rounds from 1
    s.connect();
  };

  const run = async (action: Action) => {
    if (busy.current) return;
    busy.current = true;
    last.current = action;
    setError(null);
    if (action.kind === 'join') {
      open(action.code);
      return;
    }
    setCreating(true);
    const code = await createLobby();
    if (!mounted.current) return;
    setCreating(false);
    if (code === null) {
      busy.current = false;
      setError('CANT_CONNECT');
      return;
    }
    open(code);
  };

  const close = () => {
    current.current?.dispose();
    current.current = null;
    setSession(null);
    busy.current = false;
  };

  useEffect(() => {
    if (view?.status !== 'failed') return;
    close();
    setError(view.error);
  }, [view]);

  useEffect(() => {
    if (!session) return undefined;
    return reportLobby(() => {
      const v = session.view();
      const host = v.players.some((p) => p.id === v.you && p.host);
      return { status: v.status, code: v.code, you: v.you, phase: v.phase, round: v.round, players: v.players.length, host };
    });
  }, [session]);

  // While the session tries to get its seat back the screens stay as they are, the race going on underneath.
  const inLobby = session !== null && (view?.status === 'joined' || view?.status === 'reconnecting');
  // The results of a round stay until the player leaves them or the next round's countdown comes; one who comes in
  // while they are on goes to the lobby.
  const results = inLobby ? resultsOnShow(view.end, closed, view.countdown) : null;
  const racing = inLobby && results === null && (view.phase === 'countdown' || view.phase === 'playing');
  const screen = results ? 'results' : racing ? 'race' : inLobby ? 'lobby' : naming ? 'name' : 'multiplayer';
  useEffect(() => onScreen(screen), [screen, onScreen]);

  // The screen stays on in a lobby, through its rounds and while the connection comes back, as a phone would otherwise
  // go dark in the middle of a race.
  useEffect(() => (inLobby ? holdScreenOn() : undefined), [inLobby]);

  if (inLobby) {
    if (results) {
      const back = () => setClosed(results.round);
      return (
        <ResultsScreen
          sprites={sprites} sound={sound} end={results} you={view.you} reconnecting={view.status === 'reconnecting'}
          onBack={back}
        />
      );
    }
    if (racing) {
      // A screen of its own for each round, which decides when it opens whether this player runs or watches.
      return (
        <RaceScreen key={view.round} sprites={sprites} sound={sound} testMode={testMode} view={view} session={session} />
      );
    }
    const leave = () => {
      session.leave();
      close();
    };
    return <LobbyScreen sprites={sprites} sound={sound} view={view} onLeave={leave} onStart={() => session.start()} />;
  }
  if (naming) {
    const done = (n: string) => {
      writeText(NAME_KEY, n);
      setName(n);
      setNaming(false);
    };
    // The first time, BACK goes back to the title; when the name is being changed, back to MULTIPLAYER.
    const back = () => (name === '' ? onExit() : setNaming(false));
    return <NameScreen sprites={sprites} sound={sound} initial={name} onBack={back} onDone={done} />;
  }
  return (
    <MultiplayerScreen
      sprites={sprites}
      sound={sound}
      name={name}
      busy={creating || session !== null}
      error={error}
      onBack={onExit}
      onRename={() => setNaming(true)}
      onCreate={() => void run({ kind: 'create' })}
      onJoin={(code) => void run({ kind: 'join', code })}
      onRetry={() => {
        if (last.current) void run(last.current);
      }}
    />
  );
}
