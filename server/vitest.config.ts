import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          // Bind the same DO namespace under the same name as production so
          // tests use the same `env.ROOM` binding the Worker uses at runtime.
          // No additional config needed; miniflare reads wrangler.toml.
        },
      },
    },
  },
});
