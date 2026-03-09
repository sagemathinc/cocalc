# Syncstrings: Real-Time Collaborative Document Synchronization

This document explains the syncstring/syncdoc system — the core mechanism CoCalc
uses for real-time collaborative editing of files, Jupyter notebooks, and
structured data.

## Overview

Syncstrings provide **real-time collaborative editing** where multiple users can
simultaneously edit the same document with automatic conflict resolution. The
system is built on a **patch-based** architecture: every edit is stored as a
diff-match-patch (DMP) patch, and the current document state is reconstructed by
applying patches in order.

Key properties:

- **Convergent**: All clients eventually see the same document state
- **Persistent**: Full edit history is stored and recoverable
- **Offline-capable**: Edits made offline are rebased when the client reconnects
- **Undo/redo**: Per-user, per-session undo that doesn't affect other users' edits

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Browser A   │     │  Browser B   │     │  Browser C   │
│  (SyncDoc)   │     │  (SyncDoc)   │     │  (SyncDoc)   │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       │                    │                    │
       │     Conat PubSub / DStream              │
       └────────────┬───────┴────────────────────┘
                    │
            ┌───────▼───────┐
            │    Project     │
            │   (SyncDoc)    │
            │  File Server   │
            └───────┬───────┘
                    │
              ┌─────▼─────┐
              │  DStream   │
              │  (Conat)   │
              │  Patches   │
              └────────────┘
```

### Core Classes

| Class | Location | Purpose |
|-------|----------|---------|
| `SyncDoc` | `packages/sync/editor/generic/sync-doc.ts` | Core synchronization engine shared by all document types |
| `SyncString` | `packages/sync/editor/string/sync.ts` | String document subclass of SyncDoc |
| `SyncDB` | `packages/sync/editor/db/sync.ts` | Structured database document subclass of SyncDoc |
| `StringDocument` | `packages/sync/editor/string/doc.ts` | Immutable string document with patch operations |
| `DBDocument` | `packages/sync/editor/db/doc.ts` | Immutable database-like document (records with primary keys) |
| `SortedPatchList` | `packages/sync/editor/generic/sorted-patch-list.ts` | Ordered list of patches that computes document state |
| `SyncTableStream` | `packages/conat/sync/synctable-stream.ts` | Conat-backed storage for patches (replaces PostgreSQL) |

### Two Document Types

**SyncString** — for plain text files (code, markdown, LaTeX, etc.):

```typescript
// packages/sync/editor/string/sync.ts
export class SyncString extends SyncDoc {
  constructor(opts: SyncOpts0) {
    (opts as SyncOpts).from_str = (str) => new StringDocument(str);
    (opts as SyncOpts).doctype = { type: "string" };
    super(opts as SyncOpts);
  }
}
```

**SyncDB** — for structured data (Jupyter notebooks, task lists, course files):

```typescript
// packages/sync/editor/db/sync.ts
export class SyncDB extends SyncDoc {
  constructor(opts: SyncDBOpts0) {
    opts1.from_str = (str) => from_str(str, opts1.primary_keys, opts1.string_cols);
    opts1.doctype = { type: "db", patch_format: 1, opts: { primary_keys, string_cols } };
    super(opts1 as SyncOpts);
  }
}
```

SyncDB represents a document as a list of records with primary keys. Concurrent
edits to different records never conflict. Edits to the same record use
last-write-wins for atomic fields, and string-merge for `string_cols`.

## Patch System

### Diff-Match-Patch (DMP)

String patches use Google's diff-match-patch algorithm
(`packages/util/dmp.ts`). Patches are stored in a **compressed format**:

```typescript
// packages/util/dmp.ts
type CompressedPatch = [
  [-1 | 0 | 1, string][],  // diffs: -1=delete, 0=equal, 1=insert
  number,                    // start1
  number,                    // start2
  number,                    // length1
  number,                    // length2
][];
```

Key functions:

- `make_patch(s0, s1)` — compute a patch transforming string `s0` into `s1`
- `apply_patch(patch, s)` — apply a patch to a string, returns `[result, clean]`
- `three_way_merge({base, local, remote})` — merge concurrent edits

### SortedPatchList

`SortedPatchList` (`packages/sync/editor/generic/sorted-patch-list.ts`)
maintains all patches sorted by logical time and computes the current document
state.

Key concepts:

- **Patches**: Each patch transforms the document from one version to the next
- **Snapshots**: Periodic full copies of the document state, so the full patch
  history doesn't need to be replayed from the beginning
- **Live patches**: Patches that are part of the current canonical document state
- **Staging**: Patches received but not yet mergeable (waiting for parent patches)
- **LRU cache**: Caches computed document states at various timestamps for
  performance

```typescript
// Getting document state at a point in time
const doc = patchList.value({ time });              // state at specific time
const doc = patchList.value({ without_times });     // state excluding certain patches
```

### Patch DAG Structure

Patches form a **directed acyclic graph** (DAG). Each patch records its
`parents` — the set of source patches that were known when it was created. This
enables proper merging of concurrent edits:

```typescript
// packages/sync/editor/generic/types.ts
interface Patch {
  time: number;           // logical timestamp (increasing, user-distinguished)
  wall?: number;          // wallclock time for display
  patch?: CompressedPatch;
  user_id: number;        // index into syncstrings.users array
  parents?: number[];     // timestamps of parent patches
  is_snapshot?: boolean;
  snapshot?: string;      // full document state at this point
  version?: number;       // user-friendly version number
  size: number;
}
```

## Database Schema

### `syncstrings` Table

The coordination record for a synchronized document
(`packages/util/db-schema/syncstring-schema.ts`):

| Field | Type | Description |
|-------|------|-------------|
| `string_id` | `CHAR(40)` | Primary key — `sha1(project_id, path)` |
| `project_id` | `UUID` | Owning project |
| `path` | `string` | File path within project |
| `users` | `UUID[]` | Account IDs of editors (index = `user_id` in patches) |
| `last_active` | `timestamp` | When a user last interacted |
| `last_snapshot` | `timestamp` | Time of most recent snapshot |
| `snapshot_interval` | `integer` | Make snapshot every N patches (default: 300) |
| `doctype` | `string` | JSON descriptor, e.g. `{"type":"string"}` or `{"type":"db","opts":{...}}` |
| `save` | `map` | Save-to-disk state: `{state, hash, error}` |
| `init` | `map` | Init state: `{time, size, error}` |
| `read_only` | `boolean` | Whether the file is read-only |
| `settings` | `map` | Shared per-file settings (e.g., spellcheck language) |

### `patches` Table

Individual edit patches:

| Field | Type | Description |
|-------|------|-------------|
| `string_id` | `CHAR(40)` | Foreign key to syncstrings |
| `time` | `timestamp` | Logical timestamp of the patch |
| `wall` | `timestamp` | Wallclock time shown to user |
| `user_id` | `integer` | Index into `syncstrings.users` |
| `patch` | `TEXT` | JSON-encoded compressed DMP patch |
| `is_snapshot` | `boolean` | Whether this entry is a snapshot |
| `snapshot` | `string` | Full document state (if snapshot) |
| `parents` | `INTEGER[]` | Parent patch timestamps |
| `version` | `integer` | Version number |
| `format` | `integer` | 0 = string patch, 1 = db-doc patch |

Primary key: `(string_id, time, is_snapshot)`.

### `cursors` Table

Real-time cursor positions for collaborative editing:

| Field | Type | Description |
|-------|------|-------------|
| `string_id` | `CHAR(40)` | Which document |
| `user_id` | `integer` | Which user |
| `locs` | `JSONB[]` | Cursor positions: `[{x, y}, ...]` |
| `time` | `timestamp` | When cursor was last updated |

### Related Tables

- **`eval_inputs`** / **`eval_outputs`** — Code evaluation requests/results
  (used by Sage worksheets)
- **`ipywidgets`** — Jupyter widget state (ephemeral, not persisted to DB)

## Conat Integration

The sync system uses **Conat** (CoCalc's messaging layer) for real-time patch
transport instead of direct PostgreSQL changefeeds.

### DStream

Patches are stored in a Conat **DStream** (distributed stream), which provides:

- **Ordered, persistent storage** of patch messages
- **Real-time delivery** to all connected clients
- **Sequence numbers** for incremental history loading
- **Snapshots** with `seq_info` for efficient startup

```
// packages/conat/sync/synctable-stream.ts
SyncTableStream → DStream → Conat persistent stream
```

### SyncTableStream

`SyncTableStream` (`packages/conat/sync/synctable-stream.ts`) wraps a DStream to
provide a SyncTable-compatible interface for the patches table. This is scoped to
a single project and does NOT use PostgreSQL.

### How a Patch Flows

1. User edits document in browser → `SyncDoc.set_doc(newDoc)`
2. `SyncDoc.save()` is called → computes `doc.make_patch(last)` to get a DMP patch
3. `commit_patch(time, patch)` → writes patch to `patches_table` (SyncTableStream)
4. SyncTableStream publishes to the DStream
5. Other clients receive the patch via DStream subscription
6. Each client's `SortedPatchList.add()` incorporates the new patch
7. `sync_remote_and_doc()` recomputes the document state and emits `"change"`

## SyncDoc Lifecycle

### Initialization

```
constructor()
  → init()
    → ensure_syncstring_exists_in_db()     // create syncstrings record
    → init_syncstring_table()              // subscribe to syncstrings table
    → init_patch_list()                    // load patches, build SortedPatchList
    → init_cursors()                       // subscribe to cursor updates
    → init_evaluator()                     // for Sage worksheets
    → init_ipywidgets()                    // for Jupyter widgets
    → load_from_disk()                     // (file server only) read file
    → set_state("ready")
```

### File Server Role

One participant acts as the **file server** — responsible for:

- Loading the file from disk on first open
- Saving changes back to disk (autosave every 45 seconds)
- Watching the filesystem for external changes
- Setting the `init` field to signal readiness to browsers

By default the project daemon is the file server, but a **compute server** can
take over this role (managed via the compute server manager syncdoc).

### Save Flow

```
Browser: save()
  → commit()           // create patch from doc vs last
  → patches_table.save()  // persist to conat dstream

File Server: save_to_disk()
  → compute current doc state
  → write to filesystem
  → update syncstrings.save = {state:'done', hash}
```

### Snapshots

Snapshots are periodic full copies of the document state, stored as special
entries in the patches stream. They enable:

- **Fast startup**: Only load patches after the most recent snapshot
- **Incremental history**: Each snapshot has `seq_info.prev_seq` pointing to the
  previous snapshot, enabling paginated history loading

```typescript
// Default: snapshot every 300 patches
const DEFAULT_SNAPSHOT_INTERVAL = 300;
```

## Undo/Redo

The undo system is **per-user, per-session**:

- Only undoes patches made by the current user in the current editing session
- Other users' edits are never affected
- Undo computes "what the document would look like if this patch didn't exist"
  (via `version_without()`) rather than removing the patch from history
- A new patch is created that records the undo result

## Cursors

Cursor tracking provides real-time visibility of other users' cursor positions.
Cursors are broadcast via:

- **Conat PubSub** (fast, 150ms throttle) when using Conat
- **Cursors SyncTable** (legacy, 750ms throttle) otherwise

Cursors are also used for **compute server coordination** — a remote Jupyter
kernel announces itself by setting a special cursor type
(`COMPUTER_SERVER_CURSOR_TYPE`).

## Key Configuration Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `MAX_FILE_SIZE_MB` | 32 | Maximum file size for syncstrings |
| `FILE_SERVER_AUTOSAVE_S` | 45 | File server autosave interval |
| `DEFAULT_SNAPSHOT_INTERVAL` | 300 | Patches between snapshots |
| `CURSOR_THROTTLE_NATS_MS` | 150 | Cursor update throttle (Conat) |
| `READ_ONLY_CHECK_INTERVAL_MS` | 7500 | Filesystem permission polling |

## Key Source Files

| File | Description |
|------|-------------|
| `packages/sync/editor/generic/sync-doc.ts` | Core SyncDoc class (~3600 lines) |
| `packages/sync/editor/generic/sorted-patch-list.ts` | Patch ordering and document reconstruction |
| `packages/sync/editor/generic/types.ts` | Patch, Document, Client interfaces |
| `packages/sync/editor/generic/util.ts` | Patch comparison, DMP re-exports |
| `packages/sync/editor/generic/export.ts` | History export |
| `packages/sync/editor/string/doc.ts` | StringDocument implementation |
| `packages/sync/editor/string/sync.ts` | SyncString class |
| `packages/sync/editor/db/doc.ts` | DBDocument implementation |
| `packages/sync/editor/db/sync.ts` | SyncDB class |
| `packages/util/dmp.ts` | Diff-match-patch wrappers |
| `packages/util/db-schema/syncstring-schema.ts` | Database schema for all sync tables |
| `packages/conat/sync/synctable-stream.ts` | Conat-backed SyncTable for patches |
| `packages/conat/sync/dstream.ts` | Distributed message stream |
| `packages/sync/client/conat-sync-client.ts` | Client-side sync via Conat |
| `packages/sync/table/synctable.ts` | SyncTable base class |

## Common Patterns for Agents

### Opening a SyncString (frontend)

```typescript
const syncstring = webapp_client.sync_client.sync_string({
  project_id: "...",
  path: "file.txt",
});
await syncstring.wait_until_ready();
const content = syncstring.to_str();
```

### Opening a SyncDB (frontend)

```typescript
const syncdb = webapp_client.sync_client.sync_db({
  project_id: "...",
  path: "file.sage-jupyter2",
  primary_keys: ["type", "id"],
  string_cols: ["input", "output"],
});
await syncdb.wait_until_ready();
const record = syncdb.get_one({ type: "cell", id: "abc" });
```

### Listening for Changes

```typescript
syncdoc.on("change", (changes) => {
  // changes describes what changed (for SyncDB, the primary keys that changed)
  console.log("Document changed");
});

syncdoc.on("before-change", () => {
  // Opportunity to save live editor state before upstream patches are applied
});
```

### Time Travel (Version History)

```typescript
const versions = syncdoc.versions();           // all version timestamps
const doc = syncdoc.version(versions[10]);     // document at version 10
const accountId = syncdoc.account_id(versions[10]); // who made that edit
```
