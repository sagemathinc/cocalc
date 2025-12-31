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
