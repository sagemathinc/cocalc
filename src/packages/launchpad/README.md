# CoCalc Launchpad

CoCalc Launchpad is the lightweight control-plane bundle for small teams
using remote project hosts. It focuses on fast install + configuration,
PGlite-backed metadata, and api/v2 access without Next.js.

## Role

- Runs the CoCalc Hub control plane in a single process.
- Uses PGlite by default (no external Postgres).
- Disables Next.js by default and serves `/api/v2` from the Express router.
- Intended for small groups (1–25 users) with external compute.

## Change Discipline

- Keep core logic in `@cocalc/hub`, `@cocalc/server`, and `@cocalc/database`.
- Launchpad should remain packaging + defaults only.
- Avoid adding new dependencies here unless needed for distribution.

## Getting Started

- Build with `pnpm --filter @cocalc/launchpad build`.
- Run locally with `pnpm --filter @cocalc/launchpad app` or `cocalc-launchpad`.

## Packaging & Distribution

- **Bundle**: `pnpm --filter @cocalc/launchpad build:bundle`
- **Tarball**: `pnpm --filter @cocalc/launchpad build:tarball`
- **SEA binary**: `pnpm --filter @cocalc/launchpad sea`
- **Container (podman)**:
  - `export GCR_PROJECT=your-gcp-project`
  - `pnpm --filter @cocalc/launchpad container:build`
  - `pnpm --filter @cocalc/launchpad container:push`

The bundle includes static assets, Next api/v2 handlers, and PGlite data/wasm
so the control plane can run without external services.
