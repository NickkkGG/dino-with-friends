import type { Lobby } from './lobby';

/** What the Worker and the lobbies are given by the runtime, as wrangler.jsonc binds it. */
export interface Env {
  LOBBY: DurableObjectNamespace<Lobby>;
}
