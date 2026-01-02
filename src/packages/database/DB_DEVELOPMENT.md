<!--
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
-->

# Database Package Development

## Architecture Overview

### Entry Point: `database/index.ts`

The `db()` function composes the PostgreSQL class from multiple modules:

```typescript
export function db(opts = {}): PostgreSQL {
  if (theDB === undefined) {
    let PostgreSQL = base.PostgreSQL;

    PostgreSQL = extendPostgresServerQueries(PostgreSQL);
    PostgreSQL = extendPostgresBlobs(PostgreSQL);
    PostgreSQL = extendPostgresSynctable(PostgreSQL);
    PostgreSQL = extendPostgresUserQueries(PostgreSQL);
    PostgreSQL = extendPostgresOps(PostgreSQL);
    const theDBnew = new PostgreSQL(opts);
    setupRecordConnectErrors(theDBnew);
    theDB = theDBnew;
  }
  return theDB;
}
```

**Composition order** (must be preserved): server-queries → blobs → synctable → user-queries → ops.

### Two Database Access Patterns

- **Composed class via `db()`**: legacy interface, callback compatibility, used throughout the backend.
- **Direct pool access via `getPool()`**: preferred for new code, async/await with typed queries.

## Modernization Guidelines

**Follow the full guide:** `dev/MODERNIZE_CODE.md`

Key expectations when modernizing database code:

- Use async/await instead of callback chains or `async.series`/`async.parallel`.
- Replace `defaults()` with TypeScript destructuring and defaults.
- Keep callback compatibility (`cb` optional) while returning a Promise.
- Update callers to use direct async/await where possible.
- Update type signatures in `postgres/types.ts` as methods modernize.
- Make TypeScript types tighter for method inputs/outputs in each module (avoid `any`, use shared types from `postgres/types.ts`).

**Naming note:** It is fine to use `project_id`, `account_id`, etc., for compatibility and shorthand object creation (e.g., `{ project_id }`).

## Testing Strategy

### Database Initialization in Tests

All tests that interact with the database must use the ephemeral DB helper and cleanup:

```typescript
import { initEphemeralDatabase } from "@cocalc/database/pool";
import { testCleanup } from "@cocalc/database/test-utils";

describe("your test suite", () => {
  beforeAll(async () => {
    await initEphemeralDatabase({});
  }, 15000);

  afterAll(async () => {
    await testCleanup();
  });

  // tests...
});
```

`testCleanup()` handles:

- Clearing throttles
- Closing the test query interval (if present)
- Ending the database pool (prevents Jest open handles)

If you use a non-singleton database instance, pass it explicitly:

```typescript
afterAll(async () => {
  await testCleanup(customDatabaseInstance);
});
```

## Type Safety

- Avoid `any` for database instances.
- Use `PostgreSQL` from `postgres/types.ts` for typed instances.

## Planned Refactor: PostgreSQL Composition and Types

Keep this scoped and incremental; do not break `db()` consumers.

1. **Composition registry:** Extract a single ordered list of extension functions and compose in a loop so order is explicit and testable.
2. **Singleton opts guard:** Warn or throw if `db(opts)` is called again with non-empty `opts` after the singleton exists.
3. **Remove redundant `bind_methods`:** `postgres-base.ts` already binds all methods; remove extra binds in mixin constructors.
4. **Standardize mixin typing:** Use a shared `PostgreSQLConstructor` type for all `extend_PostgreSQL` helpers.
5. **Connect error recording:** Either wire `setupRecordConnectErrors` to the `connect`/`disconnect` events or remove the no-op hook.
6. **Tighter TypeScript types:** Replace `any` in method signatures with specific types from `postgres/types.ts`, and add new types where needed.

## Planned Refactor: Remove `extend_PostgreSQL` Mixins

Goal: replace class extension composition with a single `PostgreSQL` class in `packages/database/postgres.ts` that exposes wrapper methods and delegates implementation to per-module functions.

### Current `extend_PostgreSQL` modules

- **Wrapper-only (already delegating):**
  - `packages/database/postgres-server-queries.ts`
  - `packages/database/postgres-ops.ts`
- **Direct implementations (must be refactored into delegation):**
  - `packages/database/postgres/blobs/methods.ts`
  - `packages/database/synctable/methods.ts`
  - `packages/database/user-query/queries.ts`

### Steps

1. Refactor each direct-implementation module to export pure functions that accept `(db: PostgreSQL, opts)` and return a Promise (plus optional `cb`), mirroring the wrapper style.
2. Create `packages/database/postgres.ts` with a single `PostgreSQL` class that:
   - owns construction/initialization (currently in `postgres-base.ts`)
   - implements wrapper methods that call the new function modules
3. Update `packages/database/index.ts` to instantiate the new class directly (no mixin composition).
4. Delete `extend_PostgreSQL` usage and remove the interface duplication in `postgres/types.ts` only after the class surface area is complete and typed.

### Suggested sequencing

1. `postgres/blobs/methods.ts` (self-contained, minimal external coupling)
2. `synctable/methods.ts` (changefeed/listen wiring, still isolated)
3. `user-query/queries.ts` (largest surface, most dependencies)

After each step, verify with:

```bash
src/packages/database$ pnpm clean && pnpm build && pnpm test
```
