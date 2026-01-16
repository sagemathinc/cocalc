# Frontend LRO helpers

This folder provides shared helpers for Long-Running Operations (LRO) UI state:
it consumes LRO summaries from the hub API and subscribes to LRO event streams
via conat to keep progress in sync across browser sessions.

What lives here:
- `utils.ts`: common types and helpers for terminal/dismiss checks and folding
  stream events into a single UI state.
- `ops-manager.ts`: reusable managers that list active LROs, attach streams,
  dedupe updates, and clean up when operations complete or are dismissed.

How it fits the broader LRO architecture:
- The backend persists LRO summaries in Postgres and publishes progress events
  over conat streams.
- Frontend managers call list + stream and then keep UI state updated until the
  LRO reaches a terminal status.
- Dismissals are server-side, so all clients stop showing a dismissed LRO once
  the database record is updated.

For the full LRO design, see
../../../../docs/long-running-operations.md.
