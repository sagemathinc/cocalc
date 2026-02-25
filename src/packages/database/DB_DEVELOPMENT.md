<!--
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
-->

# Database Package Development

## Architecture Overview

### Entry Points

- `database/db.ts`: singleton `db()` creation and caching.
- `database/index.ts`: public exports surface (utilities, columns, `db`, `getPool`).

### Two Database Access Patterns

- **Composed class via `db()`**: legacy interface with callback compatibility.
- **Direct pool access via `getPool()`**: preferred for new code, async/await with typed queries.

## Type Safety

- Type `opts` parameters on wrapper methods in `postgres.ts` using shared helper types (e.g., `PgMethodOpts`, `DbFunctionOpts`, `DbFunctionOptsWithCb`).
- Keep callback compatibility (`cb` optional) while returning Promises.
- Prefer types from `postgres/types.ts` and module-specific option interfaces.
- Use `runWithCb`/`runWithCbOpts` for uniform callback bridging.

## Modernization Guidelines

**Follow the full guide:** `dev/MODERNIZE_CODE.md`

Key expectations when modernizing database code:

- Use async/await instead of callback chains or `async.series`/`async.parallel`.
- Replace `defaults()` with TypeScript destructuring and defaults.
- Update callers to use direct async/await where possible.
- Keep type signatures in `postgres/types.ts` aligned with implementations.

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
