import { expect, it } from 'vitest';
import { createLobby, wsUrl } from '../../src/net/api';

it('creates a lobby', async () => {
  const calls: [string, RequestInit | undefined][] = [];
  const fake = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push([String(input), init]);
    return Response.json({ code: 'K7RM2Q' });
  };
  expect(await createLobby(fake as typeof fetch)).toBe('K7RM2Q');
  expect(calls).toEqual([['/api/lobby', { method: 'POST' }]]);
});

it('gives null for anything that goes wrong', async () => {
  const answers: (() => Promise<Response>)[] = [
    async () => {
      throw new TypeError('Failed to fetch');
    },
    async () => new Response('No free lobby code', { status: 503 }),
    async () => Response.json({ code: 'bad' }),
    async () => Response.json({ nope: 1 }),
    async () => new Response('<html>', { status: 200 }),
  ];
  for (const answer of answers) expect(await createLobby(answer as unknown as typeof fetch)).toBeNull();
});

it('finds the lobby socket on the same host', () => {
  expect(wsUrl('K7RM2Q', { protocol: 'http:', host: '192.168.1.5:5173' })).toBe('ws://192.168.1.5:5173/ws/K7RM2Q');
  expect(wsUrl('K7RM2Q', { protocol: 'https:', host: 'dwf.example' })).toBe('wss://dwf.example/ws/K7RM2Q');
});
