import type { RoomDO } from './room';

/**
 * Worker bindings. `ROOM` is the Durable Object namespace declared in
 * wrangler.toml and instantiated by class-name lookup (`idFromName`).
 *
 * Parameterizing the namespace with `RoomDO` so the resulting stub types
 * include our custom RPC methods (`initRoom`, `exists`).
 */
export interface Env {
  ROOM: DurableObjectNamespace<RoomDO>;
}
