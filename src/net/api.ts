import { isLobbyCode } from '../../shared/lobby/code';

/** A new lobby's code from the server, or null when anything on the way goes wrong. */
export async function createLobby(fetchFn: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetchFn('/api/lobby', { method: 'POST' });
    if (res.status !== 200) return null;
    const body: unknown = await res.json();
    const code = typeof body === 'object' && body !== null && 'code' in body ? body.code : null;
    return typeof code === 'string' && isLobbyCode(code) ? code : null;
  } catch {
    return null;
  }
}

/** Where a lobby's socket is on the host the page came from: wss on a secure page, ws otherwise. */
export function wsUrl(code: string, loc: { protocol: string; host: string }): string {
  return `${loc.protocol === 'https:' ? 'wss:' : 'ws:'}//${loc.host}/ws/${code}`;
}
