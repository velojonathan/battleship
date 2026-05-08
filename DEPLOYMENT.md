# Deployment — Cloudflare Pages

This is a static single-page app (Vite + React). The build output is plain
HTML/JS/CSS in `dist/`, with no server-side runtime, no environment variables,
and no third-party API calls. It is well-suited to a static host like
Cloudflare Pages.

## Cloudflare Pages settings

Connect the GitHub repo at https://github.com/velojonathan/battleship to a
Cloudflare Pages project with these exact settings:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Framework preset | `None` (or `Vite` if offered) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory (advanced) | `/` (repo root) |
| Node version | `20` (set via `NODE_VERSION` env var if Cloudflare's default is older) |
| Environment variables | _none required_ |

Preview deployments for non-production branches and PRs are fine to leave
enabled — they're a useful CI-style check on top of the GitHub Actions build.

### Why `dist`?

Vite's default output directory. See `vite.config.ts` (no override) and the
`build` script in `package.json` (`tsc -b && vite build`).

### Why "Root directory: `/`"?

The whole app lives at the repo root — `index.html`, `package.json`,
`src/`, `public/` are all top-level. There is no monorepo / app subfolder.

## SPA fallback (already configured)

This app is a single-page application. Even though we don't yet use a router
in the URL bar, Cloudflare Pages should be configured to serve `index.html`
for any unknown path so a future router (or a hand-typed deep-link) doesn't
404. The repo includes a `_redirects` file at `public/_redirects`:

```
/*    /index.html   200
```

Vite copies everything in `public/` straight into `dist/` at build time,
so this rule lands in `dist/_redirects` automatically. Cloudflare Pages
parses this Netlify-compatible format natively — no extra config needed.
You can verify after the first deploy by visiting an arbitrary deep path
(e.g. `https://<your-project>.pages.dev/anything-here`) and confirming the
home screen renders instead of a 404.

## Deploying

The user is expected to connect Cloudflare Pages to GitHub manually:

1. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git.
2. Authorize Cloudflare's GitHub app to access `velojonathan/battleship`.
3. Pick the repo, then enter the settings table above.
4. Click "Save and Deploy".
5. After the first deploy, Cloudflare assigns a `*.pages.dev` URL; share or
   rebrand to a custom domain via the dashboard's "Custom domains" tab.

This repo intentionally **does not** include any Cloudflare-specific tokens,
secrets, GitHub Actions deployment hooks, or `wrangler` configuration — the
expectation is that the user owns the Cloudflare account and connects it
through the dashboard rather than from CI.

## CI on `main`

GitHub Actions (`.github/workflows/ci.yml`) runs typecheck, lint, unit/integration
tests, build, and Playwright e2e on every PR and on every push to `main`.
This is a sanity gate independent of Cloudflare's own preview/production
build, so a bad commit will fail CI before Cloudflare even tries to deploy.

## Local verification

Mirror what Cloudflare will do:

```bash
npm ci
npm run build
npm run preview            # serves dist/ on http://localhost:4173
```

The preview server respects the `_redirects` file the same way Cloudflare
Pages does, so any 404-fallback behavior can be smoke-tested locally before
deploying.
