<!--
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
-->

# Database Package CoffeeScript to TypeScript Migration Plan

## Overview

This document tracks the migration of all CoffeeScript code in the `@cocalc/database` package to TypeScript. The goal is to eliminate the 7,262 lines of CoffeeScript code across 8 files while maintaining backward compatibility and ensuring comprehensive test coverage.

**WARNING**: This is the single scariest chunk of CoffeeScript left in CoCalc!

## Current State

### CoffeeScript Files (by size)

| File                               | Lines     | Description                                     | Priority     |
| ---------------------------------- | --------- | ----------------------------------------------- | ------------ |
| `postgres-server-queries.coffee`   | 2,518     | Server-side database queries                    | High         |
| `postgres-user-queries.coffee`     | 1,790     | User-facing query handling                      | High         |
| `postgres-base.coffee`             | 1,156     | Core PostgreSQL class and connection management | **Critical** |
| `postgres-blobs.coffee`            | 760       | Blob storage operations                         | Medium       |
| `postgres-synctable.coffee`        | 604       | Real-time table synchronization                 | Medium       |
| `postgres-user-query-queue.coffee` | 218       | Queue management for user queries               | Low          |
| `postgres-ops.coffee`              | 168       | Database operations                             | Low          |
| `filesystem-bucket.coffee`         | 48        | Filesystem bucket utilities                     | Low          |
| **Total**                          | **7,262** |                                                 |              |

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
export function db(opts = {}): PostgreSQL {
  if (theDB === undefined) {
    let PostgreSQL = base.PostgreSQL;

    for (const module of [
      "server-queries",
      "blobs",
      "synctable",
      "user-queries",
      "ops",
    ]) {
      PostgreSQL = require(`./postgres-${module}`).extend_PostgreSQL(
        PostgreSQL,
      );
    }
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

Tested `decaffeinate` with sample code from `postgres-ops.coffee`:

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

**In the CoffeeScript wrapper:**

```coffeescript
# In postgres-ops.coffee
{ backupTableCB } = require('./postgres/backup')

exports.extend_PostgreSQL = (ext) -> class PostgreSQL extends ext
  _backup_table: (opts) =>
    # IMPORTANT: Use .call(this, opts) to preserve instance context
    backupTableCB.call(this, opts)
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

2. **postgres-ops.coffee** - Database operations
   - Standalone operations first

3. **filesystem-bucket.coffee** - Smallest file, good for validation

4. **postgres-user-query-queue.coffee** - Queue management

5. **postgres-blobs.coffee** - Blob operations (already has `postgres/blobs.ts` partial implementation)

6. **postgres-synctable.coffee** - Real-time synchronization

7. **postgres-user-queries.coffee** - User query handling

8. **postgres-server-queries.coffee** - Largest, most complex

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

  // Methods from postgres-ops.coffee
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
- Remove `filesystem-bucket.coffee` (migrate to TypeScript first)

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

### In Progress

_None yet_

### Next Up

Recommended next target:

- **postgres-user-query-queue.coffee** - Small file, good next step before moving to larger query modules

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
