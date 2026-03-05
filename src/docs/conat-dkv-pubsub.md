# Conat DKV and PubSub — When to Use What

## Overview

CoCalc has two conat-based primitives for sharing ephemeral state between clients:

| Feature          | PubSub                                    | DKV (Distributed Key-Value)                       |
| ---------------- | ----------------------------------------- | ------------------------------------------------- |
| **Delivery**     | Fire-and-forget                           | Eventually consistent                             |
| **Late joiners** | Miss events                               | Read current state on init                        |
| **Persistence**  | None                                      | In-memory on hub (ephemeral) or persistent        |
| **Use case**     | Cursor positions, transient notifications | Shared state that new clients need to see         |
| **API**          | `set(obj)` / `on("change", cb)`           | `set(key, val)` / `get(key)` / `on("change", cb)` |

**Rule of thumb:** If a client that opens the file 30 seconds later needs to see the state, use DKV. If it's purely transient (like cursor flickers), use PubSub.

## DKV (Distributed Key-Value Store)

### Import and Create

```typescript
import { dkv, type DKV } from "@cocalc/conat/sync/dkv";

// Project-scoped DKV (all collaborators see it)
const store = await dkv<MyValueType>({
  project_id: "...",
  name: "my-store",
  ephemeral: true, // in-memory only, lost on hub restart
});

// Account-scoped DKV (per-user settings)
const store = await dkv<MyValueType>({
  account_id: "...",
  name: "my-settings",
});
```

From the frontend, `dkv` is also available via `webapp_client.conat_client.dkv()`.

### Core API

```typescript
// Synchronous read/write (local state updated immediately)
store.set("key", value); // Set a key
store.get("key"); // Get a key → T | undefined
store.get(); // Get all → { [key: string]: T }
store.delete("key"); // Delete a key
store.has("key"); // Check existence
store.clear(); // Delete all keys

// Async persistence
await store.save(); // Force save (usually auto-saves)

// Change events (fires when server-confirmed data arrives, including
// echoes of your own writes — handlers must be idempotent)
store.on("change", ({ key, value, prev }) => {
  // key: which key changed
  // value: new value (undefined if deleted)
  // prev: previous value
});

// Cleanup (reference-counted — truly closes after last ref)
store.close();
```

### Key Behaviors

1. **`set()` is synchronous** — local state updates immediately, readable via `get()` right away.
2. **`change` event fires for all server-confirmed data** — including echoes of your own writes. When your own write round-trips through the server and matches local state, the local copy is discarded but the `change` event still fires. Handlers must be idempotent.
3. **Reference counting** — same `(name, scope)` returns the same cached instance. `close()` decrements the ref count; truly closes when all refs are released.
4. **Conflict resolution** — default is last-write-wins. Custom merge functions available via the `merge` option.

### Frontend Usage Pattern (in class-based Actions)

```typescript
import { dkv, type DKV } from "@cocalc/conat/sync/dkv";

class MyActions {
  private store?: DKV<MyState>;
  private closed = false;

  async init(project_id: string) {
    this.store = await dkv<MyState>({
      project_id,
      name: "my-feature",
      ephemeral: true,
    });
    if (this.closed) {
      this.store.close();
      return;
    }

    // Read initial state (late joiner support)
    const current = this.store.get("my-key");
    if (current) {
      /* handle existing state */
    }

    // Listen for remote changes
    this.store.on("change", ({ key, value, prev }) => {
      if (key !== "my-key") return;
      // Handle state transitions based on value and prev
    });
  }

  close() {
    this.closed = true;
    this.store?.close();
  }
}
```

### Frontend Usage Pattern (in React hooks)

```typescript
import { webapp_client } from "@cocalc/frontend/webapp-client";

function useMyDKV(project_id: string) {
  const [value, setValue] = useState<MyState>();
  const dkvRef = useRef<DKV<MyState>>();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const store = await webapp_client.conat_client.dkv<MyState>({
        account_id,
        name: "my-settings",
      });
      if (cancelled) {
        store.close();
        return;
      }
      dkvRef.current = store;
      setValue(store.get(project_id));
      store.on("change", ({ key, value }) => {
        if (key === project_id) setValue(value);
      });
    })();
    return () => {
      cancelled = true;
      dkvRef.current?.close();
    };
  }, [project_id]);

  return value;
}
```

### Options Reference

```typescript
interface DKVOptions {
  name: string; // Store name (e.g., "build", "explorer-settings")
  account_id?: string; // Account scope
  project_id?: string; // Project scope (all collaborators see it)
  ephemeral?: boolean; // In-memory only (default: false = persistent)
  merge?: MergeFunction; // Custom 3-way conflict resolution
  noAutosave?: boolean; // Manual save mode (testing only)
  noCache?: boolean; // Disable reference-counted caching
  sync?: boolean; // Enable sync
  service?: string; // Custom service routing
}
```

## PubSub

### Import and Create

```typescript
import { PubSub } from "@cocalc/conat/sync/pubsub";

const ps = new PubSub({
  project_id: "...",
  path: "my-file.tex", // optional — scopes to a specific file
  name: "cursors", // becomes subject: pubsub-cursors
});
```

### Core API

```typescript
// Publish (fire-and-forget to all subscribers including self)
ps.set({ cursor: { line: 10, ch: 5 }, account_id: "..." });

// Subscribe to messages (including your own — self-echo!)
ps.on("change", (data) => {
  // data is whatever was passed to set()
});

// Cleanup
ps.close();
```

### Key Behaviors

1. **Fire-and-forget** — no delivery guarantee. Late joiners miss all prior messages.
2. **Self-echo** — you receive your own messages back. Must guard against re-entry.
3. **No persistence** — there's no `get()`. State exists only in the stream of events.
4. **Synchronous constructor** — subscribes internally (no async init needed).

## Existing Usage Examples

| Feature            | Primitive | Scope        | Key        | File                                                  |
| ------------------ | --------- | ------------ | ---------- | ----------------------------------------------------- |
| Explorer settings  | DKV       | account      | project_id | `frontend/project/explorer/use-explorer-settings.ts`  |
| Search history     | DKV       | account      | project_id | `frontend/project/explorer/use-search-history.ts`     |
| Starred files      | DKV       | account      | project_id | `frontend/project/page/flyouts/store.ts`              |
| Build coordination | DKV       | project      | file path  | `frontend/frame-editors/generic/build-coordinator.ts` |
| Cursor positions   | PubSub    | project+path | —          | `conat/sync/pubsub.ts`                                |

## Implementation Details

- **Source:** `packages/conat/sync/dkv.ts` (DKV), `packages/conat/sync/pubsub.ts` (PubSub)
- **Frontend client:** `packages/frontend/conat/client.ts` line 484 (`dkv = dkv`)
- **Tests:** `packages/backend/conat/test/sync/dkv.test.ts`, `dkv-basics.test.ts`
