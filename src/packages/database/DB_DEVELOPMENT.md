<!--
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
-->

# Database Package CoffeeScript to TypeScript Migration

## Current Status

**Migration Progress: 35% Complete (2,393 of 6,827 lines)**

### Remaining CoffeeScript Files

| File                             | Lines | Description                                     | Priority     |
| -------------------------------- | ----- | ----------------------------------------------- | ------------ |
| `postgres-server-queries.coffee` | 2,518 | Server-side database queries                    | High         |
| `postgres-base.coffee`           | 1,156 | Core PostgreSQL class and connection management | **Critical** |
| `postgres-blobs.coffee`          | 760   | Blob storage operations                         | Medium       |
| **Total Remaining**              | 4,434 |                                                 |              |

### Completed Migrations ✅

| File                           | Lines | Migrated To                | Tests | Status     |
| ------------------------------ | ----- | -------------------------- | ----- | ---------- |
| `postgres-user-queries.coffee` | 1,790 | `user-query/queries.ts`    | 150   | ✅ Removed |
| `postgres-synctable.coffee`    | 604   | `synctable/*.ts` (3 files) | 109   | ✅ Removed |
| **Total Migrated**             | 2,394 | **35% of original code**   | 259   |            |

**All database tests passing: 328/328 ✅**

## Architecture Overview

### Entry Point: `database/index.ts`

The `db()` function composes the PostgreSQL class from multiple modules:

```typescript
export function db(opts = {}): PostgreSQL {
  if (theDB === undefined) {
    let PostgreSQL = base.PostgreSQL;

    PostgreSQL = postgresServerQueries.extend_PostgreSQL(PostgreSQL);
    PostgreSQL = postgresBlobs.extend_PostgreSQL(PostgreSQL);
    PostgreSQL = extendPostgresSynctable(PostgreSQL); // ✅ TypeScript
    PostgreSQL = extendPostgresUserQueries(PostgreSQL); // ✅ TypeScript
    PostgreSQL = extendPostgresOps(PostgreSQL); // ✅ TypeScript
    const theDBnew = new PostgreSQL(opts);
    setupRecordConnectErrors(theDBnew);
    theDB = theDBnew;
  }
  return theDB;
}
```

**Composition Order** (must be preserved): server-queries → blobs → synctable → user-queries → ops

### Two Database Access Patterns

**Legacy Pattern (CoffeeScript)**: Composed `PostgreSQL` class via `db()` singleton

- Methods added via `extend_PostgreSQL` pattern
- Uses callback-based API (`cb: CB` pattern)
- Located in `postgres-*.coffee` files

**Modern Pattern (TypeScript)**: Direct pool access via `getPool()`

- Already fully TypeScript in `pool/` directory
- Uses async/await
- Example: `const pool = getPool(); const { rows } = await pool.query(...)`

## Migration Strategy

### Phase 1: Setup and Tooling ✅ COMPLETE

- [x] Install `decaffeinate` and configure Jest coverage
- [x] Test decaffeinate with sample code
- [x] Upgrade `pg` client library to ^8.16.3

**Recommended decaffeinate parameters:**

```bash
npx decaffeinate \
  --use-js-modules \
  --loose \
  --optional-chaining \
  --logical-assignment \
  <filename>.coffee
```

### Phase 2: Incremental Method Migration

**Test-Driven Workflow:**

1. **Write/verify tests FIRST** - ensure comprehensive coverage
2. **Baseline** - verify tests pass with CoffeeScript implementation
3. **Decaffeinate and convert** - transform to TypeScript with proper types
4. **Verify tests pass** - ensure TypeScript implementation works identically
5. **Build and typecheck** - ensure no compilation errors
6. **Remove CoffeeScript file** - after verification

**Async/Await Pattern:**

```typescript
// New TypeScript implementation
export async function backupTable(opts: {
  table: string;
  path?: string;
}): Promise<void> {
  const path = opts.path ?? "backup";
  await executeCommand(`pg_dump -Fc --table ${opts.table}...`);
}

// Callback version for backward compatibility
export function backupTableCB(opts: {
  table: string;
  path?: string;
  cb: CB;
}): void {
  backupTable(opts)
    .then(() => opts.cb())
    .catch((err) => opts.cb(err));
}
```

### Phase 3: Class Consolidation (Future)

Once all methods migrated:

1. Create unified `postgres/postgresql.ts` class
2. Update `index.ts` to import directly instead of extension pattern
3. Remove all `postgres-*.coffee` files
4. Update build script: remove `&& coffee -c -o dist/ ./`
5. Remove `coffeescript` and `decaffeinate` from devDependencies

### Phase 4: Refactoring (Future)

After migration is stable:

- Modernize patterns and architecture
- Improve type safety
- Extract duplicate code
- Performance optimizations

## Testing Strategy

### Requirements

- **Unit Tests**: Test functions in isolation (happy path, errors, edge cases)
- **Integration Tests**: Test interaction with database
- **Regression Tests**: Ensure existing behavior preserved

### Type Safety

**CRITICAL**: Never use `any` type for database instances - always use `PostgreSQL` type from `postgres/types.ts`

### Coverage Goals

- **Minimum**: 80% coverage for all new TypeScript code
- **Target**: 90%+ coverage
- **Critical paths**: 100% coverage (auth, payment, data integrity)

### Running Tests

```bash
pnpm test              # Run all tests
pnpm coverage          # Run with coverage report
pnpm test <file>       # Run specific test file
pnpm test --watch      # Watch mode
```

## Completed Migrations - Details

### ✅ postgres-user-queries.coffee → user-query/queries.ts

**Migrated**: December 2024
**Complexity**: Very High - 44+ methods including authorization, changefeeds, query routing
**Tests**: 150 comprehensive tests (100% pass rate)
**Result**: CoffeeScript file removed, TypeScript implementation fully integrated

Key methods migrated:

- Public API: `user_query`, `user_query_cancel_changefeed`, `user_set_query`, `user_get_query`
- Query routing: `_user_set_query_project_query`, `_user_set_query_project_users`, `_user_get_query_parse_request`
- Authorization: `_check_project_query_for_write_perms`, `_user_set_query_admin`, `_check_user_set_query_access`
- Changefeeds: `_user_get_query_changefeed_update`, `_user_get_query_changefeed`, `_user_get_query_get_changefeed_id`

### ✅ postgres-synctable.coffee → synctable/ (3 files)

**Migrated**: December 2024
**Complexity**: High - Real-time table synchronization with LISTEN/NOTIFY
**Tests**: 109 tests (104 unit + integration tests)
**Result**: Split into 3 TypeScript modules, CoffeeScript file removed

**File structure:**

- `synctable/trigger.ts` - PostgreSQL trigger code generation (35 tests)
- `synctable/synctable.ts` - SyncTable class for real-time sync (35 tests)
- `synctable/methods.ts` - PostgreSQL extension methods (34 tests)

Key features:

- PostgreSQL LISTEN/NOTIFY for real-time updates
- Immutable.js for efficient state management
- Reference-counted trigger registration
- Reconnection handling with state preservation

## Resources

- [decaffeinate Documentation](https://github.com/decaffeinate/decaffeinate)
- [Jest Coverage Configuration](https://jestjs.io/docs/configuration#collectcoveragefrom-array)
- [CoCalc TypeScript Style Guide](../CLAUDE.md)
- [Database Schema](../util/db-schema/)

## Notes

- CoffeeScript files use old `async` callback pattern - migrate to async/await
- EventEmitter pattern used extensively for changefeeds
- PostgreSQL LISTEN/NOTIFY is critical for real-time features
- Performance is critical - this is a hot path in the application
- Be extremely careful with query construction to avoid SQL injection
