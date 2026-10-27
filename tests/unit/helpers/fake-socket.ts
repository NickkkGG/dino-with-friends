import type { ServerMessage } from '../../../shared/lobby/protocol';
import type { SocketLike } from '../../../src/net/session';

/** A socket the test plays the server for: it keeps what the game sent, and the test opens, answers or drops it. */
export class FakeSocket implements SocketLike {
  readonly url: string;
  readyState = 0;
  /** What the game sent, as text. */
  readonly texts: string[] = [];
  /** Whether the game closed it. */
  closedByGame = false;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  send(data: string): void {
    this.texts.push(data);
  }

  close(): void {
    if (this.readyState === 3) return;
    this.closedByGame = true;
    this.readyState = 3;
    this.onclose?.();
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  /** A message from the server, or any text in its place. */
  serverSays(msg: ServerMessage | string): void {
    this.onmessage?.({ data: typeof msg === 'string' ? msg : JSON.stringify(msg) });
  }

  /** The connection going away without the game asking. */
  drop(): void {
    this.readyState = 3;
    this.onerror?.();
    this.onclose?.();
  }

  sent(): unknown[] {
    return this.texts.map((t) => JSON.parse(t) as unknown);
  }
}

/** An `open` for LobbySession that hands out fake sockets and keeps them, the latest last. */
export function fakeSockets() {
  const sockets: FakeSocket[] = [];
  return {
    sockets,
    open: (url: string): FakeSocket => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    get last(): FakeSocket {
      return sockets[sockets.length - 1]!;
    },
  };
}
