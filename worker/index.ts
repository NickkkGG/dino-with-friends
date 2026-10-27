import { isLobbyCode, makeCode } from '../shared/lobby/code';
import type { Env } from './env';

export { Lobby } from './lobby';

/** How many new codes to try before giving up on making a lobby. */
const CREATE_TRIES = 5;

/** A whole number from 0 to n − 1, from the runtime's secure random numbers. */
const pick = (n: number): number => crypto.getRandomValues(new Uint32Array(1))[0]! % n;

/** A new lobby under a code no lobby has yet. */
async function createLobby(env: Env): Promise<Response> {
  for (let i = 0; i < CREATE_TRIES; i++) {
    const code = makeCode(pick);
    if (await env.LOBBY.getByName(code).create(code)) return Response.json({ code });
  }
  return new Response('No free lobby code', { status: 503 });
}

// Only /api/* and /ws/* come here first (wrangler.jsonc); every other address is a file of the built site.
export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/lobby') {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
      }
      return createLobby(env);
    }
    const ws = /^\/ws\/([^/]*)$/.exec(pathname);
    if (ws) {
      const code = ws[1]!;
      if (!isLobbyCode(code)) return new Response('Not Found', { status: 404 });
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('Upgrade Required', { status: 426 });
      }
      return env.LOBBY.getByName(code).fetch(request);
    }
    return new Response('Not Found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
