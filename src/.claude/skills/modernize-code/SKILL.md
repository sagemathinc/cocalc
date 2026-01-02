---
name: modernize-code
description: Modernize legacy callback-based code to async/await TypeScript. Use when converting code that uses async.series, async.parallel, defaults(), nested callbacks, or when migrating CoffeeScript methods to modern TypeScript patterns.
allowed-tools: Read, Edit, Bash(pnpm test:*), Bash(pnpm build:*), Bash(grep:*), Bash(prettier -w:*)
---

# Modernize Code to Async/Await

This Skill guides you through converting legacy callback-based code into clean async/await TypeScript.

## What this Skill does

Provides a complete modernization process:

1. **Verify test coverage** exists and is adequate
2. **Remove async.series/parallel** and replace with async/await
3. **Convert to async function** returning Promise<void> or Promise<T>
4. **Wrap callbacks** with callback_opts for backwards compatibility
5. **Replace defaults()** with TypeScript destructuring
6. **Structure with try/catch** for proper error handling
7. **Update callers** to use direct async/await
8. **Update type definitions** in types.ts
9. **Run tests** to verify everything works

## When to apply this Skill

- Methods using `async.series` or `async.parallel` for sequencing operations
- Callback-based APIs with `opts.cb(err)` or `opts.cb(err, result)` patterns
- Code using `defaults(opts, {...})` for option handling
- Nested callback chains that could be flattened with async/await
- Legacy CoffeeScript methods being migrated to TypeScript

## Modernization Process

### Step 0: Verify Test Coverage

**Before touching any code:**

- Review existing tests for the method
- Ensure tests cover happy path and main side effects
- Identify gaps in coverage (error handling, edge cases)
- If tests are missing, write them FIRST using TDD workflow

**Example test structure:**

```typescript
import { db } from "@cocalc/database";
import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";

describe("method tests", () => {
  beforeAll(async () => {
    await initEphemeralDatabase({});
  }, 15000);

  afterAll(async () => {
    db()._close_test_query?.();
    await getPool().end();
  });

  it("performs expected operation", async () => {
    // Test implementation
  });
});
```

### Step 1: Remove async.series/async.parallel

Replace async library patterns with native async/await:

**Before:**

```typescript
return async.series(
  [
    (cb) => this.operation1({ ...opts, cb }),
    (cb) => this.operation2({ ...opts, cb }),
    (cb) => this.operation3({ ...opts, cb }),
  ],
  (err) => opts.cb?.(err),
);
```

**After:**

```typescript
try {
  await callback_opts(this.operation1.bind(this))({ ...opts });
  await callback_opts(this.operation2.bind(this))({ ...opts });
  await callback_opts(this.operation3.bind(this))({ ...opts });
  opts.cb?.();
} catch (err) {
  opts.cb?.(err);
}
```

### Step 2: Convert to Async Function

**For methods with no return value:**

```typescript
// Before
blob_maintenance(opts: BlobMaintenanceOpts) {
  // ... calls opts.cb(err) or opts.cb()
}

// After
async blob_maintenance(opts: BlobMaintenanceOpts): Promise<void> {
  // ... implementation
}
```

**For methods with return values:**

```typescript
// Before
get_stats(opts: GetStatsOpts) {
  // ... calls opts.cb(err, stats)
}

// After
async get_stats(opts?: GetStatsOpts): Promise<Stats> {
  // ... compute stats
  return stats;
}
```

**IMPORTANT: Avoid async IIFE anti-pattern**

When modernizing, convert the entire method to async rather than wrapping async code in an IIFE:

```typescript
// ❌ WRONG - async IIFE workaround
doSomething(r: Opts, cb: CB) {
  if (someCondition) {
    // ... synchronous code
    return;
  }
  (async () => {
    try {
      await someAsyncOperation();
      cb();
    } catch (err) {
      cb(err);
    }
  })();
}

// ✅ CORRECT - convert entire method to async
async doSomething(r: Opts, cb?: CB): Promise<void> {
  try {
    if (someCondition) {
      cb?.();
      return;
    }
    await someAsyncOperation();
    cb?.();
  } catch (err) {
    cb?.(err);
  }
}
```

### Step 3: Use callback_opts

```typescript
import { callback_opts } from "@cocalc/util/async-utils";

// Convert callback-based method to promise
await callback_opts(this.syncstring_maintenance.bind(this))({
  repeat_until_done: true,
  limit: 500,
  map_limit,
});
```

**Key points:**

- Always use `.bind(this)` to preserve method context
- Remove `cb` from the options object when calling via `callback_opts`

### Step 4: Replace defaults() with TypeScript Destructuring

**Before:**

```typescript
const optsWithDefaults = defaults(opts, {
  path: "/backup/blobs",
  map_limit: 1, // comment
  throttle: 0,
}) as BlobMaintenanceOpts;
```

**After:**

```typescript
const {
  path = "/backup/blobs",
  map_limit = 1,
  throttle = 0,
  cb = undefined,
} = opts;
```

NOTE: Add jsDoc for the opts.[param] to keep the "comment" comments around

### Step 5: Structure with try/catch

**For Promise<void>:**

```typescript
async blob_maintenance(opts: BlobMaintenanceOpts): Promise<void> {
  const { path = "/backup/blobs", cb = undefined } = opts;

  try {
    await callback_opts(this.operation1.bind(this))({ path });
    cb?.(); // Success
  } catch (err) {
    cb?.(err); // Error
  }
}
```

**For Promise<T>:**

```typescript
async get_stats(opts?: GetStatsOpts): Promise<Stats> {
  const { cb = undefined } = opts ?? {};

  try {
    const stats = await this.computeStats();
    cb?.(undefined, stats); // Success - call callback with result
    return stats; // Return for async/await callers
  } catch (err) {
    cb?.(err); // Error - call callback with error
    throw err; // Re-throw for async/await callers
  }
}
```

### Step 6: Update Callers

Search for all places that call the method and update:

```bash
grep -r "blob_maintenance" packages/ --include="*.ts" --include="*.tsx"
```

**Before:**

```typescript
await callback2(database.blob_maintenance);
```

**After:**

```typescript
await database.blob_maintenance({});
```

### Step 7: Update Type Definitions

Update the method's type signature in the appropriate interface file:

```typescript
// For Promise<void> methods
blob_maintenance(opts: BlobMaintenanceOpts): Promise<void>;

// For Promise<T> methods
get_stats(opts?: GetStatsOpts): Promise<Stats>;
```

### Step 8: Final Verification

```bash
pnpm build              # Compile all TypeScript
pnpm test               # Run all tests
pnpm tsc --noEmit       # Check for type errors
```

## Common Pitfalls to Avoid

- ❌ **Forgetting to call `cb()` on success/error** - Breaks backwards compatibility
- ❌ **Not using `.bind(this)` with callback_opts** - Loses method context
- ❌ **Using `defaults()` instead of destructuring** - Old pattern, less idiomatic
- ❌ **Not updating type signatures** - Causes type errors
- ❌ **Skipping test verification** - May introduce regressions
- ❌ **Forgetting to return values** - If callback had `cb(err, result)`, async function should `return result`
- ❌ **Not re-throwing errors** - Breaks error handling for async/await callers
- ❌ **Using async IIFE `(async () => {...})()` inside methods** - Convert the entire method to async instead; IIFEs are a workaround that creates unnecessary nesting

## Additional Resources

For comprehensive details and more examples, see:

- **Complete guide**: [dev/MODERNIZE_CODE.md](../../../dev/MODERNIZE_CODE.md)
- **callback_opts utility**: `@cocalc/util/async-utils`
- **Testing utilities**: `@cocalc/database/pool` for database initialization
- **Example migrations**: Browse `packages/database/postgres/` for real-world examples
