<!--
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
-->

# Database Package CoffeeScript to TypeScript Migration

## Current Status

**Migration Progress: 46% Complete (3,154 of 6,827 lines)**

### Remaining CoffeeScript Files

| File                             | Lines | Description                                     | Priority     |
| -------------------------------- | ----- | ----------------------------------------------- | ------------ |
| `postgres-server-queries.coffee` | 2,518 | Server-side database queries                    | High         |
| `postgres-base.coffee`           | 1,156 | Core PostgreSQL class and connection management | **Critical** |
| **Total Remaining**              | 3,674 |                                                 |              |

### Completed Migrations ✅

| File                           | Lines | Migrated To                     | Tests | Status     |
| ------------------------------ | ----- | ------------------------------- | ----- | ---------- |
| `postgres-user-queries.coffee` | 1,790 | `user-query/queries.ts`         | 150   | ✅ Removed |
| `postgres-synctable.coffee`    | 604   | `synctable/*.ts` (3 files)      | 109   | ✅ Removed |
| `postgres-blobs.coffee`        | 760   | `postgres/blobs/*.ts` (3 files) | 42    | ✅ Removed |
| **Total Migrated**             | 3,154 | **46% of original code**        | 301   |            |

**All database tests passing: 374/374 ✅**

## Architecture Overview

### Entry Point: `database/index.ts`

The `db()` function composes the PostgreSQL class from multiple modules:

```typescript
export function db(opts = {}): PostgreSQL {
  if (theDB === undefined) {
    let PostgreSQL = base.PostgreSQL;

    PostgreSQL = postgresServerQueries.extend_PostgreSQL(PostgreSQL);
    PostgreSQL = extendPostgresBlobs(PostgreSQL); // ✅ TypeScript
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

### ✅ postgres-blobs.coffee → postgres/blobs/ (3 files)

**Migrated**: December 2024
**Complexity**: Medium - Blob storage with compression and external storage integration
**Tests**: 42 comprehensive tests (100% pass rate)
**Result**: Split into 3 TypeScript modules, CoffeeScript file removed

**File structure:**

- `postgres/blobs/methods.ts` - Main blob storage methods (1,070 lines, 14 methods)
- `postgres/blobs/archive.ts` - Patch archiving functions (`archivePatches`, `exportPatches`)
- `postgres/blobs/index.ts` - Extension module export

Key methods migrated:

- **Blob Operations**: `save_blob`, `get_blob`, `delete_blob`, `touch_blob`, `remove_blob_ttls`
- **External Storage**: `copy_blob_to_gcloud`, `copy_all_blobs_to_gcloud`, `blob_store`, `close_blob`
- **Maintenance**: `backup_blobs_to_tarball`, `blob_maintenance`, `syncstring_maintenance`
- **Patch Management**: `archivePatches`, `export_patches`, `import_patches`

Key features:

- Compression support (gzip, zlib) with configurable levels
- TTL (time-to-live) management with automatic expiration
- External storage integration (Google Cloud Storage via filesystem buckets)
- Blob verification with SHA1 UUID checking
- Batch operations with throttling and retry logic
- Incremental backup to tarballs

**Migration notes:**

- Fixed spread operator issue in `archivePatches` using `Object.assign` for decaffeinate compatibility
- Used `bind_methods(this)` utility instead of 17 individual method bindings
- Added proper TypeScript type annotations for all variables and parameters
- All async operations properly handled with async/await pattern
- Tests cover compression, TTL, metadata, external storage, and maintenance operations

## Remaining CoffeeScript Files - Detailed Analysis

### Already Extracted to TypeScript

The migration has made significant progress beyond the completed files. **49+ TypeScript modules** have been extracted from the remaining CoffeeScript files:

#### Core modules (`postgres/` - 29 files)

- `account-queries.ts` - Account management and payment status
- `always-running.ts` - Always-running project detection
- `central-log.ts` - Central logging system
- `changefeed.ts`, `changefeed-query.ts` - Real-time changefeeds
- `delete-patches.ts`, `delete-projects.ts` - Cleanup operations
- `passport.ts`, `passport-store.ts` - SSO authentication
- `project-queries.ts` - Project datastore operations
- `public-paths.ts` - Public path management
- `remember-me.ts` - Session management
- `registration-tokens.ts` - User registration tokens
- `stats.ts` - Analytics and statistics
- `user-tracking.ts` - User activity tracking
- `query.ts`, `util.ts`, `types.ts` - Query helpers and types
- `record-connect-error.ts` - Connection error tracking
- `server-settings.ts` - Server configuration
- `set-pg-params.ts` - PostgreSQL parameter configuration
- `messages.ts`, `news.ts`, `personal.ts`, `pii.ts` - Various features

#### Specialized subdirectories (20+ files)

- **`postgres/blobs/`** (3 files) - ✅ Blob storage with compression and external storage (fully migrated!)
- **`postgres/schema/`** (8 files) - Schema management, pg-type conversion, table sync, indexes
- **`postgres/ops/`** (4 files) - ✅ Backup/restore operations (fully TypeScript!)
- **`postgres/site-license/`** (8 files) - License analytics, usage logs, public info, manager, search
- **`postgres/stripe/`** (3 files) - Payment processing, customer sync
- **`synctable/`** (3 files) - ✅ Real-time table synchronization (fully migrated!)
- **`user-query/`** (3+ files) - ✅ User query system (fully migrated!)

### 1. postgres-base.coffee (1,156 lines) - **CRITICAL PRIORITY**

**Status**: Foundation class - contains core functionality that cannot be easily extracted

**~38 methods** including:

**Connection Management:**

- `connect`, `disconnect`, `_connect` - Connection pooling with retry logic
- `is_connected` - Connection status check
- Multi-host DNS resolution and failover
- Connection health monitoring with automatic reconnection

**Query Engine:**

- `_query`, `_do_query` - Core query execution with timeout handling
- `_client` - Get PostgreSQL client from pool
- Query result caching (LRU cache)
- Concurrent query tracking and load management

**LISTEN/NOTIFY Infrastructure:**

- `_listen`, `_stop_listening` - PostgreSQL NOTIFY subscription
- `_notification` - Notification handler
- `_listening`, `_clear_listening_state` - State management

**Schema Helpers:**

- `_primary_key`, `_primary_keys` - Primary key lookup from schema
- Database existence checking (`_ensure_database_exists`)

**Other:**

- `_dbg` - Debug logging helper
- `concurrent` - Query concurrency tracking
- `_init_metrics`, metrics tracking
- `close`, `clear_cache`, `engine`

**Complexity**: Very High - This is the foundation that all other modules depend on

**Migration Strategy**: Requires comprehensive test coverage before migration. Consider incremental approach:

1. Write extensive tests for all core functionality
2. Extract query caching logic first
3. Extract connection health monitoring
4. Extract LISTEN/NOTIFY infrastructure
5. Finally migrate core PostgreSQL class constructor and connection pool

### 2. postgres-server-queries.coffee (2,518 lines) - **HIGH PRIORITY**

**Status**: Orchestrator file - **Most methods already delegate to TypeScript modules**

**~128 methods**, with extensive imports from TypeScript modules:

```coffeescript
# Already using TypeScript modules:
{get_remember_me} = require('./postgres/remember-me')
{is_paying_customer} = require('./postgres/account-queries')
{getStripeCustomerId, syncCustomer} = require('./postgres/stripe')
{site_license_usage_stats, ...} = require('./postgres/site-license/analytics')
{permanently_unlink_all_deleted_projects_of_user} = require('./postgres/delete-projects')
{get_all_public_paths, unlist_all_public_paths} = require('./postgres/public-paths')
{get_personal_user} = require('./postgres/personal')
{passport functions} = require('./postgres/passport')
{projects_that_need_to_be_started} = require('./postgres/always-running')
{calc_stats} = require('./postgres/stats')
{pii_expire} = require('./postgres/pii')
{updateUnreadMessageCount} = require('./postgres/messages')
centralLog = require('./postgres/central-log')
# ...and more
```

**Method Categories:**

- **Central Logging**: `log`, `get_log`, `uncaught_exception` - use `central-log.ts`
- **Account Management**: Uses `account-queries.ts` for payment status, user info
- **Stripe Integration**: Uses `postgres/stripe/*.ts` for payment processing
- **Site Licenses**: Uses `postgres/site-license/*.ts` (8 TypeScript modules)
- **Project Operations**: Uses `project-queries.ts`, `delete-projects.ts`, `always-running.ts`
- **Authentication**: Uses `passport.ts`, `registration-tokens.ts`, `remember-me.ts`
- **User Tracking**: Uses `user-tracking.ts`, `messages.ts`, `personal.ts`
- **Server Settings**: Configuration and passport caching
- **Statistics**: Uses `stats.ts`

**Complexity**: Medium - Mostly orchestration and wrapping existing TypeScript functions

**Migration Strategy**: This file is a good candidate for next migration:

1. Identify remaining methods that haven't been extracted
2. Convert wrapper methods to TypeScript extend pattern
3. Create `postgres/server-queries/` directory for remaining implementations
4. Most functionality already tested through extracted modules

## Migration Recommendations

### Recommended Migration Order

Based on complexity, dependencies, and risk:

**Phase 2A: ✅ postgres-blobs.coffee → postgres/blobs/ (COMPLETED)**

- **Status**: ✅ Migrated December 2024
- **Result**: 3 TypeScript files, 42 tests, CoffeeScript file removed
- **Lessons learned**: Spread operator required Object.assign workaround for decaffeinate

**Phase 2B: postgres-server-queries.coffee → postgres/server-queries/ (RECOMMENDED NEXT)**

- **Effort**: Medium-High (2,518 lines, 128 methods)
- **Risk**: Medium - Many methods but most delegate to TypeScript modules
- **Already extracted**: Most functionality in 20+ TypeScript modules
- **Remaining work**: Convert orchestration/wrapper methods, identify non-extracted methods
- **Strategy**: Incremental migration - group related methods and migrate in batches

**Phase 2C: postgres-base.coffee → postgres/base.ts**

- **Effort**: High (1,156 lines, 38 methods)
- **Risk**: **CRITICAL** - Foundation class for all database operations
- **Dependencies**: Everything depends on this
- **Remaining work**: Connection pooling, query engine, LISTEN/NOTIFY, schema helpers
- **Prerequisites**: Comprehensive test coverage required before starting
- **Strategy**: Extract incrementally - start with query caching, then connection health, then LISTEN/NOTIFY

### Next Steps

1. **Immediate**: Analyze `postgres-server-queries.coffee` in detail
   - Identify which methods still need extraction (vs. already delegating)
   - Create migration plan for remaining methods
   - Group related methods for incremental migration
   - Target: Migrate in 3-4 batches to reduce risk

2. **Short-term**: Begin `postgres-server-queries.coffee` migration
   - Start with highest-value or most isolated method groups
   - Write tests for any untested methods
   - Migrate batch by batch, verifying tests after each batch
   - Update documentation after each batch

3. **Medium-term**: Plan `postgres-base.coffee` migration
   - Write extensive integration tests for core functionality
   - Consider incremental extraction approach
   - This is the most critical migration and requires careful planning
   - May require coordination with CoCalc deployment team

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
