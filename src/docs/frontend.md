# Frontend Architecture

> **Maintenance note**: Update this file when frontend state management
> patterns, client APIs, entry point initialization, or major feature areas
> change.

Package: `packages/frontend`
Build: `cd packages/static && pnpm build-dev` (do NOT run `pnpm build` in
`packages/frontend`)
Typecheck: `cd packages/frontend && pnpm tsc --noEmit`

## App Initialization

Entry point: `packages/frontend/entry-point.ts`

### Startup Sequence

1. jQuery plugins initialization
2. Core store/action registration (account, app, projects, file-use)
3. Optional features (notifications, markdown, customization)
4. React rendering

### React Tree

```
<Redux>              ← Provider wrapping
  <Localize>        ← i18n context (react-intl)
    <App>           ← App context with layout settings
      <Page />      ← Main layout (nav, project tabs, editors)
    </App>
  </Localize>
</Redux>
```

Render entry: `packages/frontend/app/render.tsx`
Main layout: `packages/frontend/app/page.tsx`

## State Management

CoCalc uses a custom Redux-style framework in `packages/frontend/app-framework/`.

### Key Files

- `app-framework/index.ts` — Global `AppRedux` singleton, `rclass` wrapper
- `app-framework/actions-and-stores.ts` — Type registry for all global stores
- `app-framework/redux-hooks.ts` — React hooks: `useRedux`, `useStore`,
  `useActions`, `useTypedRedux`, `useEditorRedux`
- `app-framework/Table.ts` — Database synctable integration
- `app-framework/syncdb/` — `useSyncdbRecord`, `useSyncdbContext` hooks

### Feature Store Pattern

Each feature area has a standard structure:

```
feature/
├── init.ts         ← Redux registration
├── store.ts        ← export class XXXStore extends Store<State>
├── actions.ts      ← export class XXXActions extends Actions<State>
├── types.ts        ← State interface definition
├── table.ts        ← Database syncing (optional)
└── components/     ← React UI
```

Registration:

```typescript
import { Store, Actions, redux } from "@cocalc/frontend/app-framework";

class MyFeatureStore extends Store<MyState> { ... }
class MyFeatureActions extends Actions<MyState> { ... }

redux.createStore("my-feature", MyFeatureStore, initialState);
redux.createActions("my-feature", MyFeatureActions);
```

### Accessing Stores from Components

```typescript
// New pattern (preferred): React hooks
import { useTypedRedux, useActions } from "@cocalc/frontend/app-framework";

function MyComponent() {
  const value = useTypedRedux("my-feature", "someField");
  const actions = useActions("my-feature");
}

// Per-project store:
const projectMap = useTypedRedux("projects", "project_map");

// Per-editor store:
const editorState = useEditorRedux<State>({ project_id, path });
```

### Major Global Stores

| Store            | Registration        | Purpose                                         |
| ---------------- | ------------------- | ----------------------------------------------- |
| `AccountStore`   | `account/init.ts`   | User profile, settings, preferences, auth state |
| `ProjectsStore`  | `projects/init.ts`  | Project listing, open projects, search/filter   |
| `BillingStore`   | `billing/init.ts`   | Invoices, subscriptions, payment methods        |
| `PageStore`      | `app/init.ts`       | Page navigation, layout                         |
| `CustomizeStore` | `customize/init.ts` | Site customization settings                     |

### Per-Project and Per-Editor Stores

- `ProjectStore` — one per active project (`project_store.ts`)
- `ProjectActions` — one per active project (`project_actions.ts`)
- `EditorStore` / `EditorActions` — one per open file (created dynamically)

Access:

```typescript
redux.getProjectStore(project_id); // ProjectStore
redux.getProjectActions(project_id); // ProjectActions
redux.getEditorStore(project_id, path); // EditorStore
```

### Immutable Data

Stores use Immutable.js (`Map`, `List`, `Set`). State changes are detected
by reference comparison. All store state is deeply immutable.

## Client Layer

`packages/frontend/client/` provides the `webapp_client` singleton that
all frontend code uses to communicate with the backend.

### Key Files

| File                  | Sub-client        | Purpose                                    |
| --------------------- | ----------------- | ------------------------------------------ |
| `client/client.ts`    | `WebappClient`    | Main client, initializes all sub-clients   |
| `client/query.ts`     | `QueryClient`     | Database queries and changefeeds via conat |
| `client/project.ts`   | `ProjectClient`   | Project operations                         |
| `client/account.ts`   | `AccountClient`   | Account/auth operations                    |
| `client/admin.ts`     | `AdminClient`     | Admin-only operations                      |
| `client/llm.ts`       | `LLMClient`       | LLM/AI integration                         |
| `client/purchases.ts` | `PurchasesClient` | Billing operations                         |
| `client/users.ts`     | `UsersClient`     | User lookup/tracking                       |
| `client/api.ts`       | —                 | `api()` for REST calls to `/api/v2/`       |
| `client/messages.ts`  | `Messages`        | WebSocket messaging                        |
| `client/time.ts`      | `TimeClient`      | Server time sync                           |

### Conat Client

`packages/frontend/conat/client.ts` manages the conat connection:

```typescript
// Hub API calls:
const hub = webapp_client.conat_client.hub;
await hub.projects.createProject({ title: "My Project" });
await hub.projects.start({ project_id });
await hub.db.userQuery(query);

// DKV for real-time key-value sync:
const dkv = await webapp_client.conat_client.dkv({
  account_id,
  name: "my-store",
});
dkv.set("key", "value"); // syncs across all sessions

// Services:
webapp_client.conat_client.callConatService(name, method, args);
webapp_client.conat_client.pubsub_conat(channel);
```

### Connection Layer

```
React Components
    ↓ useRedux() hooks
Redux Stores (immutable state)
    ↓ Actions dispatch
WebappClient (networking singleton)
    ↓ Sub-clients
ConatClient / QueryClient
    ↓ conat protocol
WebSocket to Hub
```

## Feature Areas

The frontend is organized into feature directories under `packages/frontend/`:

| Directory        | Purpose                                          |
| ---------------- | ------------------------------------------------ |
| `account/`       | Account settings, preferences, SSH keys          |
| `admin/`         | Site administration panel                        |
| `billing/`       | Billing, subscriptions, invoices                 |
| `chat/`          | Side chat and standalone chat                    |
| `codemirror/`    | CodeMirror editor integration                    |
| `collaborators/` | Project collaborator management                  |
| `components/`    | Shared React components (300+)                   |
| `conat/`         | Conat client integration                         |
| `course/`        | Course management (instructor tools)             |
| `customize/`     | Site customization                               |
| `editors/`       | File editor registry and routing                 |
| `frame-editors/` | Frame-based editor system (28 editor types)      |
| `i18n/`          | Internationalization (react-intl, 19+ languages) |
| `jupyter/`       | Jupyter notebook frontend                        |
| `messages/`      | User messaging system                            |
| `notifications/` | Notification system                              |
| `project/`       | Project page, file explorer, settings            |
| `projects/`      | Project listing and creation                     |
| `purchases/`     | Purchase flow and management                     |
| `sagews/`        | Sage worksheet frontend                          |
| `search/`        | Search functionality                             |
| `share/`         | Public sharing features                          |
| `site-licenses/` | License management                               |

### Frame Editors

`packages/frontend/frame-editors/` provides the split-pane editor system used
for all file editing in CoCalc.

#### Architecture Overview

```
File opened by user
    ↓
Editor registry lookup (extension → editor spec)
    ↓
Redux store + actions created per file
    ↓
Frame tree loaded from localStorage (or default layout)
    ↓
FrameTreeEditor component renders the binary tree
    ↓
Each leaf renders a specific editor component (CodeMirror, PDF viewer, terminal, etc.)
```

#### Binary Tree Model

The frame layout is a binary tree stored as an Immutable.js `Map`. Each node
is either an internal `"node"` (split into two panes) or a leaf with a
specific editor type.

```
Internal node:                 Leaf node:
{                              {
  id: "abc123",                  id: "def456",
  type: "node",                  type: "cm",       ← editor type
  direction: "col"|"row",       font_size: 14,
  pos: 0.5,                     path: "file.py"    ← optional override
  first: { ... },             }
  second: { ... }
}
```

- `direction: "col"` — vertical split (side by side)
- `direction: "row"` — horizontal split (top and bottom)
- `pos` — drag bar position as fraction (0 to 1)

Tree operations in `frame-tree/tree-ops.ts`:

- `split_leaf(tree, id, direction, type)` — Split a leaf into two panes
- `delete_node(tree, id)` — Remove a frame, replacing parent with sibling
- `get_node(tree, id)` — Find a node by ID
- `get_leaf_ids(tree)` — Get all leaf node IDs
- `assign_ids(tree)` — Assign UUID-based IDs (8 chars) to nodes without them
- `new_frame(tree, direction, type)` — Create new root with existing tree + new leaf

#### Editor Registration

Editors are registered by file extension via `frame-tree/register.ts`:

```typescript
// register.ts maps file extensions to editor components and actions
register_file_editor({
  ext: ["py", "js", "ts", ...],
  editor: Editor,       // React component from createEditor()
  actions: Actions,     // Actions class (extends code-editor Actions)
});
```

When a file is opened:

1. `get_file_editor(ext, is_public)` looks up the registered editor
2. `init(path, redux, project_id)` creates a Redux store + actions for this file
3. The store name is `redux_name(project_id, path)` (deterministic)
4. Reference counting tracks open instances; cleanup on last close

#### Editor Spec Pattern

Each editor type declares an `EditorSpec` — a map of frame type names to
`EditorDescription` objects:

```typescript
// Example: code-editor/editor.ts
const EDITOR_SPEC = {
  cm: {                           // frame type name
    type: "cm",
    short: "Code",
    name: "Source Code",
    icon: "code",
    component: CodemirrorEditor,  // React component to render
    commands: set(["save", "find", "undo", "redo", ...]),
  },
  terminal: { ... },
  time_travel: { ... },
};

export const Editor = createEditor({
  editor_spec: EDITOR_SPEC,
  display_name: "CodeEditor",
});
```

The `createEditor()` function (in `frame-tree/editor.tsx`) wraps the spec
into a `FrameTreeEditor` component that manages the full frame tree.

Complex editors override `_raw_default_frame_tree()` in their Actions class
to specify the initial layout:

```typescript
// latex-editor/actions.ts
_raw_default_frame_tree(): FrameTree {
  return {
    direction: "col",
    type: "node",
    first: { type: "cm" },           // source editor
    second: { type: "pdfjs_canvas" }, // PDF preview
  };
}
```

#### Component Hierarchy

```
FrameTreeEditor                    ← Top-level, reads local_view_state from Redux
  └─ FrameTree                    ← Recursive: renders node or leaf
       ├─ (if node) FrameTree × 2 + DragBar
       └─ (if leaf)
            ├─ FrameTitleBar      ← Frame header with buttons
            └─ FrameTreeLeaf     ← Wraps the actual editor component
                 └─ TheComponent  ← e.g., CodemirrorEditor, PDFViewer
```

Each leaf gets a `FrameContext.Provider` with `id`, `project_id`, `path`,
`actions`, `desc`, `font_size`, `isFocused`, `isVisible`, and `redux`.

#### Persistence: Where State Is Stored

Frame editors persist state at three levels:

**1. File content — SyncString/SyncDB (via conat, server-side)**

The primary file content is synced in real-time via conat:

```typescript
// In code-editor/actions.ts
this._syncstring: SyncString;   // Real-time synced file content
this._syncdb?: SyncDB;          // Optional auxiliary shared config (e.g., LaTeX settings)
```

- `SyncString` — for plain text files (code, markdown, etc.)
- `SyncDB` — for structured data (Jupyter notebooks, whiteboards)
- Changes sync to all collaborators and persist to disk on the project daemon
- Initialized in `_init_syncstring()` which creates the sync object and
  registers change handlers

**2. Frame layout + editor state — localStorage (per-browser)**

The `local_view_state` stores everything about the editor's visual layout:

```typescript
local_view_state: {
  version: 1,
  frame_tree: { ... },        // The binary tree structure
  active_id: "abc123",        // Currently focused frame
  full_id: "def456",          // Frame in full-screen mode (optional)
  font_size: 14,              // Default font size
  editor_state: {             // Per-frame state (scroll position, etc.)
    "abc123": { scrollTop: 100, ... },
    "def456": { ... },
  },
}
```

Stored in `localStorage` under the key `redux_name(project_id, path)`.
Loaded on open via `_load_local_view_state()`, saved (debounced 1500ms)
via `_save_local_view_state()` on every change. Survives page reloads
but is per-browser (not synced between devices).

Key methods:

- `set_local_view_state(obj)` — Update fields in local_view_state
- `save_editor_state(id, state)` — Save per-frame state (e.g., scroll position)
- `reset_local_view_state()` — Delete from localStorage and rebuild defaults

**3. Account settings — Redux global store (synced via database)**

Font size defaults, editor preferences, terminal settings come from the
account store and are passed down as props:

```typescript
const editor_settings = useTypedRedux("account", "editor_settings");
const terminal = useTypedRedux("account", "terminal");
```

#### Data Flow: Opening a File

```
1. User clicks file in project explorer
   ↓
2. ProjectActions.open_file(path) dispatches
   ↓
3. Editor registry lookup: get_file_editor(extension, is_public)
   ↓
4. init(path, redux, project_id) creates:
   - Redux store (name = redux_name(project_id, path))
   - Actions instance (extends code-editor/actions.ts)
   ↓
5. Actions._init() is called:
   a. _load_local_view_state() → reads frame_tree from localStorage
   b. _init_syncstring() → creates SyncString/SyncDB connection to project
   c. Waits for SyncString "ready" event
   d. Sets store: { is_loaded: true, value: syncstring.to_str() }
   ↓
6. FrameTreeEditor renders:
   a. Reads local_view_state.frame_tree from Redux store
   b. Recursively renders FrameTree (binary tree walk)
   c. Each leaf renders its editor component with FrameContext
   ↓
7. User edits content:
   a. Editor component calls actions (e.g., set_syncstring_to_codemirror)
   b. SyncString propagates changes to all collaborators
   c. Redux store updates trigger React re-renders
```

#### Key Files

```
packages/frontend/frame-editors/
├── frame-tree/
│   ├── editor.tsx       ← createEditor() factory, FrameTreeEditor component
│   ├── frame-tree.tsx   ← Recursive binary tree renderer
│   ├── leaf.tsx         ← FrameTreeLeaf: wraps editor components
│   ├── title-bar.tsx    ← Frame header with buttons/commands
│   ├── frame-tree-drag-bar.tsx ← Resizable split bar
│   ├── tree-ops.ts      ← Immutable tree operations (split, delete, etc.)
│   ├── types.ts         ← FrameTree, EditorDescription, EditorType types
│   ├── register.ts      ← Editor registration by file extension
│   ├── frame-context.ts ← React context for frame metadata
│   └── hooks.ts         ← Frame-specific React hooks
├── code-editor/
│   ├── editor.ts        ← Base editor spec (cm + terminal + time_travel)
│   ├── actions.ts       ← Base Actions class (sync, persistence, tree ops)
│   └── codemirror-editor.tsx ← CodeMirror wrapper component
├── latex-editor/        ← LaTeX: cm + PDF preview + build log + errors
├── markdown-editor/     ← Markdown: cm + rendered preview
├── jupyter-editor/      ← Jupyter notebook editor
├── terminal-editor/     ← Terminal emulator frame
├── whiteboard-editor/   ← Whiteboard/canvas editor
├── slides-editor/       ← Presentation slides
├── time-travel-editor/  ← Version history viewer
└── ...                  ← 20+ more editor types
```

## Browser Console Debugging

In dev mode (`DEBUG=true`), the global `cc` (or `cocalc`) object is available
in the browser console. Defined in `packages/frontend/client/console.ts`.

```javascript
cc.redux          // AppRedux singleton — access any store or actions
cc.client         // WebappClient singleton
cc.conat          // Conat client
cc.misc           // @cocalc/util/misc utilities
cc.immutable      // Immutable.js library
cc.schema         // @cocalc/util/schema
cc.current        // Current editor info

// Examples:
cc.redux.getStore("account").get("editor_settings")?.toJS()
cc.redux.getTable("account").set({editor_settings: {buttons: {"py-cm": {save: true}}}})
cc.redux.getProjectActions("project-id").open_file({path: "foo.py"})
```

**Note:** If `cc` is undefined in Chrome DevTools, make sure the console
context is set to **top** (not an iframe).

## Authentication

Wait for auth to complete before accessing account data:

```typescript
const store = redux.getStore("account");
await store.async_wait({
  until: () => store.get_account_id() != null,
  timeout: 0,
});
```

The `AccountStore` tracks `user_type`: `"public"` → `"signing_in"` →
`"signed_in"`.

## Styling

- SASS files in `packages/frontend/_*.sass`
- Colors: always use `COLORS` from `@cocalc/util/theme` — never hardcode
- Ant Design components with custom overrides
