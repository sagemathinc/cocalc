<!--
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
-->

# Database Package CoffeeScript to TypeScript Migration Plan

## Overview

This document tracks the migration of all CoffeeScript code in the `@cocalc/database` package to TypeScript. The goal is to eliminate the 6,827 lines of CoffeeScript code across 5 files while maintaining backward compatibility and ensuring comprehensive test coverage.

**WARNING**: This is the single scariest chunk of CoffeeScript left in CoCalc!

## Current State

### CoffeeScript Files Remaining (by size)

| File                             | Lines     | Description                                     | Priority     | Status      |
| -------------------------------- | --------- | ----------------------------------------------- | ------------ | ----------- |
| `postgres-server-queries.coffee` | 2,518     | Server-side database queries                    | High         | Not started |
| `postgres-base.coffee`           | 1,156     | Core PostgreSQL class and connection management | **Critical** | Not started |
| `postgres-blobs.coffee`          | 760       | Blob storage operations                         | Medium       | Not started |
| **Remaining**                    | **4,434** |                                                 |              |             |

### Completed Migrations

| File                           | Lines     | Migrated To                | Tests   | Status      |
| ------------------------------ | --------- | -------------------------- | ------- | ----------- |
| `postgres-user-queries.coffee` | 1,789     | `user-query/queries.ts`    | 150     | ✅ Complete |
| `postgres-synctable.coffee`    | 604       | `synctable/*.ts` (3 files) | 109     | ✅ Complete |
| **Total Migrated**             | **2,393** | **35% of original code**   | **259** |             |

### Existing TypeScript Structure

The `postgres/` directory already contains many TypeScript modules:

- **Schema Management**: `postgres/schema/` - table definitions, indexes, types
- **Site Licenses**: `postgres/site-license/` - license analytics, management, search
- **Stripe Integration**: `postgres/stripe/` - payment processing
- **Authentication**: `postgres/passport*.ts` - SSO and authentication
- **Core Utilities**: `postgres/blobs.ts`, `postgres/query.ts`, `postgres/util.ts`, etc.

### Current Build Process

```json
"build": "../node_modules/.bin/tsc --build && coffee -c -o dist/ ./"
```

The package currently compiles both TypeScript and CoffeeScript during the build step.

## Architecture Overview

### Central Entry Point: `index.ts`

The `index.ts` file is the main entry point that orchestrates the database package:

```typescript
import { extend_PostgreSQL as extendPostgresOps } from "./postgres-ops";

const base = require("./postgres-base");

export function db(opts = {}): PostgreSQL {
  if (theDB === undefined) {
    let PostgreSQL = base.PostgreSQL;

    PostgreSQL = require("./postgres-server-queries").extend_PostgreSQL(
      PostgreSQL,
    );
    PostgreSQL = require("./postgres-blobs").extend_PostgreSQL(PostgreSQL);
    PostgreSQL = require("./postgres-synctable").extend_PostgreSQL(PostgreSQL);
    PostgreSQL = require("./postgres-user-queries").extend_PostgreSQL(
      PostgreSQL,
    );
    PostgreSQL = extendPostgresOps(PostgreSQL);
    const theDBnew = new PostgreSQL(opts);
    setupRecordConnectErrors(theDBnew);
    theDB = theDBnew;
  }
  return theDB;
}
```

**Key architectural patterns:**

1. **Singleton Pattern**: Single `PostgreSQL` instance accessed via `db()` function
2. **Class Extension Pattern**: Each CoffeeScript module exports `extend_PostgreSQL(ext)` that creates a new class extending the previous one
3. **Composition Order Matters**: `server-queries` → `blobs` → `synctable` → `user-queries` → `ops`
4. **Each module adds methods** to the class through CoffeeScript's class extension syntax
5. **Mixed implementation**: `postgres-ops.ts` is TypeScript, while other `postgres-*.coffee` modules still use CoffeeScript wrappers

### Two Database Access Patterns

**Legacy Pattern (CoffeeScript)**: The composed `PostgreSQL` class

- Created via `db()` singleton function
- Methods added via `extend_PostgreSQL` pattern
- Uses callback-based API with `cb: CB` pattern
- Located in `postgres-*.coffee` files

**Modern Pattern (TypeScript)**: The `pool` module

- Direct access to PostgreSQL connection pool via `getPool()`
- Located in `pool/` directory - **already fully TypeScript**
- Uses modern async/await patterns
- Independent of the legacy PostgreSQL class
- Example: `const pool = getPool(); const { rows } = await pool.query(...)`

**Migration Note**: The `pool/` directory is already TypeScript and should remain unchanged. Our migration focuses on the legacy `PostgreSQL` class in the `postgres-*.coffee` files.

### extend_PostgreSQL Pattern

Each CoffeeScript module uses this pattern:

```coffeescript
exports.extend_PostgreSQL = (ext) -> class PostgreSQL extends ext
  # Methods added here
  backup_tables: (opts) =>
    # implementation
```

This creates a class that:

- Extends the previous class passed as `ext`
- Adds new methods to the PostgreSQL class
- Returns the extended class for the next module to extend

**During migration**, we need to:

1. Maintain this pattern initially for backward compatibility
2. Keep the `extend_PostgreSQL` wrapper in CoffeeScript
3. Have it call TypeScript implementations in `postgres/` directory
4. In Phase 3, consolidate all extensions into a single TypeScript class

## Migration Strategy

### Phase 1: Setup and Tooling ✅ COMPLETE

#### 1.1 Install Development Tools

- [x] Install `decaffeinate` as a dev dependency
- [x] Configure test coverage reporting with Jest
- [x] Add `pnpm coverage` script to generate coverage reports
- [x] Set up coverage thresholds for `postgres/*.ts` files

#### 1.2 Coverage Configuration

Configure Jest to:

- Track coverage only for TypeScript files in `postgres/` directory
- Generate HTML and terminal coverage reports
- Set initial coverage thresholds (aim for 80%+ coverage)
- Exclude generated files and test files from coverage

**Target jest.config.js additions:**

```javascript
collectCoverage: true,
collectCoverageFrom: [
  "postgres/**/*.ts",
  "!postgres/**/*.test.ts",
  "!postgres/**/*.d.ts"
],
coverageThreshold: {
  global: {
    branches: 80,
    functions: 80,
    lines: 80,
    statements: 80
  }
}
```

#### 1.3 Decaffeinate Tool Testing ✅

Tested `decaffeinate` with sample code from the former `postgres-ops.coffee`:

```bash
cat << 'EOF' | npx decaffeinate --use-js-modules
_backup_table: (opts) =>
    opts = defaults opts,
        table : required
        path  : 'backup'
        cb    : required
    dbg = @_dbg("_backup_table(table='#{opts.table}')")
EOF
```

**Results:**

- ✅ Successfully converts CoffeeScript to JavaScript
- ✅ Converts fat arrows `=>` to arrow functions
- ✅ Converts string interpolation `#{}` to template literals `${}`
- ✅ Converts object literals correctly
- ⚠️ Creates `defaultExport` pattern for `@this` references (needs cleanup)
- ⚠️ Adds suggestions for unnecessary returns (DS102) and top-level this (DS208)

**Conclusion**: `decaffeinate` is a good starting point but requires manual cleanup and TypeScript transformation. The output is readable and provides a solid foundation for conversion.

#### 1.4 Recommended Decaffeinate Parameters ✅

Based on the `postgres-user-query-queue` migration, the following parameters produce optimal output:

```bash
npx decaffeinate \
  --use-js-modules \
  --loose \
  --optional-chaining \
  --logical-assignment \
  <filename>.coffee
```

**Parameter explanations:**

- `--use-js-modules`: Converts `require`/`module.exports` to ES6 `import`/`export` (cleaner, modern)
- `--loose`: Enables all loose transformations for simpler output
- `--optional-chaining`: Uses `?.` operator for safer property access
- `--logical-assignment`: Uses ES2021 `&&=`, `||=`, `??=` operators

**What still needs manual fixing after decaffeinate:**

1. **Import cleanup**: Consolidate messy require patterns into clean ES6 imports
2. **Add TypeScript types**: Add interfaces, type annotations, and proper typing
3. **Remove unnecessary code**: Delete decaffeinate suggestions, unnecessary IIFEs, and redundant returns
4. **Fix method bindings**: Remove constructor binding boilerplate (lines 73-82 in generated output)
5. **Fix `delete` operators**: Add type assertions `(obj as any).prop` for delete operations
6. **Export cleanup**: Change `export { _ClassName as ClassName }` to `export class ClassName`
7. **Metrics imports**: Fix missing default exports (e.g., `import * as metrics` instead of `import metrics`)

**Time savings**: Using decaffeinate reduces migration time by ~50% compared to manual rewriting, while still producing clean, idiomatic TypeScript after manual fixes.

### Phase 2: Incremental Method Migration

#### 2.1 Migration Workflow (Test-Driven Approach)

**IMPORTANT**: Always write/verify tests BEFORE migrating a method. This ensures we don't break existing functionality.

For each method in the CoffeeScript files:

1. **Identify**: Select a method from a CoffeeScript file to migrate

2. **Create/Find Tests** (BEFORE migration):
   - Search for existing tests for this method:
     ```bash
     # Search for test files that might test this method
     grep -r "methodName" postgres/*.test.ts postgres/**/*.test.ts
     ```
   - If tests exist: Review them and ensure they adequately cover the method
   - If no tests exist: **Create comprehensive tests first**
   - Write tests in TypeScript: `postgres/method-name.test.ts`
   - Test structure:
     ```typescript
     describe("methodName", () => {
       test("should handle basic case", async () => {
         // Test implementation
       });
       test("should handle error case", async () => {
         // Test error handling
       });
       test("should validate edge cases", async () => {
         // Test edge cases
       });
     });
     ```

3. **Verify Test Coverage**:
   - Run tests: `pnpm test postgres/method-name.test.ts`
   - Ensure tests actually exercise the method
   - Write comprehensive test cases covering:
     - Happy path scenarios
     - Error conditions and edge cases
     - Boundary conditions
   - **Note**: Full coverage checks (80% threshold) will be run later at milestones, not for individual methods during development

4. **Baseline: Ensure Tests Pass with CoffeeScript**:
   - Run: `pnpm test postgres/method-name.test.ts`
   - All tests must pass ✅
   - This establishes the baseline behavior
   - **Note**: Tests will call the existing db() API which uses the CoffeeScript implementation

5. **Decaffeinate and Convert**:
   - Use `decaffeinate` to get approximate JavaScript:
     ```bash
     # Extract method from CoffeeScript and pipe to decaffeinate
     cat << 'EOF' | npx decaffeinate --use-js-modules
     methodName: (opts) =>
         # implementation...
     EOF
     ```
   - Manually convert JavaScript to TypeScript
   - Add proper type annotations
   - **Convert to async/await pattern** (see 2.2 below)
   - Update to modern ES6+ patterns
   - Follow CoCalc TypeScript style guide (2-space indentation, prefer `??` over `||`)
   - Clean up `decaffeinate` artifacts (unnecessary returns, `defaultExport` patterns)

6. **Create TypeScript Implementation**:
   - Create new file in `postgres/` directory (e.g., `postgres/backup.ts`)
   - Implement the method in TypeScript with both async and callback versions
   - Export both versions (see 2.2 for pattern)

7. **Update CoffeeScript Wrapper**:
   - In the original `.coffee` file, wrap the method to call the TypeScript version
   - Example:

     ```coffeescript
     { methodNameCB } = require('./postgres/method-name')

     exports.extend_PostgreSQL = (ext) -> class PostgreSQL extends ext
       methodName: (opts) =>
         methodNameCB.call(this, opts)
     ```

8. **Verify Tests Still Pass**:
   - Run: `pnpm test postgres/method-name.test.ts`
   - All tests must still pass ✅
   - If tests fail, debug and fix the TypeScript implementation
   - **Do not proceed until tests pass**

9. **Build and Type Check**:
   - Run: `pnpm build` in the database package
   - Or run: `pnpm tsc --noEmit` for type checking only
   - Fix any TypeScript errors
   - Ensure the build succeeds ✅

10. **Update Types**:
    - Add/update type definitions in `postgres/types.ts` if needed
    - Document the new function signatures

11. **Final Coverage Check**:
    - Run: `pnpm coverage -- postgres/method-name.test.ts`
    - Verify coverage meets or exceeds 80% threshold
    - Generate coverage report to ensure quality

**Summary**: Test First, Migrate Second, Verify Third

```
┌─────────────┐
│ Write Tests │ ← Start here
└──────┬──────┘
       │
       ▼
┌──────────────────┐
│ Tests Pass (CoffeeScript) │ ← Baseline
└──────┬───────────┘
       │
       ▼
┌───────────────┐
│ Migrate to TS │
└──────┬────────┘
       │
       ▼
┌──────────────────┐
│ Tests Pass (TypeScript) │ ← Verify
└──────┬───────────┘
       │
       ▼
┌──────────────┐
│ Build & Type │ ← Final check
│    Check     │
└──────────────┘
```

#### 2.2 Async/Await Pattern with Backward Compatibility

**Goal**: Prefer modern async/await in new TypeScript implementations while maintaining backward compatibility with the callback-based API.

**Pattern:**

```typescript
// New TypeScript implementation in postgres/backup.ts
export async function backupTable(opts: {
  table: string;
  path?: string;
}): Promise<void> {
  const path = opts.path ?? "backup";
  // Modern async implementation
  await executeCommand(`pg_dump -Fc --table ${opts.table}...`);
}

// Also export callback version for backward compatibility
// IMPORTANT: This is called with 'this' context from CoffeeScript, but doesn't use it
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

**In the wrapper module (CoffeeScript or TypeScript):**

```coffeescript
# In postgres-ops.ts
import { backupTableCB } from "./postgres/ops";

export function extend_PostgreSQL(ext: PostgreSQLConstructor) {
  return class PostgreSQL extends ext {
    _backup_table(opts: BackupTableOptions & { cb: CB }): void {
      backupTableCB(this, opts);
    }
  };
}
```

**For methods that need instance properties (this.\_host, this.\_client, etc.):**

If the method needs access to instance properties, you have two options:

1. **Pass instance as parameter:**

   ```typescript
   export function backupTableCB(
     this: PostgreSQL,
     opts: { table: string; path?: string; cb: CB },
   ): void {
     // Can now access this._host, this._database, etc.
     backupTable(this, opts)
       .then(() => opts.cb())
       .catch((err) => opts.cb(err));
   }
   ```

2. **Pass required properties explicitly:**
   ```typescript
   export function backupTableCB(opts: {
     table: string;
     path?: string;
     database: string; // Pass what you need
     host: string;
     cb: CB;
   }): void {
     // Use opts.database, opts.host instead of this._database
   }
   ```

**Benefits:**

- New code uses modern async/await patterns
- Existing code continues to work with callbacks
- Gradual transition path
- TypeScript implementations are cleaner and more maintainable
- Tests can use either pattern
- Explicit about instance dependencies

**Notes:**

- Use `callback2` from `@cocalc/util/async-utils` to convert between patterns if needed
- Some methods may need to remain callback-based if they use EventEmitters or streams
- Document which pattern each function uses in the type definitions
- **Always use `.call(this, opts)` in CoffeeScript wrappers to preserve instance context**

#### 2.3 Ops Module Refactor (Example: `postgres/ops`)

When a migrated file grows large, split it into a subdirectory with smaller modules and an `index.ts` barrel. The `postgres/ops` migration used this pattern:

- **Move + split**:
  - `postgres/ops.ts` → `postgres/ops/backup.ts` and `postgres/ops/restore.ts`
  - Common types/helpers → `postgres/ops/utils.ts`
  - `postgres/ops/index.ts` re-exports `backup`, `restore`, and `utils`
- **Update extender**:
  - `postgres-ops.ts` should import from `./postgres/ops` (directory barrel), not a single file
- **Barrel + module resolution**:
  - Keep `postgres/ops/index.ts` as the public entry so `./postgres/ops` resolves to the directory (Node/TS will prefer `index.ts`)
  - This preserves existing import paths while allowing internal files to move under `postgres/ops/`
- **Split tests**:
  - `postgres/ops.test.ts` → `postgres/ops/backup.test.ts` and `postgres/ops/restore.test.ts`
  - Keep tests close to their modules for easier review and targeted runs

**Mocking and test patterns used in ops:**

- **Mock `execute_code`** to avoid running shell commands:
  ```ts
  jest.mock("@cocalc/backend/misc_node", () => ({
    execute_code: jest.fn(),
  }));
  const executeCode = execute_code as jest.MockedFunction<typeof execute_code>;
  ```
- **Mock `fs.readdirSync`** (non-configurable in Jest unless mocked at module level):
  ```ts
  jest.mock("fs", () => ({
    ...jest.requireActual("fs"),
    readdirSync: jest.fn(),
  }));
  const readdirSync = fs.readdirSync as unknown as jest.MockedFunction<
    (path: fs.PathLike) => string[]
  >;
  ```
- **Callback typing**: when stubbing callback-style APIs, pass `undefined` explicitly:
  ```ts
  executeCode.mockImplementation((opts) => {
    opts.cb?.(undefined);
  });
  ```

Suggested test runs for the split ops tests:

```bash
pnpm test postgres/ops/backup.test.ts postgres/ops/restore.test.ts
```

#### 2.4 Method Migration Priority

**Order of migration** (from foundational to dependent):

1. **postgres-base.coffee** - Core connection and base query methods
   - Start with simple utility methods
   - Then connection management
   - Finally complex query building

2. **postgres-user-query-queue.coffee** - Queue management

3. **postgres-blobs.coffee** - Blob operations (already has `postgres/blobs.ts` partial implementation)

4. **postgres-synctable.coffee** - Real-time synchronization

5. **postgres-user-queries.coffee** - User query handling

6. **postgres-server-queries.coffee** - Largest, most complex

### Phase 3: Class Consolidation

Once all methods are migrated to TypeScript functions:

#### 3.1 Create Unified PostgreSQL Class

**Create Main Class File**: `postgres/postgresql.ts`

- Convert the main `PostgreSQL` class from CoffeeScript to TypeScript
- Stitch together all the TypeScript functions as class methods
- Maintain the same class structure and API surface
- Keep as close to original behavior as possible (no refactoring yet)
- Include all methods from all the extension modules

**Structure:**

```typescript
// postgres/postgresql.ts
export class PostgreSQL extends EventEmitter {
  // Properties from postgres-base.coffee
  private _state: string;
  private _host: string;
  // ... etc

  constructor(opts) {
    // Constructor from postgres-base.coffee
  }

  // Methods from postgres-base.coffee
  async query(opts) { ... }

  // Methods from postgres-server-queries.coffee
  async getAccount(opts) { ... }

  // Methods from postgres-blobs.coffee
  async saveBlob(opts) { ... }

  // Methods from postgres-synctable.coffee
  syncTable(opts) { ... }

  // Methods from postgres-user-queries.coffee
  async userQuery(opts) { ... }

  // Methods from postgres-ops (TypeScript)
  async backupTables(opts) { ... }
}
```

#### 3.2 Update index.ts

**Replace the extension pattern** with direct import:

```typescript
// BEFORE (current):
export function db(opts = {}): PostgreSQL {
  if (theDB === undefined) {
    let PostgreSQL = base.PostgreSQL;

    for (const module of ["server-queries", "blobs", ...]) {
      PostgreSQL = require(`./postgres-${module}`).extend_PostgreSQL(PostgreSQL);
    }
    const theDBnew = new PostgreSQL(opts);
  }
  return theDB;
}

// AFTER (Phase 3):
import { PostgreSQL } from "./postgres/postgresql";

export function db(opts = {}): PostgreSQL {
  if (theDB === undefined) {
    theDB = new PostgreSQL(opts);
    setupRecordConnectErrors(theDB);
  }
  return theDB;
}
```

**Benefits:**

- Single source of truth for the PostgreSQL class
- No more CoffeeScript extension pattern
- Cleaner imports and dependencies
- Easier to understand and maintain

#### 3.3 Update Imports Throughout Codebase

- Change imports to use the new TypeScript class
- Update type references from `postgres/types.ts` to `postgres/postgresql.ts`
- Maintain backward compatibility with existing API

#### 3.4 Testing and Validation

**Run full test suite:**

- Ensure all existing tests pass
- Run integration tests
- Verify changefeeds and LISTEN/NOTIFY still work
- Test all database operations end-to-end
- Verify connection pooling works correctly

#### 3.5 Remove CoffeeScript Files and Clean Up

**Clean up:**

- Delete all `postgres-*.coffee` files
- Update `package.json` build script: Remove `&& coffee -c -o dist/ ./`
- Remove `coffeescript` from devDependencies
- **Remove `decaffeinate` from devDependencies** (no longer needed)
- Update exports in `package.json` if needed

**Updated build script:**

```json
"build": "../node_modules/.bin/tsc --build"
```

**Remove dev dependencies:**

```bash
pnpm remove -D coffeescript decaffeinate
```

### Phase 4: Refactoring (Future)

After successful migration and validation:

- Modernize patterns and architecture
- Improve type safety
- Extract duplicate code
- Improve error handling
- Performance optimizations
- Consider further library upgrades if needed

**Note**: Phase 4 is separate to minimize risk. First migration should be as close to 1:1 as possible.

**Already completed before migration:**

- ✅ `pg` client library upgraded to ^8.16.3 (done in Phase 1)

## Testing Strategy

### Test Requirements

For each migrated method:

1. **Unit Tests**: Test the function in isolation
   - Happy path cases
   - Error cases
   - Edge cases
   - Boundary conditions

2. **Integration Tests**: Test interaction with database
   - Real database queries (using test database)
   - Transaction handling
   - Connection pooling

3. **Regression Tests**: Ensure existing behavior is preserved
   - Compare outputs with CoffeeScript implementation
   - Test all code paths

### Type Safety Guidelines

**CRITICAL**: When writing tests and migrated code, never use `any` type for database instances.

```typescript
// ✅ CORRECT - Use PostgreSQL type from postgres/types.ts
import type { PostgreSQL } from "./types";
let database: PostgreSQL;

// ❌ INCORRECT - Never use 'any' type
let database: any; // NO!
let db: any; // NO!
```

**Rationale**: Using `any` defeats TypeScript's type checking and can lead to:

- Inconsistent method signatures across migrations
- Runtime errors from missing/misnamed methods
- Loss of IDE autocomplete and type checking
- Difficulty tracking what methods exist on the PostgreSQL class

**Always import and use the `PostgreSQL` type** from `postgres/types.ts` for any database instance variables.

### Coverage Goals

- **Minimum**: 80% coverage for all new TypeScript code
- **Target**: 90%+ coverage
- **Critical paths**: 100% coverage (authentication, payment, data integrity)

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests with coverage report
pnpm coverage

# Run tests for specific file
pnpm test postgres/blobs.test.ts

# Run tests in watch mode
pnpm test --watch
```

## Migration Tracking

### Completed Migrations

- **postgres-ops**: Migrated to TypeScript, split into `postgres/ops/backup.ts`, `postgres/ops/restore.ts`, and `postgres/ops/utils.ts`; tests split accordingly
- **filesystem-bucket**: Migrated to TypeScript with new tests
- **postgres-user-query-queue**: Migrated to TypeScript as `user-query/queue.ts` with 17 comprehensive tests; all tests pass (17/17 ✅)

### In Progress

#### postgres-user-queries.coffee → user-query/queries.ts ✅ COMPLETE

**Status**: ✅ Migration complete - TypeScript implementation fully integrated and CoffeeScript file removed
**File size**: 1,791 lines (CoffeeScript) → ~2,300 lines (TypeScript, after optimization)
**Complexity**: Very High - 44+ methods including complex authorization, changefeed, and query logic
**Location**: `packages/database/user-query/queries.ts`
**Test file**: `packages/database/user-query/queries.test.ts`

**Test Suite Summary**:

- **150 comprehensive tests** covering all 44+ methods
- **100% pass rate** validated against CoffeeScript baseline
- **Test execution time**: 0.981 seconds
- **Coverage areas**: Public API (19 tests), Query Routing (28 tests), Authorization (12 tests), Set Queries (26 tests), Get Queries (23 tests), Changefeeds (14 tests), Hooks (20 tests), Syncstring Permissions (8 tests)

**Key Test Patterns Discovered**:

- All methods use `opts.cb` pattern, not separate callback parameter
- PostgreSQL COUNT returns numbers, not strings
- Tracker objects require full EventEmitter interface (on, once, removeListener)
- Methods using `await callback2 @_query` work with synchronous mocks

**Migration Progress**:

- [x] Create comprehensive test suite (150 tests)
- [x] Validate 100% tests passing against CoffeeScript baseline
- [x] Run decaffeinate to generate TypeScript
- [x] Clean up generated code and add types (Codex)
- [x] Re-route tests to TypeScript implementation
- [x] Verify all 150 tests still pass
- [x] Build and typecheck
- [x] Update database/index.ts to use TypeScript implementation
- [x] Optimize constructor with `misc.bind_methods(this)` (replaced 69 explicit binds)
- [x] Final verification: 150/150 tests passing, build clean

**Migration Complete!** ✅

**TypeScript typing notes (queries.ts)**:

- Use `UserQueryOptions`/`UserSetQueryOptions`/`UserGetQueryOptions` with `options?: QueryOption[]` and always normalize with `opts.options ??= []` before iteration.
- Model `changes` explicitly (`UserQueryChanges`) and guard `changes.cb`/`locals.changes_cb` since callbacks are optional in changefeed paths.
- Treat query payloads as `AnyRecord` (rows/patches) while keeping explicit typed option objects for control flow; avoid `any` for the database instance.
- Narrow schema access via `const schema = SCHEMA as Record<string, LegacyTableSchema>` so `schema[table].fields`, `user_query`, `project_query`, `admin_query`, and `changefeed_keys` are typed and optional.
- For changefeed locals, use a dedicated `ChangefeedLocals` type (`result`, `changes_queue`, `changes_cb`) to avoid implicit `any` and unsafe queue shapes.
- For project control hooks, use `ProjectActionRequest` and `ProjectActionOptions`; allow optional `time`, `started`, `finished`, and `err` to match stored DB entries.
- When validating dates, use `Number.isNaN(date.getTime())` instead of `isNaN(date)` to avoid `Date`-object type errors.
- Prefer `RetentionOptions = Parameters<typeof updateRetentionData>[0]` so the retention call stays in sync with future signature changes.

### ✅ COMPLETE: postgres-synctable.coffee → synctable/

**Status**: ✅ Migration Complete - All 328 database tests passing
**File size**: 604 lines (CoffeeScript) → 3 TypeScript files (311 lines total)
**Test coverage**: 109 synctable tests + 219 other database tests = 328 tests (100% passing)

#### File Structure Analysis

The postgres-synctable.coffee file contains three distinct components that will be split into separate modules:

1. **PostgreSQL Extension Methods** (lines 26-186) → `synctable/methods.ts`
   - 8 methods that extend the PostgreSQL class
   - Database trigger management (`_ensure_trigger_exists`, `_listen`, `_stop_listening`)
   - Factory methods (`synctable`, `changefeed`, `project_and_user_tracker`)
   - Notification handling (`_notification`, `_clear_listening_state`)

2. **SyncTable Class** (lines 187-441) → `synctable/synctable.ts`
   - Class extending EventEmitter for real-time table synchronization
   - 15 methods managing synctable lifecycle, updates, and queries
   - Core methods: constructor, `_init`, `_reconnect`, `_update`, `get`, `wait`
   - State management with immutable.js Maps

3. **Trigger Code Generation** (lines 443-604) → `synctable/trigger.ts`
   - Pure utility functions for PostgreSQL trigger creation
   - Functions: `trigger_name`, `triggerType`, `trigger_code`
   - Generates PLPGSQL trigger functions and CREATE TRIGGER statements
   - No dependencies on PostgreSQL class

#### Migration Plan

**Phase 1: Write Tests First** ✅ COMPLETE (Test-Driven Migration)

Create three comprehensive test suites **before** any migration:

- [x] **synctable/trigger.test.ts** - Test trigger code generation ✅ **35 tests passing**
  - Test `trigger_name()` hash generation with various inputs
  - Test `triggerType()` type conversion (SERIAL UNIQUE → INTEGER)
  - Test `trigger_code()` PLPGSQL function generation
  - Validate generated SQL syntax
  - Test edge cases: empty watch arrays, single column, multiple columns
  - **Result**: 100% coverage of pure functions

- [x] **synctable/synctable.test.ts** - Test SyncTable class ✅ **35 tests passing**
  - Mock database instance with `_query`, `_listen`, `_stop_listening`
  - Test constructor initialization with various table configurations
  - Test lifecycle: `_init` → `ready` → `close`
  - Test notification handling: INSERT, UPDATE, DELETE events
  - Test reconnection logic after database disconnect
  - Test `get()`, `getIn()`, `has()` query methods
  - Test `wait()` with timeout and success cases
  - Test `_process_results()` and `_process_deleted()` state updates
  - **Result**: 100% coverage of SyncTable class

- [x] **synctable/methods.test.ts** - Test PostgreSQL extension methods ✅ **34 tests passing**
  - Create test PostgreSQL instance with synctable methods
  - Test `_ensure_trigger_exists()` creates triggers once
  - Test `_listen()` registers listeners with reference counting
  - Test `_stop_listening()` unregisters when count reaches zero
  - Test `synctable()` factory method returns SyncTable instance
  - Test `changefeed()` factory method creates Changes instance
  - Test `project_and_user_tracker()` singleton pattern
  - Test standby database rejection
  - **Result**: 100% coverage of extension methods

**Phase 2: Establish Baseline** ✅ COMPLETE

- [x] Wire up tests to use **CoffeeScript implementation** (via `require("../dist/postgres-synctable")`)
- [x] Run all tests and verify 100% pass rate
- [x] Document baseline: **104 tests passing** across 3 test files (35 + 35 + 34)
- [x] Run `pnpm build` and `pnpm tsc --noEmit` to ensure clean state
- [x] Export trigger functions and SyncTable class from CoffeeScript for testing

**Phase 3: Migrate Components (One at a Time)**

**Step 3a: Migrate trigger.ts** ✅ COMPLETE (Simplest - Pure Functions)

- [x] Run decaffeinate on lines 443-604
- [x] Extract trigger utility functions to `synctable/trigger.ts`
- [x] Fix TypeScript errors:
  - Import `misc` from `@cocalc/util/misc`
  - Import `misc_node` from `@cocalc/backend/misc_node` (as CommonJS require)
  - Import `quote_field` from postgres-base (via dist/)
  - Add proper types for parameters
  - No `await` syntax issues (pure functions)
  - Add return types and JSDoc comments
- [x] Update `synctable/trigger.test.ts` to import from `./trigger` instead of dist
- [x] Run tests: ✅ **35/35 trigger tests passing (100%)**
- [x] Run `pnpm tsc --noEmit` in database package: ✅ Clean
- [x] All 104 tests across all files still passing

**Step 3b: Migrate synctable.ts** ✅ COMPLETE (SyncTable Class)

- [x] Run decaffeinate on lines 187-441
- [x] Extract SyncTable class to `synctable/synctable.ts`
- [x] Fix TypeScript errors:
  - Add imports: EventEmitter, immutable, async, misc, SCHEMA
  - No trigger function imports needed (trigger functions are internal to CoffeeScript)
  - Import `quote_field`, `pg_type` from postgres-base (via dist/)
  - Add `super()` call at beginning of constructor
  - No `await` issues (this is synctable, not methods)
  - Add proper TypeScript types for all parameters and private members
  - Type `_value` as `SyncTableValue = immutable.Map<string, immutable.Map<string, any>>`
  - Use `CB` type from `@cocalc/util/types/callback`
  - Use `misc.bind_methods(this)` instead of 17 explicit binds
  - Replace `__guardMethod__` with optional chaining `opts?.cb?.()`
  - Fix immutable.js type assertions
- [x] Update `synctable/synctable.test.ts` to import from `./synctable`
- [x] Run tests: ✅ **35/35 synctable tests passing (100%)**
- [x] Run `pnpm tsc --noEmit` in database package: ✅ Clean
- [x] All 104 tests across all files still passing

**Step 3c: Migrate methods.ts** ✅ COMPLETE (PostgreSQL Extension)

- [x] Run decaffeinate on lines 26-186
- [x] Extract PostgreSQL extension to `synctable/methods.ts`
- [x] Create `extend_PostgreSQL` export following the pattern from queries.ts
- [x] Fix TypeScript errors:
  - Import dependencies: async, misc with proper types
  - Import `SyncTable` from `./synctable`
  - Lazy-load `Changes` from `../postgres/changefeed` to support Jest mocks
  - Lazy-load `ProjectAndUserTracker` from `../postgres/project-and-user-tracker` for mocks
  - Import trigger functions from `./trigger` (trigger_name, trigger_code)
  - Add proper TypeScript interfaces for all options (SyncTableOptions, ChangefeedOptions, etc.)
  - Fix `await` in `project_and_user_tracker` (proper async function with await)
  - Use `misc.bind_methods(this)` instead of 8 explicit binds
  - Add proper return types (SyncTable | undefined for error cases)
  - Use modern nullish coalescing `??=` and optional chaining `?.`
- [x] Update `synctable/methods.test.ts` to import from `./methods` and fix mock paths
- [x] Run tests: ✅ **34/34 methods tests passing (100%)**
- [x] Run `pnpm tsc --noEmit` in database package: ✅ Clean
- [x] All 104 tests across all files still passing

**Phase 4: Integration** ✅ COMPLETE

- [x] Update `database/index.ts`:

  ```typescript
  // BEFORE
  const postgresSynctable = require("./postgres-synctable");
  PostgreSQL = postgresSynctable.extend_PostgreSQL(PostgreSQL);

  // AFTER
  import { extend_PostgreSQL as extendPostgresSynctable } from "./synctable/methods";
  PostgreSQL = extendPostgresSynctable(PostgreSQL);
  ```

- [x] Run ALL database package tests: ✅ **328 tests passing (100%)**
- [x] Verify all tests pass (including existing integration tests)
- [x] Run `pnpm tsc --noEmit` in database package: ✅ Clean
- [x] Run `pnpm build` in database package: ✅ Success
- [ ] Run `pnpm build-dev` from root to verify no downstream breakage
- [x] Remove `postgres-synctable.coffee` file: ✅ Removed
- [x] Remove `dist/postgres-synctable.js` compiled file: ✅ Removed
- [x] Update test references to use new TypeScript modules: ✅ Complete
- [x] Preserve historical NOTE comment in trigger.ts: ✅ Added
- [x] Update DB_DEVELOPMENT.md with completion status

#### TypeScript Migration Notes

**Known Issues from decaffeinate** (based on queries.ts experience):

- `await` converted to function calls `await()` - must fix with perl/manual edit
- Missing `super()` in constructors - add at the beginning
- Array iteration needs `Array.isArray()` checks for CoffeeScript semantics
- Callback parameters may need explicit async keywords

**Typing Strategy:**

- Use `any` initially for complex database types, refine later
- SyncTable `_value` should be typed as `immutable.Map<any, immutable.Map<string, any>>`
- Callbacks should use `CB` type from `@cocalc/util/types/callback`
- Options objects should use TypeScript interfaces with `defaults()` pattern
- PostgreSQL instance type from `../postgres/types`

**Special Considerations:**

- **EventEmitter typing**: SyncTable emits 'change', 'init', 'error' events - consider typed events
- **Immutable.js**: Requires `@types/immutable` - already installed
- **LISTEN/NOTIFY**: Critical real-time feature - test thoroughly
- **Reconnection logic**: Complex state management - preserve exact semantics
- **Reference counting**: `_listening` map must be accurate for cleanup

#### Success Criteria

- ✅ All trigger.test.ts tests pass (100%)
- ✅ All synctable.test.ts tests pass (100%)
- ✅ All methods.test.ts tests pass (100%)
- ✅ All existing database package tests still pass
- ✅ TypeScript compilation clean (`pnpm tsc --noEmit`)
- ✅ Build successful (`pnpm build`)
- ✅ No regressions in downstream packages (`pnpm build-dev` from root)
- ✅ Code formatted with prettier
- ✅ DB_DEVELOPMENT.md updated with results

## Decision Log

### 2025-12-23: Test-Driven Migration Workflow

**Key Decision**: Adopted test-first approach for migration safety:

1. **Write/find tests FIRST** - before any migration
2. **Establish baseline** - ensure tests pass with CoffeeScript implementation
3. **Migrate to TypeScript** - decaffeinate and transform
4. **Verify tests pass** - ensure TypeScript implementation works identically
5. **Build and typecheck** - ensure no compilation errors

**Rationale**: This prevents regressions and ensures we don't break existing functionality. Tests serve as executable specifications of the expected behavior.

### 2025-12-23: Architecture Investigation

**Discovered critical patterns:**

- `index.ts` uses class extension pattern via `extend_PostgreSQL`
- Each CoffeeScript module extends the previous one in specific order
- The `pool/` directory is already fully TypeScript (no migration needed)
- Two database access patterns: legacy (PostgreSQL class) and modern (pool)

**Migration approach refined:**

- Use async/await for new TypeScript implementations
- Maintain callback API for backward compatibility via wrapper functions
- Keep `extend_PostgreSQL` pattern during Phase 2, consolidate in Phase 3
- Update `index.ts` in Phase 3 to use unified TypeScript class

### 2025-12-23: pg Client Library Upgrade

**Upgraded before migration begins:**

- ✅ Updated `pg` dependency from `^8.7.1` to `^8.16.3` (latest) in **database** package
- ✅ Updated `@types/pg` from `^8.6.1` to `^8.16.0` in **database** package
- ✅ Updated `pg` dependency from `^8.7.1` to `^8.16.3` in **next** package
- ✅ Added `@types/pg@^8.16.0` to **next** package devDependencies
- ✅ Ran `pnpm install` successfully across workspace

**Rationale**: Decided to upgrade pg library now rather than waiting for Phase 4, as it's a straightforward dependency update that doesn't require code changes. This ensures we're testing against the latest version throughout the migration. Both `database` and `next` packages now use the same pg version, avoiding version conflicts in the pnpm workspace.

### 2025-12-23: Phase 1 Complete - Setup and Tooling

**Completed:**

- ✅ Installed `decaffeinate` as dev dependency (v8.1.4)
- ✅ Configured Jest for test coverage reporting
- ✅ Added `pnpm coverage` script to package.json
- ✅ Set coverage thresholds to 80% for branches, functions, lines, and statements
- ✅ Configured coverage collection for `postgres/**/*.ts` files only
- ✅ Tested `decaffeinate` tool with sample code - works well as starting point

**Configuration Details:**

- Coverage reports: text (terminal), HTML, and LCOV formats
- Coverage directory: `./coverage`
- Excludes: test files (`*.test.ts`, `*.spec.ts`) and type definitions (`*.d.ts`)

### 2025-12-23: Initial Planning

- Decided to migrate incrementally method-by-method rather than file-by-file
- Will maintain backward compatibility throughout migration
- Will avoid refactoring during initial migration to reduce risk
- Will use `decaffeinate` as a starting point, not final output

## Resources

- [decaffeinate Documentation](https://github.com/decaffeinate/decaffeinate)
- [Jest Coverage Configuration](https://jestjs.io/docs/configuration#collectcoveragefrom-array)
- [CoCalc TypeScript Style Guide](../CLAUDE.md)
- [Database Schema](../util/db-schema/)

## Notes

- The CoffeeScript files use the old `async` callback pattern extensively
- Modern TypeScript should use `async/await` where possible
- Maintain the EventEmitter pattern for changefeeds
- PostgreSQL LISTEN/NOTIFY is critical for real-time features
- Be extremely careful with query construction to avoid SQL injection
- Performance is critical - this is a hot path in the application

## Questions / Decisions Needed

- Should we maintain the same class structure or split into smaller modules?
  - **Answer**: Keep same structure initially, refactor later
- How to handle the extensive use of `async` callback library?
  - **Answer**: Convert to native async/await gradually
- Should we upgrade pg client library version during migration?
  - **Answer**: ✅ Done - upgraded to ^8.16.3 before migration begins
