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

**Test-Driven Workflow (temporary `USE_TYPESCRIPT` toggle allowed; must be removed):**

1. **Write tests FIRST** - ensure comprehensive coverage (CRITICAL: Do NOT skip this step!). These tests must target the legacy CoffeeScript class via `db()` and `callback_opts` (or equivalent) so they validate existing behavior.
2. **Add a temporary toggle (tests only)** - introduce a local `const USE_TYPESCRIPT = false;` in the new test file for the batch. Use this toggle to choose between:
   - **CoffeeScript path**: call methods on `db()` (legacy class)
   - **TypeScript path**: call the new TS functions directly
     Do NOT use env flags; keep it a local constant inside the test file.
3. **Baseline the legacy behavior** - run the tests with `USE_TYPESCRIPT = false` and confirm they pass against the CoffeeScript implementation.
4. **Implement TypeScript** - write the new TS functions with proper typing and behavior parity.
5. **Flip the toggle** - set `USE_TYPESCRIPT = true` and re-run the same tests against the new TS implementation. Fix the TS implementation until tests pass.
6. **Re-route CoffeeScript to TS** - update the CoffeeScript class to wrap/forward to the new TS functions (wrapper pattern). Delete the old CoffeeScript logic for those methods so the legacy class now uses the TS implementation.
7. **Switch back and remove the toggle** - set `USE_TYPESCRIPT = false`, confirm tests still pass through the CoffeeScript class (now wired to TS), then remove the toggle and the TS branch in the test file entirely. The tests should permanently target the CoffeeScript class.
8. **Finalize** - run `pnpm tsc --noEmit`, then `pnpm build`, then re-run the relevant tests to confirm the code compiles and behavior is preserved.

**Naming note:**

- It is fine to use `project_id`, `account_id`, etc., for compatibility with existing APIs and DB columns. This keeps object literal shorthand and parameter passing concise (e.g., `{ project_id }`).

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

### Modernizing Callback Methods to Async/TypeScript

**📖 For the complete modernization guide, see [dev/MODERNIZE_CODE.md](../../dev/MODERNIZE_CODE.md)**

When modernizing legacy callback-based database methods (using `async.series`, `defaults()`, etc.), follow the comprehensive step-by-step guide. The process ensures:

- Backwards compatibility with existing callback-based code
- Clean async/await patterns for new code
- Proper error handling with try/catch
- TypeScript destructuring instead of `defaults()`
- Direct async/await usage by updating all callers

The guide includes a complete example of `blob_maintenance` transformation (60 lines → 36 lines, 40% reduction) with detailed before/after code samples.

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

### Database Initialization in Tests

**REQUIRED**: All test files that interact with the database must use ephemeral database initialization:

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

  // Your tests here...
});
```

**CRITICAL - afterAll Cleanup**:

**ALWAYS** use `await testCleanup()` in `afterAll` blocks. This is **required** for proper test cleanup.

```typescript
afterAll(async () => {
  await testCleanup();
});
```

If you have a non-singleton database instance, you can pass it explicitly:

```typescript
afterAll(async () => {
  await testCleanup(customDatabaseInstance);
});
```

**What `testCleanup` does:**

- Gets the database instance (uses passed parameter or falls back to `db()` singleton)
- Clears throttles to avoid cross-test rate-limit interference
- Closes the test query connection if available
- Ends the database pool to prevent Jest open handle warnings

**Benefits:**

- Ensures clean database state before tests run
- Prevents test pollution between test runs
- Proper cleanup prevents Jest open handle warnings
- Clearing throttles (when database passed) avoids cross-test rate-limit interference
- Consistent test environment across all migrations

### Type Safety

**CRITICAL**: Never use `any` type for database instances - always use `PostgreSQL` type from `postgres/types.ts`

**Best Practice**: When migrating methods that use internal PostgreSQL methods (like `_throttle`, `sha1`, etc.), add proper type signatures to the `PostgreSQL` interface in `postgres/types.ts` rather than using type assertions like `(db as any)._throttle(...)`. This ensures type safety across the entire codebase.

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

**Migration Strategy**: Incremental method-by-method migration using wrapper pattern:

Many methods are already simple wrappers that delegate to TypeScript modules:

```coffeescript
update_account_and_passport: (opts) =>
    return await update_account_and_passport(@, opts)
```

**Per-Method Migration Workflow (tests always hit CoffeeScript class):**

1. **Write Test**: Create test in `postgres/` directory with suitable filename (e.g., `postgres/foo.test.ts`)
   - Test must call the CoffeeScript method via `db()` (never import the TypeScript directly in tests).
   - Use `callback_opts` if the CoffeeScript method is callback-based.
   - Ensure the test passes before proceeding.

2. **Convert to TypeScript**: Create TypeScript implementation next to the test
   - File: `postgres/foo.ts` (matches `postgres/foo.test.ts`)
   - Export function that takes `db: PostgreSQL` as first parameter
   - Example: `export async function fooMethod(db: PostgreSQL, opts: FooOpts): Promise<void>`

3. **Wrap in CoffeeScript**: Update `postgres-server-queries.coffee` to route the CoffeeScript method to the new TypeScript function

   ```coffeescript
   {fooMethod} = require('./postgres/foo')

   # ... in class:
   fooMethod: (opts) =>
       return await fooMethod(@, opts)
   ```

4. **Verify**: Re-run the same test file. It must pass without changes to the test.

5. **Delete old logic**: Remove the old CoffeeScript implementation, keeping only the wrapper.

6. **Iterate**: Repeat for the next method.

**Bundling Guidelines:**

- Bundle related methods in same file when they share:
  - Similar functionality (e.g., account management methods)
  - Common helper functions
  - Related database tables
- Keep files focused - prefer multiple small files over one large file
- Example: `postgres/account-settings.ts` could contain `get_account_settings`, `set_account_settings`, `update_account_settings`

**Method Prioritization:**

1. **Start with simple wrappers** - Methods already delegating to TypeScript modules
2. **Then isolated methods** - Methods with minimal dependencies on other CoffeeScript code
3. **Finally complex methods** - Methods with intricate logic or many dependencies

**Example Migration Sequence:**

```typescript
// 1. postgres/account-settings.ts
export async function getAccountSettings(db: PostgreSQL, opts: { account_id: string }): Promise<Settings> {
  // implementation
}

export async function setAccountSettings(db: PostgreSQL, opts: { account_id: string; settings: Settings }): Promise<void> {
  // implementation
}

// 2. postgres/account-settings.test.ts
describe("Account Settings", () => {
  it("gets account settings", async () => { ... });
  it("sets account settings", async () => { ... });
});

// 3. Update postgres-server-queries.coffee
{getAccountSettings, setAccountSettings} = require('./postgres/account-settings')

getAccountSettings: (opts) => await getAccountSettings(@, opts)
setAccountSettings: (opts) => await setAccountSettings(@, opts)
```

**Benefits of This Approach:**

- Low risk - one method at a time
- Immediate value - each method can be tested and verified independently
- Flexible - can pause/resume migration at any point
- Incremental - builds up TypeScript codebase steadily
- Testable - ensures behavior preservation through automated tests

**Final Step - Converting the Scaffolding:**

Once all ~128 methods have been migrated to wrappers, convert the remaining class structure:

1. **Create Extension Module**: `postgres/server-queries/methods.ts`
   - Convert the class extension pattern from CoffeeScript to TypeScript
   - Import all the individual method modules
   - Use `extend_PostgreSQL` pattern like other modules

2. **Create Index**: `postgres/server-queries/index.ts`

   ```typescript
   export { extend_PostgreSQL } from "./methods";
   ```

3. **Update Central Index**: Modify `database/index.ts`

   ```typescript
   // Change from:
   const postgresServerQueries = require("./postgres-server-queries");

   // To:
   import { extend_PostgreSQL as extendPostgresServerQueries } from "./postgres/server-queries";

   // In db() function:
   PostgreSQL = extendPostgresServerQueries(PostgreSQL); // ✅ TypeScript
   ```

4. **Remove CoffeeScript**: Delete `postgres-server-queries.coffee` and compiled output

5. **Verify**: Run all tests to ensure nothing broke during final conversion

**Method Migration Progress Tracking:**

_This list will be updated as methods are migrated. Each checkbox indicates completion._

**Logging & Error Tracking (7 methods):**

- [x] `get_log` → `postgres/log-query.ts`
- [x] `get_user_log` → `postgres/log-query.ts`
- [x] `uncaught_exception` → `postgres/log-query.ts`
- [x] `log_client_error` → `postgres/log-query.ts`
- [x] `webapp_error` → `postgres/log-query.ts`
- [x] `get_client_error_log` → `postgres/log-query.ts`
- [ ] `log` (wrapper for centralLog, needs migration)

**Server Settings (6 methods):**

- [x] `set_server_setting` → `postgres/server-settings.ts`
- [x] `get_server_setting` → `postgres/server-settings.ts`
- [x] `get_server_settings_cached` → `postgres/server-settings.ts`
- [x] `get_site_settings` → `postgres/server-settings.ts`
- [x] `server_settings_synctable` → `postgres/server-settings.ts`
- [x] `reset_server_settings_cache` → `postgres/server-settings.ts`

**Passport/SSO (8 methods already wrapped):**

- [x] `set_passport_settings` (already wrapper → `postgres/passport.ts`)
- [x] `get_passport_settings` (already wrapper → `postgres/passport.ts`)
- [x] `get_all_passport_settings` (already wrapper → `postgres/passport.ts`)
- [x] `get_all_passport_settings_cached` (already wrapper → `postgres/passport.ts`)
- [x] `create_passport` (already wrapper → `postgres/passport.ts`)
- [x] `passport_exists` (already wrapper → `postgres/passport.ts`)
- [x] `update_account_and_passport` (already wrapper → `postgres/passport.ts`)
- [ ] `create_sso_account` (complex, needs migration)

**Account Management (26 methods):**

- [x] `is_admin` → `postgres/account-basic.ts`
- [x] `user_is_in_group` → `postgres/account-basic.ts`
- [x] `make_user_admin` → `postgres/account-management.ts`
- [x] `count_accounts_created_by` → `postgres/account-management.ts`
- [x] `delete_account` → `postgres/account/deletion.ts`
- [x] `mark_account_deleted` → `postgres/account/deletion.ts`
- [x] `account_exists` → `postgres/account-basic.ts`
- [x] `account_creation_actions` → `postgres/account/creation.ts`
- [x] `account_creation_actions_success` → `postgres/account/creation.ts`
- [x] `do_account_creation_actions` → `postgres/account/creation.ts`
- [x] `verify_email_create_token` → `postgres/account/verify-email.ts`
- [x] `verify_email_check_token` → `postgres/account/verify-email.ts`
- [x] `verify_email_get` → `postgres/account/verify-email.ts`
- [x] `is_verified_email` → `postgres/account/verify-email.ts`
- [x] `get_coupon_history` → `postgres/coupon-and-username.ts`
- [x] `update_coupon_history` → `postgres/coupon-and-username.ts`
- [x] `account_ids_to_usernames` → `postgres/coupon-and-username.ts`
- [x] `_account_where` → `postgres/account-core.ts`
- [x] `get_account` → `postgres/account-core.ts`
- [x] `is_banned_user` → `postgres/account-core.ts`
- [x] `_touch_account` → `postgres/account-management.ts`
- [x] `touch` → `postgres/activity.ts`
- [x] `get_remember_me` (already wrapper → `postgres/remember-me.ts`)
- [x] `get_personal_user` (already wrapper → `postgres/personal.ts`)
- [ ] `change_email_address`
- [x] `change_password`
- [x] `reset_password`
- [x] `set_password_reset`
- [x] `get_password_reset`
- [x] `delete_password_reset`
- [x] `record_password_reset_attempt`
- [x] `count_password_reset_attempts`
- [x] `invalidate_all_remember_me` (already wrapper → `postgres/remember-me.ts`)
- [x] `delete_remember_me` (already wrapper → `postgres/remember-me.ts`)
- [x] `accountIsInOrganization` → `postgres/account/account-is-in-organization.ts`
- [x] `nameToAccountOrOrganization` → `postgres/account/name-to-account-or-organization.ts`

**File Access & Usage (4 methods):**

- [x] `log_file_access` → `postgres/file-access.ts`
- [x] `get_file_access` → `postgres/file-access.ts`
- [x] `record_file_use` → `postgres/file-access.ts`
- [x] `get_file_use` → `postgres/file-access.ts`

**Project Management (35 methods):**

- [x] `_validate_opts` → `postgres/account-utils.ts`
- [x] `get_project`
- [x] `_get_project_column`
- [x] `get_user_column`
- [x] `add_user_to_project` → `postgres/account-collaborators.ts`
- [x] `set_project_status` → `postgres/project-status.ts`
- [x] `remove_collaborator_from_project` → `postgres/account-collaborators.ts`
- [x] `remove_user_from_project` → `postgres/account-collaborators.ts`
- [x] `get_collaborator_ids` (already wrapper → `postgres/project-queries.ts`)
- [x] `get_collaborators` (already wrapper → `postgres/project-queries.ts`)
- [x] `get_public_paths` (already wrapper → `postgres/public-paths.ts`)
- [x] `has_public_path` (already wrapper → `postgres/public-paths.ts`)
- [x] `path_is_public` (already wrapper → `postgres/public-paths.ts`)
- [x] `filter_public_paths` (already wrapper → `postgres/public-paths.ts`)
- [x] `_touch_project` → `postgres/activity.ts`
- [x] `touch_project` → `postgres/activity.ts`
- [x] `recently_modified_projects`
- [x] `get_open_unused_projects`
- [x] `user_is_in_project_group`
- [x] `user_is_collaborator`
- [x] `get_project_ids_with_user`
- [x] `get_account_ids_using_project`
- [x] `when_sent_project_invite` → `postgres/project/invites.ts`
- [x] `sent_project_invite` → `postgres/project/invites.ts`
- [x] `set_project_host` → `postgres/project-host.ts`
- [x] `unset_project_host` → `postgres/project-host.ts`
- [x] `get_project_host` → `postgres/project-host.ts`
- [x] `set_project_storage` → `postgres/project-storage.ts`
- [x] `get_project_storage` → `postgres/project-storage.ts`
- [x] `update_project_storage_save` → `postgres/project-storage.ts`
- [x] `set_project_storage_request` → `postgres/project-state.ts`
- [x] `get_project_storage_request` → `postgres/project-state.ts`
- [x] `set_project_state` → `postgres/project-state.ts`
- [x] `get_project_state` → `postgres/project-state.ts`
- [ ] `get_project_quotas`
- [ ] `get_user_project_upgrades`
- [ ] `ensure_user_project_upgrades_are_valid`
- [ ] `ensure_all_user_project_upgrades_are_valid`
- [ ] `get_project_upgrades`
- [ ] `remove_all_user_project_upgrades`
- [x] `get_project_settings` → `postgres/project-settings.ts`
- [x] `set_project_settings` → `postgres/project-settings.ts`
- [x] `get_project_extra_env` → `postgres/project-extra-env.ts`
- [x] `recent_projects` → `postgres/project-recent.ts`
- [x] `set_run_quota` → `postgres/project/set-run-quota.ts`
- [x] `project_datastore_set` (already wrapper → `postgres/project-queries.ts`)
- [x] `project_datastore_get` (already wrapper → `postgres/project-queries.ts`)
- [x] `project_datastore_del` (already wrapper → `postgres/project-queries.ts`)
- [x] `permanently_unlink_all_deleted_projects_of_user` (already wrapper → `postgres/delete-projects.ts`)
- [x] `unlink_old_deleted_projects` (already wrapper → `postgres/delete-projects.ts`)
- [x] `projects_that_need_to_be_started` (already wrapper → `postgres/always-running.ts`)

**Public Paths (6 methods already wrapped):**

- [x] `unlist_all_public_paths` (already wrapper → `postgres/public-paths.ts`)
- [x] `get_all_public_paths` (already wrapper → `postgres/public-paths.ts`)
- [x] `get_public_paths` (already wrapper → `postgres/public-paths.ts`)
- [x] `has_public_path` (already wrapper → `postgres/public-paths.ts`)
- [x] `path_is_public` (already wrapper → `postgres/public-paths.ts`)
- [x] `filter_public_paths` (already wrapper → `postgres/public-paths.ts`)

**Statistics & Analytics (4 methods):**

- [x] `get_stats_interval` → `postgres/statistics.ts`
- [x] `get_stats` (already wrapper → `postgres/stats.ts`)
- [x] `get_active_student_stats` → `postgres/statistics.ts`
- [x] `calc_stats` (already wrapper → `postgres/stats.ts` - needs verification)

**Hub Management (2 methods):**

- [x] `register_hub` → `postgres/hub/management.ts`
- [x] `get_hub_servers` → `postgres/hub/management.ts`

**Site Licenses (8 methods already wrapped):**

- [x] `site_license_usage_stats` (already wrapper → `postgres/site-license/analytics.ts`)
- [x] `projects_using_site_license` (already wrapper → `postgres/site-license/analytics.ts`)
- [x] `number_of_projects_using_site_license` (already wrapper → `postgres/site-license/analytics.ts`)
- [x] `site_license_public_info` (already wrapper → `postgres/site-license/public.ts`)
- [x] `site_license_manager_set` (already wrapper → `postgres/site-license/manager.ts`)
- [x] `update_site_license_usage_log` (already wrapper → `postgres/site-license/usage-log.ts`)
- [x] `matching_site_licenses` (already wrapper → `postgres/site-license/search.ts`)
- [x] `manager_site_licenses` (already wrapper → `postgres/site-license/search.ts`)

**Stripe/Payment (2 methods):**

- [x] `is_paying_customer` (already wrapper → `postgres/account-queries.ts`)
- [ ] (Stripe methods handled elsewhere)

**Other (3 methods):**

- [ ] `insert_random_compute_images`
- [ ] `delete_syncstring`
- [x] `registrationTokens` (already wrapper → `postgres/registration-tokens.ts`)
- [x] `updateUnreadMessageCount` (already wrapper → `postgres/messages.ts`)

**Progress Summary:**

- **Total methods**: 130
- **Already wrappers (TypeScript)**: 35 ✅
- **Migrated in this session**: 61 ✅
  - Batch 1: `get_log`, `get_user_log`, `uncaught_exception`
  - Batch 2: `log_client_error`, `webapp_error`, `get_client_error_log`
  - Batch 3: `set_server_setting`, `get_server_setting`, `get_server_settings_cached`, `get_site_settings`, `server_settings_synctable`, `reset_server_settings_cache`
  - Batch 4: `log_file_access`, `get_file_access`, `record_file_use`, `get_file_use`
  - Batch 5: `register_hub`, `get_hub_servers`
  - Batch 6: `get_stats_interval`, `get_active_student_stats`
  - Batch 7: `is_admin`, `user_is_in_group`, `account_exists`
  - Batch 8: `_account_where`, `get_account`, `is_banned_user`
  - Batch 9: `make_user_admin`, `count_accounts_created_by`, `_touch_account`
  - Batch 10: `_touch_project`, `touch_project`, `touch`
  - Batch 11: `change_password`, `reset_password`, `set_password_reset`, `get_password_reset`, `delete_password_reset`, `record_password_reset_attempt`, `count_password_reset_attempts`
  - Batch 12: `get_coupon_history`, `update_coupon_history`, `account_ids_to_usernames`
  - Batch 13: `set_project_storage_request`, `get_project_storage_request`, `set_project_state`, `get_project_state`
  - Batch 14: `set_project_host`, `unset_project_host`, `get_project_host`
  - Batch 15: `set_project_storage`, `get_project_storage`, `update_project_storage_save`
  - Batch 16: `get_project_settings`, `set_project_settings`, `get_project_extra_env`, `recent_projects`
  - Batch 17: `_validate_opts`, `add_user_to_project`, `set_project_status`, `remove_collaborator_from_project`, `remove_user_from_project`
  - Batch 18: `verify_email_create_token`, `verify_email_check_token`, `verify_email_get`, `is_verified_email`
  - Batch 19: `account_creation_actions`, `account_creation_actions_success`, `do_account_creation_actions`
  - Batch 20: `when_sent_project_invite`, `sent_project_invite`
  - Batch 21: `delete_account`, `mark_account_deleted`
  - Found already migrated: `get_public_paths`, `has_public_path`, `path_is_public`, `filter_public_paths`
  - Reorganized files into subdirectories: `postgres/account/` and `postgres/project/`
- **Remaining to migrate**: 23
- **Current completion**: 82% (107/130)

**Recent Migration Notes:**

- _Dec 2024_:
  - Migrated 6 logging/error methods to `postgres/log-query.ts` with comprehensive tests (14 tests, all passing)
  - Migrated 6 server settings methods to `postgres/server-settings.ts` with comprehensive tests (9 tests, all passing)
  - Migrated 4 file access methods to `postgres/file-access.ts` with comprehensive tests (16 tests, all passing)
  - Migrated 2 hub management methods to `postgres/hub/management.ts` with comprehensive tests (10 tests, all passing)
  - Migrated 2 statistics methods to `postgres/statistics.ts` with comprehensive tests (12 tests, all passing)
  - Migrated 3 account basic methods to `postgres/account-basic.ts` with comprehensive tests (15 tests, all passing)
  - Migrated 3 account core methods to `postgres/account-core.ts` with comprehensive tests (14 tests, all passing)
  - Migrated 3 account management methods to `postgres/account-management.ts` with comprehensive tests (10 tests passing, 1 skipped due to throttle state)
  - Migrated 3 activity tracking methods to `postgres/activity.ts` with comprehensive tests (10 tests, all passing)
  - Migrated 3 account creation methods to `postgres/account/creation.ts` with comprehensive tests (11 tests, all passing)
  - **Type System Improvements**: Added `_throttle`, `_close_test_query`, `clear_cache`, `get_hub_servers`, `get_stats_interval`, `get_active_student_stats`, `is_admin`, `user_is_in_group`, `account_exists`, `get_account`, `is_banned_user`, `_account_where`, `_touch_account`, `_touch_project`, and `touch_project` method signatures to `PostgreSQL` interface in `postgres/types.ts`
  - **CRITICAL WORKFLOW**: Always write tests FIRST and verify they pass with the CoffeeScript implementation. A local `USE_TYPESCRIPT` toggle in the test file is allowed temporarily during the batch, but must be removed once wrappers are in place.
  - **CODE QUALITY NOTE**: During conversion and later on, replace all `await callback2(db._query.bind(db)` with the shorter and more readable `await db.async_query`. The `async_query` method is the preferred TypeScript-native approach.

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

1. **Immediate**: Begin `postgres-server-queries.coffee` method-by-method migration
   - Identify first method to migrate (simple wrapper or isolated method)
   - Follow per-method workflow:
     1. Write test in `postgres/[name].test.ts`
     2. Verify test passes with CoffeeScript
     3. Implement in `postgres/[name].ts`
     4. Replace CoffeeScript with wrapper
     5. Verify test still passes
   - Document each migrated method in this file
   - Track progress: X of ~128 methods migrated

2. **Ongoing**: Continue incremental migration
   - Migrate methods one at a time or in small related groups
   - Prioritize: simple wrappers → isolated methods → complex methods
   - Update wrapper count and progress metrics regularly
   - Can pause/resume at any point without breaking functionality

3. **Medium-term**: Complete `postgres-server-queries.coffee` migration
   - When all ~128 methods have wrappers, convert remaining scaffolding:
     - Create `postgres/server-queries/methods.ts` with extension pattern
     - Import all individual method modules
     - Create `postgres/server-queries/index.ts`
   - Update `database/index.ts` to use TypeScript module
   - Delete `postgres-server-queries.coffee` and compiled output
   - Verify all 374+ tests still pass

4. **Long-term**: Plan `postgres-base.coffee` migration
   - Write extensive integration tests for core functionality
   - Use same incremental method-by-method approach
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
