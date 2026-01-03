# PGlite Support Plan

## Goals

- Provide a simple, reliable embedded DB option for the control\-plane \(hub\) using PGlite.
- Keep default Postgres behavior untouched unless explicitly enabled.
- Preserve core behaviors: schema sync, changefeeds \(listen/notify\), and pool semantics.
- Enable tests and local/dev workflows to use PGlite for faster, simpler setup

## Non-goals (initial phase)

- Full compatibility with every production\-only extension or legacy Postgres version.
  - CoCalc uses NO extensions at all and all sql code should be compatible with all postgres versions back to version 13, i.e. we use nothing exotic.
- Multi\-process or multi\-host shared DB \(PGlite is single\-process\).
- High\-throughput DB workloads; this is for control\-plane only.

## Feature Flags and Config

- COCALC_DB=pglite (opt-in switch)
- COCALC_PGLITE_DATA_DIR=/path/to/data (default memory:// if unset)
- Optional: COCALC_PGLITE_RELAXED_DURABILITY=1 (future, if needed)

## Current Baseline (already done)

- PGlite adapter for pool layer (serialized queries)
- PGlite pg-style client (LISTEN/UNLISTEN + notification bridge) for legacy db._query usage
- Smoke test for PGlite helper
- Basic pool test with PGlite enabled
- LISTEN/NOTIFY smoke test via db.async_query
- Database test runner now uses NODE_OPTIONS=--experimental-vm-modules

## Phase 1: DB Access Unification (core prep)

Goal: ensure all database access flows through a single adapter so PGlite is viable.

1. \(done\) Inventory DB access paths

- Confirm every write/query path uses @cocalc/database/pool or @cocalc/database db() wrapper.
- Identify any direct pg Client usage outside pool.

2) Single connection policy

- Ensure only one live connection is created in PGlite mode.
- Route getClient() and getPool() to PGlite adapter when enabled.
- Avoid per-module new Pool/Client creation in PGlite mode.

3) CoffeeScript PostgreSQL wrapper integration

- Postgres-base uses its own client lifecycle and _query interface.
- Add a PGlite-backed query adapter so db.async_query/db._query can be routed through pool logic.
- The adapter should provide:
  - query(text, params)
  - single shared instance
  - rowCount compatibility for code that reads it
  - LISTEN/UNLISTEN support to feed changefeed notifications

Deliverable

- A single code path that can flip from Postgres to PGlite with COCALC_DB=pglite.

## \(done\) Phase 1 Status

- CoffeeScript wrapper now routes through a PGlite pg-style client when COCALC_DB=pglite: [src/packages/database/postgres-base.coffee](./src/packages/database/postgres-base.coffee)
- PGlite pg-style client implemented here: [src/packages/database/pool/pglite.ts](./src/packages/database/pool/pglite.ts)
- Pool test query-config form hangs; test uses string+params for now: [src/packages/database/pool/pool.test.ts](./src/packages/database/pool/pool.test.ts)
- Direct pg usage audit: no non-database code instantiates pg clients; remaining pg usage is either types or centralized in database layer.
- Single connection policy: PGlite is a singleton instance behind a shared pool; getPool/getClient route to PGlite when enabled, and cached pools still call the underlying PGlite pool. No other Pool/Client creation paths remain.

## \(done\) Phase 2: LISTEN/NOTIFY and Changefeeds

Goal: ensure real-time subscriptions and sync logic work in-process.

1) Validate native PGlite LISTEN/NOTIFY

- Add a focused test that uses existing changefeed code path.
- If it just works, keep the implementation minimal.

2) Fallback plan (if needed)

- Implement a lightweight in-process event bus for PGlite mode.
- Replace LISTEN/NOTIFY calls in PGlite mode with the event bus.
- Keep Postgres mode unchanged.

Key usage points

- Changefeeds for user/project updates
- Project host state updates

## Phase 2 Status

- Added a focused changefeed test that validates insert/update events via db.changefeed: [src/packages/database/postgres/changefeed.test.ts](./src/packages/database/postgres/changefeed.test.ts)

## \(done\) Phase 3: Schema Sync and SQL Compatibility

Goal: ensure schema sync works and DDL is PGlite-safe.

1) Run syncSchema under PGlite mode

- Confirm all tables and indexes are created.
- Identify any statements that fail in PGlite.

2) Compatibility layer

- Guard unsupported SQL with a PGlite-aware conditional.
- Avoid extensions or database-level features that are not supported.

Deliverable

- Syncing schema with COCALC_DB=pglite is reliable and repeatable.

## Phase 3 Status

- Added a syncSchema test that verifies all managed tables exist after sync: [src/packages/database/postgres/schema/sync.test.ts](./src/packages/database/postgres/schema/sync.test.ts)

## Phase 4: Testing Strategy

Goal: have a minimal but meaningful test set that runs under PGlite.

1) Add a PGlite test harness

- Set COCALC_DB=pglite in a test setup file (optional toggle).
- Reuse existing unit tests where possible.

2) Expand test coverage incrementally

- pool tests
- schema sync
- changefeed/listen-notify
- a small slice of hub logic that queries and writes data

3) CI/Dev usage

- Provide a simple script or doc to run tests with PGlite.
- Decide whether PGlite is default for a subset of tests.

## Phase 4 Status (in progress)

- Added an env-gated test harness and a `test:pglite` script for this package: [src/packages/database/test/setup.js](./src/packages/database/test/setup.js), [src/packages/database/package.json](./src/packages/database/package.json)
- Documented the PGlite test flow in the database README: [src/packages/database/README.md](./src/packages/database/README.md)

## Phase 5: SEA Packaging

Goal: ensure PGlite assets are bundled and usable in the SEA build.

1) Bundle assets

- Ensure pglite.wasm and pglite.data are available at runtime.
- Confirm NodeFS persistence works from COCALC_PGLITE_DATA_DIR.

2) Boot-time smoke check

- Add a small PGlite health check in the SEA startup path.
- Fail fast with a clear error if assets are missing.

3) Runtime defaults

- Default data dir under user home, e.g., ~/.cocalc/pglite

## Phase 6: Migration and Backup

Goal: allow an easy upgrade path to Postgres later.

1) Export path

- Provide a utility to dump dataDir or logical export to SQL.

2) Import path

- Provide a script to import into Postgres.

3) Guardrails

- Warn on switching from PGlite to Postgres without export.

## Risks and Mitigations

- Single\-connection contention: use serialized query queue and avoid nested DB calls.
  - In theory there might be the potential of a deadlock \(?\)
- LISTEN/NOTIFY differences: fallback to in\-process bus.
- Asset bundling in SEA: add explicit packaging step and runtime checks.

## Deliverable Checklist

- PGlite mode fully functional for hub control-plane
- Changefeeds work (native or fallback)
- Tests running under PGlite for key slices
- SEA build includes PGlite assets
- Simple migration/export path documented

