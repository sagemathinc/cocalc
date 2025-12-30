<!--
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
-->

# Modernizing Callback-Based Code to Async/TypeScript

This guide provides a comprehensive process for modernizing legacy callback-based code (using patterns like `async.series`, `defaults()`, and nested callbacks) into clean async/await TypeScript.

## When to Use This Guide

Apply this modernization pattern when you encounter:

- Methods using `async.series` or `async.parallel` for sequencing operations
- Callback-based APIs with `opts.cb(err)` or `opts.cb(err, result)` patterns
- Code using `defaults(opts, {...})` for option handling
- Nested callback chains that could be flattened with async/await
- Legacy CoffeeScript methods being migrated to TypeScript

## Prerequisites

Before modernizing a method:

- Ensure adequate test coverage exists
- Understand the method's current behavior and side effects
- Identify all callers of the method
- Have a development database available for testing

## Step-by-Step Modernization Process

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

**Before (using async.series):**

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

**After (native async/await):**

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

Change the function signature to be async and return the appropriate Promise type:

**For methods with no return value:**

```typescript
// OLD: Regular function with callback
blob_maintenance(opts: BlobMaintenanceOpts) {
  // ... calls opts.cb(err) or opts.cb()
}

// NEW: Async function returning Promise<void>
async blob_maintenance(opts: BlobMaintenanceOpts): Promise<void> {
  // ... implementation
}
```

**For methods with return values:**

```typescript
// OLD: Callback with return value
get_stats(opts: GetStatsOpts) {
  // ... calls opts.cb(err, stats)
}

// NEW: Async function returning Promise<Stats>
async get_stats(opts?: GetStatsOpts): Promise<Stats> {
  // ... compute stats
  return stats;
}
```

**Important:** Update the corresponding type definition in the appropriate types file (e.g., `postgres/types.ts`):

```typescript
// In types file - no return value
blob_maintenance(opts: BlobMaintenanceOpts): Promise<void>;

// In types file - with return value
get_stats(opts?: GetStatsOpts): Promise<Stats>;
```

### Step 3: Use callback_opts for Backwards Compatibility

Import and use `callback_opts` to wrap callback-based methods:

```typescript
import { callback_opts } from "@cocalc/util/async-utils";

// Convert callback-based method to promise
await callback_opts(this.syncstring_maintenance.bind(this))({
  repeat_until_done: true,
  limit: 500,
  map_limit,
  delay: syncstring_delay,
});
```

**Key points:**

- Always use `.bind(this)` to preserve method context
- Remove `cb` from the options object when calling via `callback_opts`
- The method can now be awaited

### Step 4: Test Thoroughly

After modernization:

```bash
pnpm build              # Compile TypeScript
pnpm test <test-file>   # Run specific tests
pnpm test               # Run all tests
```

**Verify:**

- All tests pass
- No performance regressions
- Backwards compatibility maintained (callback still works)
- No new TypeScript errors

### Step 5: Replace defaults() with TypeScript Destructuring

Replace lodash-style `defaults()` with native TypeScript destructuring:

**Before (using defaults() function):**

```typescript
const optsWithDefaults = defaults(opts, {
  path: "/backup/blobs",
  map_limit: 1,
  throttle: 0,
  cb: undefined,
}) as BlobMaintenanceOpts;

// Use optsWithDefaults.path, optsWithDefaults.map_limit, etc.
```

**After (TypeScript destructuring with defaults):**

```typescript
const {
  path = "/backup/blobs",
  map_limit = 1,
  throttle = 0,
  cb = undefined,
} = opts;

// Use path, map_limit, throttle directly
```

**Benefits:**

- More idiomatic TypeScript
- Better type inference
- No intermediate variable needed
- Cleaner, more readable code

### Step 6: Structure with try/catch

Always use try/catch to handle errors and call the callback:

**For methods that don't return a value (Promise\<void\>):**

```typescript
async blob_maintenance(opts: BlobMaintenanceOpts): Promise<void> {
  const {
    path = "/backup/blobs",
    map_limit = 1,
    cb = undefined,
  } = opts;

  try {
    // Sequential operations
    await callback_opts(this.operation1.bind(this))({ map_limit });
    await callback_opts(this.operation2.bind(this))({ path, map_limit });
    await callback_opts(this.operation3.bind(this))({ map_limit });

    // Success - call callback without error
    cb?.();
  } catch (err) {
    // Error - call callback with error
    cb?.(err);
  }
}
```

**For methods that return a value (Promise\<T\>):**

```typescript
async get_stats(opts?: GetStatsOpts): Promise<Stats> {
  const { cb = undefined } = opts ?? {};

  try {
    // Compute the result
    const stats = await this.computeStats();

    // Success - call callback with result
    cb?.(undefined, stats);

    // Return the result for direct async/await usage
    return stats;
  } catch (err) {
    // Error - call callback with error
    cb?.(err);

    // Re-throw for async/await error handling
    throw err;
  }
}
```

**Key pattern for return values:**

1. Compute the result
2. Call callback with `cb?.(undefined, result)` on success
3. **Return the result** from the function
4. Call callback with `cb?.(err)` on error
5. **Re-throw the error** for async/await callers

### Step 7: Search for Usages and Update Callers

After modernizing the method, search for all places that call it and update them to use direct async/await instead of callback wrappers:

```bash
# Search for usages of the method
grep -r "blob_maintenance" packages/ --include="*.ts" --include="*.tsx"
```

**Before (using callback wrapper):**

```typescript
// In packages/hub/hub.ts
await callback2(database.blob_maintenance);
```

**After (direct async/await):**

```typescript
// In packages/hub/hub.ts
await database.blob_maintenance({});
```

**Benefits of updating callers:**

- ✅ Simpler, more idiomatic code
- ✅ No callback conversion overhead
- ✅ Better error stack traces
- ✅ More efficient (no wrapper layer)

**What to look for:**

- `callback2(db.method)` → `await db.method(opts)`
- `callback_opts(db.method.bind(db))(opts)` → `await db.method(opts)`
- Any code that wraps the method in a callback-to-promise converter

**For methods with return values:**

```typescript
// Before: Value passed to callback
callback2(database.get_stats, (err, stats) => {
  if (err) throw err;
  console.log(stats);
});

// After: Value returned from promise
const stats = await database.get_stats();
console.log(stats);
```

### Step 8: Update Type Definitions

Update the method's type signature in the appropriate interface file:

```typescript
// For Promise<void> methods
blob_maintenance(opts: BlobMaintenanceOpts): Promise<void>;

// For Promise<T> methods with return values
get_stats(opts?: GetStatsOpts): Promise<Stats>;
```

### Step 9: Final Verification

Run final checks to ensure everything works:

```bash
pnpm build              # Compile all TypeScript
pnpm test               # Run all tests
pnpm tsc --noEmit       # Check for type errors (if applicable to your package)
```

**Verify:**

- All tests pass
- No TypeScript errors
- No regressions in functionality
- Code is cleaner and more maintainable

## Complete Example: blob_maintenance

Here's the full transformation from old-style to modern:

### Before (Old Style)

```typescript
blob_maintenance(opts: BlobMaintenanceOpts) {
  const optsWithDefaults = defaults(opts, {
    path: "/backup/blobs",
    map_limit: 1,
    blobs_per_tarball: 10000,
    throttle: 0,
    syncstring_delay: 1000,
    backup_repeat: 5,
    copy_repeat_s: 5,
    cb: undefined,
  }) as BlobMaintenanceOpts;

  return async.series(
    [
      (cb) => {
        return this.syncstring_maintenance({
          repeat_until_done: true,
          limit: 500,
          map_limit: optsWithDefaults.map_limit,
          delay: optsWithDefaults.syncstring_delay,
          cb,
        });
      },
      (cb) => {
        return this.backup_blobs_to_tarball({
          throttle: optsWithDefaults.throttle,
          limit: optsWithDefaults.blobs_per_tarball,
          path: optsWithDefaults.path,
          map_limit: optsWithDefaults.map_limit,
          repeat_until_done: optsWithDefaults.backup_repeat,
          cb,
        });
      },
      (cb) => {
        const errors: BlobCopyErrors = {};
        return this.copy_all_blobs_to_gcloud({
          limit: 1000,
          repeat_until_done_s: optsWithDefaults.copy_repeat_s,
          errors,
          remove: true,
          map_limit: optsWithDefaults.map_limit,
          throttle: optsWithDefaults.throttle,
          cb: (err) => {
            if (misc.len(errors) > 0) {
              console.log(`errors! ${misc.to_json(errors)}`);
            }
            return cb(err);
          },
        });
      },
    ],
    (err) => {
      return optsWithDefaults.cb?.(err);
    },
  );
}
```

### After (Modern Style)

```typescript
async blob_maintenance(opts: BlobMaintenanceOpts): Promise<void> {
  const {
    path = "/backup/blobs",
    map_limit = 1,
    blobs_per_tarball = 10000,
    throttle = 0,
    syncstring_delay = 1000,
    backup_repeat = 5,
    copy_repeat_s = 5,
    cb = undefined,
  } = opts;

  const dbg = this._dbg("blob_maintenance()") as (...args: unknown[]) => void;
  dbg();

  try {
    // Step 1: Maintain the patches and syncstrings
    dbg("maintain the patches and syncstrings");
    await callback_opts(this.syncstring_maintenance.bind(this))({
      repeat_until_done: true,
      limit: 500,
      map_limit,
      delay: syncstring_delay,
    });

    // Step 2: Backup blobs to tarball
    dbg("backup_blobs_to_tarball");
    await callback_opts(this.backup_blobs_to_tarball.bind(this))({
      throttle,
      limit: blobs_per_tarball,
      path,
      map_limit,
      repeat_until_done: backup_repeat,
    });

    // Step 3: Copy all blobs to gcloud
    dbg("copy_all_blobs_to_gcloud");
    const errors: BlobCopyErrors = {};
    await callback_opts(this.copy_all_blobs_to_gcloud.bind(this))({
      limit: 1000,
      repeat_until_done_s: copy_repeat_s,
      errors,
      remove: true,
      map_limit,
      throttle,
    });

    if (misc.len(errors) > 0) {
      dbg(`errors! ${misc.to_json(errors)}`);
    }

    // Success - call callback without error
    cb?.();
  } catch (err) {
    // Error occurred - call callback with error
    cb?.(err);
  }
}
```

### Key Improvements

- ✅ 40% less code (60 lines → 36 lines)
- ✅ No nested callbacks or async.series
- ✅ Native TypeScript destructuring
- ✅ Clear sequential flow with async/await
- ✅ Proper error handling with try/catch
- ✅ Maintains backwards compatibility (cb still called)
- ✅ Better type safety (Promise\<void\> return type)

## Quick Reference Checklist

When modernizing a callback method, follow these steps:

- [ ] **Step 0:** Verify test coverage exists and is adequate
- [ ] **Step 1:** Remove async.series/parallel, replace with async/await
- [ ] **Step 2:** Make function async, return Promise\<void\> (or Promise\<T\> if returning a value)
- [ ] **Step 3:** Wrap callback methods with callback_opts
- [ ] **Step 4:** Run tests to verify behavior is preserved
- [ ] **Step 5:** Replace defaults() with TypeScript destructuring
- [ ] **Step 6:** Structure with try/catch, call cb on success/error (and return/throw for Promise\<T\>)
- [ ] **Step 7:** Search for all usages and update callers to use direct async/await
- [ ] **Step 8:** Update type definition in appropriate types file
- [ ] **Step 9:** Run `pnpm build && pnpm test` to verify

## Common Pitfalls to Avoid

- ❌ **Forgetting to call `cb()` on success/error** - Breaks backwards compatibility
- ❌ **Not using `.bind(this)` with callback_opts** - Loses method context
- ❌ **Using `defaults()` instead of destructuring** - Old pattern, less idiomatic
- ❌ **Not updating type signatures** - Causes type errors in TypeScript
- ❌ **Skipping test verification** - May introduce regressions
- ❌ **Not searching for usages** - Misses opportunity to simplify calling code
- ❌ **Forgetting to return values** - If callback had `cb(err, result)`, async function should `return result`
- ❌ **Not re-throwing errors** - Breaks error handling for async/await callers

## The Full Modernization Cycle

The modernization process creates a clear migration path:

1. **Phase 1: Modernize the method** (Steps 0-6)
   - Make it async
   - Maintain backwards compatibility with callback support
   - Ensure tests pass

2. **Phase 2: Update all callers** (Step 7)
   - Remove callback wrappers
   - Use direct async/await
   - Simplify calling code

3. **Phase 3: Remove callback support** (Future)
   - Once all callers updated, callback parameter can be removed
   - Method becomes pure async/await
   - Further simplification possible

## Additional Resources

- **callback_opts utility**: `@cocalc/util/async-utils`
- **Type definitions**: Look for `types.ts` files in relevant packages
- **Testing utilities**: `@cocalc/database/pool` for database initialization
- **Example migrations**: See `packages/database/postgres/` for examples

## Questions or Issues?

If you encounter patterns not covered by this guide:

1. Check existing modernized code for similar patterns
2. Review the async/await documentation for your specific case
3. Consider whether the pattern needs to be documented here
4. Update this guide with new patterns as they're discovered
