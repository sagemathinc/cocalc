# Editor Extension Mechanism

## Context

CoCalc's frame editor system currently supports 25+ editor types (code, Jupyter, LaTeX, markdown, terminal, etc.), each registered statically at build time. Adding a new editor requires changes across multiple files (register.ts, editor.ts, actions.ts, file-associations.ts) and a rebuild. There is no way for users or admins to configure which editor handles a file type, no plugin mechanism, and no way to add editors at runtime.

This design introduces an extension mechanism at two levels:

1. **Whole-editor extensions** -- register a complete editor for file extensions (Level 1)
2. **Frame extensions** -- add or replace individual frame types within existing editors (Level 2)

The goal is dynamic extensibility: a trusted bundle declares which files it handles, and project-wide or per-user configuration controls the mapping.

---

## Current Architecture (key files)

| Component           | File                                                         | Role                                                           |
| ------------------- | ------------------------------------------------------------ | -------------------------------------------------------------- |
| File associations   | `frontend/file-associations.ts`                              | Maps 100+ extensions to editor metadata (FileSpec)             |
| Low-level registry  | `frontend/file-editors.ts`                                   | `register_file_editor()` with init/remove/save lifecycle       |
| Frame-tree registry | `frontend/frame-editors/frame-tree/register.ts`              | Modern async registration with retry, ref counting             |
| Master import       | `frontend/frame-editors/register.ts`                         | Imports all individual `register.ts` files                     |
| Types               | `frontend/frame-editors/frame-tree/types.ts`                 | `EditorType` (string union), `EditorDescription`, `EditorSpec` |
| Editor factory      | `frontend/frame-editors/frame-tree/editor.tsx`               | `createEditor()` wraps EditorSpec into React component         |
| Base actions        | `frontend/frame-editors/code-editor/actions.ts`              | Base class with sync init, doctype selection, state management |
| Sync client         | `frontend/frame-editors/generic/client.ts`                   | `syncstring2()`, `syncdb2()` factory functions                 |
| DKV settings        | `frontend/frame-editors/frame-tree/frame-editor-settings.ts` | Per-user DKV-based settings pattern (toolbar, layouts)         |

### Registration flow today

```
file-associations.ts  (extension -> metadata)
    |
frame-editors/frame-tree/register.ts  (register_file_editor() stores in REGISTRY)
    |
each editor's register.ts  (calls register_file_editor with ext + async loaders)
    |
frame-editors/register.ts  (imports all register.ts files at startup)
    |
file-editors.ts  (wraps frame-tree registry, provides init/generate/remove API)
    |
project_actions.ts  (opens file -> initializeAsync() -> generateAsync())
```

### Current problems to fix

1. **Frame type resolution bug** -- Frame tree leaves are resolved by the **key** in `EDITOR_SPEC` (e.g., `"grid"`), not by `EditorDescription.type` (e.g., `"csv-grid"`). Example: `csv-editor/actions.ts` uses `type: "grid"` in its layout, while `csv-editor/editor.ts` declares `type: "csv-grid"` in the EditorDescription. This mismatch makes types unreliable as identifiers. **Fix: resolve by `EditorDescription.type`, not by object key.**

2. **`is_public` is legacy dead code -- remove entirely** -- Public file viewing is handled by the share server, not the frontend editor system. The `is_public` flag permeates the entire frontend editor stack: registration keying in `file-editors.ts` and `frame-tree/register.ts`, runtime switching in `CodeEditorActions._init()` (between `_init_value()` and `_init_syncstring()`), read-only mode in `CodemirrorEditor`, `SaveButton`, frame tree selection in editors like HTML/CSV. All of it is vestigial from before the share server. **Remove `is_public` from the entire frontend editor system** -- registration, runtime, components, everything.

3. **Single-entry registry** -- Both `file-editors.ts` (`file_editors[ext] = ...`) and `frame-tree/register.ts` (`REGISTRY[key] = data`) store only one editor per extension. A second registration overwrites the first. This makes priority-based resolution impossible. **Change both registries to multi-candidate (list per extension) with a resolution function.**

4. **Static only** -- Editors registered at import time, no runtime additions.

5. **`EditorType` is a closed union** -- Adding a type requires editing types.ts.

6. **Code-editor snapshots `file_associations` at import time** -- New extensions added later aren't picked up.

---

## Extension API

### File type dispatch model

Like a traditional OS, file opening follows a dispatch chain:

```
File (path/name/extension)
  → File type (resolved by extension or exact filename)
    → Default editor (one per file type, configurable)
      → Editor instance (frames, sync, actions)
```

Multiple editors can register for the same file type. The **default** is configurable per-project. Users can also "Open with..." via context menu, which shows all registered editors for that file type.

**Editor choice persistence**: When a user opens a file (including via "Open with..."), the chosen editor ID is stored in `open_files[path].editorId` (not just `ext`). This ensures that tab restore, background tab re-initialization, and session recovery all use the correct editor -- not just whichever candidate currently wins for that extension. The `editorId` flows through `project/open-file.ts` → `project_actions.ts` → `initializeAsync()`/`generateAsync()`.

**File type resolution** is handled by a **unified file-type resolver** that replaces the current scattered pattern of `filename_extension()` + `noext-${basename}` checks. The resolver handles:

- **By extension**: `.csv` → file type `"csv"`, `.md` and `.markdown` → file type `"markdown"`
- **By exact filename**: `Dockerfile`, `Makefile`, `.gitignore` → mapped to a file type (e.g., `"code"`)
- **By pattern** (future): `*.test.ts` → file type `"test"` (stretch goal)

The resolver also provides file-type metadata (syntax mode, icon, compute server eligibility) -- replacing the extension-only lookups in `filenameMode()`, `filenameIcon()`, and `excludeFromComputeServer()` in `file-associations.ts`.

The manifest declares both:

```typescript
{
  extensions: ["csv", "tsv"],           // file extensions
  filenames: ["Dockerfile", ".env"],    // exact filenames (including extensionless)
}
```

### Frame type identifiers

Frame types become structured, namespaced strings:

```
// Built-in (migrated from current short names):
"cocalc/cm"
"cocalc/jupyter"
"cocalc/terminal"
"cocalc/csv-grid"

// Third-party extensions:
"sagemath/sage-worksheet"
"example-org/custom-preview@1.0.0"
```

The frame tree resolves leaves by `EditorDescription.type` (not by EditorSpec key). This is a prerequisite refactor of CoCalc's own internals.

### Level 1: Whole-editor extension

What an extension author writes:

```typescript
// my-csv-viewer/index.ts
import {
  defineEditor,
  registerExtension,
  CodemirrorEditor,
} from "@cocalc/editor-extensions";

const extension = defineEditor({
  id: "my-org/csv-viewer",
  name: "Enhanced CSV Viewer",
  version: "1.0.0",
  extensions: ["csv", "tsv"],
  icon: "table",

  frames: {
    "my-org/csv-grid": {
      short: "Grid",
      name: "CSV Grid View",
      icon: "table",
      component: () => import("./grid-component"),
      commands: { save: true, increase_font_size: true },
    },
    "my-org/csv-raw": {
      short: "Raw",
      name: "Raw Data",
      icon: "code",
      component: CodemirrorEditor, // re-exported from SDK
      commands: { save: true, find: true, replace: true },
    },
  },

  defaultLayout: {
    direction: "col",
    type: "node",
    first: { type: "my-org/csv-grid" },
    second: { type: "my-org/csv-raw" },
  },

  // Optional: custom actions class (falls back to SDK-provided base)
  actions: () => import("./actions"),

  // Sync strategy -- SDK synthesizes Actions subclass from this
  sync: { doctype: "syncstring" },
});

// Self-registration when bundle loads
registerExtension(extension);
```

The `frames` object keys **are** the frame type identifiers (matching `EditorDescription.type`). No separate `type` field inside each frame -- the key is the type.

### Level 2: Frame extension (add frames to existing editors)

Frame extensions target editors by their **stable manifest ID**, not by file extension. This avoids ambiguity when multiple extensions map the same file type, or when an editor handles multiple extensions (e.g., `md` and `markdown`).

```typescript
import { defineFrame, registerExtension } from "@cocalc/editor-extensions";

const frame = defineFrame({
  id: "my-org/custom-preview",
  name: "Custom Markdown Preview",
  targetEditors: ["cocalc/markdown-editor"], // stable editor IDs, not file extensions

  frame: {
    type: "my-org/custom-preview",
    short: "Custom",
    name: "Custom Preview",
    icon: "eye",
    component: () => import("./custom-preview"),
    commands: { increase_font_size: true, decrease_font_size: true },
  },
});

registerExtension(frame);
```

---

## Extension Manifest

```typescript
interface EditorExtensionManifest {
  // Identity -- namespaced: "org/package-name"
  id: string;
  name: string; // human-readable
  version: string; // semver

  // What it provides
  kind: "editor" | "frame";
  extensions?: string[]; // file extensions handled (Level 1), e.g. ["csv", "tsv"]
  filenames?: string[]; // exact filenames (Level 1), e.g. ["Dockerfile", ".env"]
  targetEditors?: string[]; // editor IDs to augment (Level 2), e.g. ["cocalc/markdown-editor"]

  // Entry point
  main: string; // JS bundle path or URL

  // Capabilities
  sync?: {
    doctype: "syncstring" | "syncdb" | "none";
    primaryKeys?: string[]; // for syncdb
    stringCols?: string[]; // for syncdb
  };

  // Trust
  source: "builtin" | "admin";

  // Display
  icon?: IconRef; // see Icon Types section below
  priority?: number; // higher wins when multiple editors claim same extension

  // Bundle (for externally distributed extensions)
  bundleUrl?: string; // URL to the signed archive (.tar.gz)
}

// Icon reference types -- preserves hardened typing for built-ins
type IconRef =
  | IconName // built-in: "table", "code", etc.
  | { type: "bundle"; uri: string } // from archive: "[id]@[version]/assets/icon.svg"
  | { type: "external"; url: string }; // external URL to SVG
```

---

## Extension Registry

New directory: `frontend/extensions/`

```
frontend/extensions/
  types.ts          -- EditorExtensionManifest, related types
  registry.ts       -- ExtensionRegistry singleton
  loader.ts         -- bundle loading (wraps existing withTimeoutAndRetry)
  resolve.ts        -- resolves extension -> editor with priority chain
```

### ExtensionRegistry

- Singleton created at app startup
- First runs all static imports (existing behavior, unchanged)
- Then loads dynamically configured extensions from project-scoped / account-scoped DKV
- **Replaces** `file-editors.ts` single-entry lookup with a multi-candidate registry
- Emits events when extensions are added/removed

### Resolution order (highest priority first)

1. Per-user DKV override (`account_id` scoped, key: `ext-override:{ext}`)
2. Per-project configuration (project-scoped DKV, key: `editor-extensions`)
3. Extension with highest `priority` in manifest
4. Built-in default (current `file_associations`)

---

## Configuration Storage

### Per-project configuration (primary)

Project settings get a new section: **Editor Extensions**. This is where file extensions are mapped to custom editors. The UI lives in project settings, but the shared data is stored in a project-scoped conat DKV so collaborators see live updates immediately:

```typescript
const dkv = await webapp_client.conat_client.dkv({
  project_id,
  name: "editor-extensions",
});

dkv.set("config", {
  // Map file extension -> extension ID
  file_mappings: {
    csv: "my-org/csv-viewer",
    custom: "my-org/custom-editor",
  },
  // Installed extensions with their bundle URLs
  installed: [
    {
      id: "my-org/csv-viewer",
      bundleUrl: "https://cdn.example.com/csv-viewer@1.0.0/extension.js",
      enabled: true,
    },
  ],
  // Per-editor settings (including which extra frames to enable)
  editor_settings: {
    "my-org/csv-viewer": {
      extra_frames: ["other-org/csv-chart-frame"],
      options: {
        /* editor-specific config */
      },
    },
  },
});
```

### Per-user overrides (secondary)

Uses DKV pattern (like `frame-editor-settings.ts`):

```typescript
const dkv = await webapp_client.conat_client.dkv({
  account_id,
  name: "editor-extensions",
});
dkv.set("ext-override:csv", {
  extensionId: "my-org/csv-viewer",
  enabled: true,
});
```

### UI surfaces

- **Project settings**: "Editor Extensions" section -- install/enable/disable extensions, map file extensions to editors, configure per-editor settings (including which extra frames to add)
- **Account settings**: "Preferred editors" section -- per-user overrides when multiple editors claim an extension
- **File open**: uses the default editor for the file type. Context menu "Open with..." submenu shows all registered editors for that file type (like an OS). User choice can be saved as the new default.

---

## Distribution Model (Ideal Goal)

The end goal is that an editor extension is a **signed archive** (`.tar.gz`) containing a self-contained JS bundle, manifest, assets, and cryptographic signature. The development and distribution flow looks like this:

### Extension author workflow

1. **Source repo** -- The extension lives in a GitHub repo (or any public git host). It's a normal JS/TS project.
2. **SDK dependency** -- The repo depends on a published npm package `@cocalc/editor-extensions` (the SDK). This provides types, `defineEditor()`, `defineFrame()`, `registerExtension()`, common components (CodemirrorEditor, sync hooks, etc.), and any helpers the bundle needs at runtime.
3. **Build pipeline** -- The repo has a standard build step that:
   - Bundles all extension code, React components, styles into `extension.js`
   - Marks `@cocalc/editor-extensions` as an **external** (provided by CoCalc at runtime, not bundled)
   - Packages icons/assets as separate files in `assets/`
   - Generates `manifest.json` from the `defineEditor()` metadata
   - **Signs the archive** with the supplier's private key -> `signature.json`
   - Produces a `.tar.gz` archive containing everything
4. **Publish** -- The signed archive is hosted somewhere accessible: GitHub Releases, a CDN, etc.

### What the archive contains

```
manifest.json       -- id, name, version, extensions, icon refs, sync config
extension.js        -- self-registering JS module (calls registerExtension())
signature.json      -- { algorithm: "Ed25519", supplierKeyId, signature }
assets/             -- icons, images (referenced by manifest as bundle URIs)
  icon.svg
```

The JS bundle, when loaded:

- Calls `registerExtension()` from the SDK to declare what it provides
- Exports React components for its frames
- Can call SDK APIs: sync helpers, command registration, settings access

### What the archive does NOT contain

- React, Redux, or CoCalc internals -- provided by the host environment
- The SDK itself -- marked as external, resolved at runtime from CoCalc's global scope
- Node.js-specific code -- runs in the browser

### Bundle format

```javascript
// dist/extension.js (simplified)
// The SDK is available as a global or via import map
import {
  defineEditor,
  registerExtension,
  CodemirrorEditor,
} from "@cocalc/editor-extensions";

const extension = defineEditor({
  id: "org.example/csv-pro",
  name: "CSV Pro",
  version: "2.1.0",
  extensions: ["csv", "tsv"],
  icon: `<svg>...</svg>`, // inline SVG string
  frames: {
    /* ... */
  },
  defaultLayout: {
    /* ... */
  },
  sync: { doctype: "syncstring" },
});

// Self-registration: when the bundle loads, it registers itself
registerExtension(extension);
```

### How CoCalc loads extensions

1. **Discovery** -- The extension registry checks project settings for configured extension archive URLs
2. **Download** -- `loader.ts` fetches the `.tar.gz` archive
3. **Verify** -- Verify signature against admin-configured trusted supplier public keys. Reject if unsigned or untrusted.
4. **Extract + cache** -- Extract archive contents, cache in browser storage (IndexedDB) keyed by `[id]@[version]`. Assets become available as blob URLs.
5. **Load** -- Execute `extension.js` via dynamic `import()` or `<script>` injection
6. **Self-registration** -- The bundle calls `registerExtension()`, which adds it to the live registry
7. **Activation** -- When a user opens a file matching the extension's declared file types, the registry resolves which editor to use (respecting priority/preferences) and activates it

### Icon types

`EditorDescription.icon` currently takes an `IconName` (string literal union). We preserve that hardened typing and extend it with structured object types:

```typescript
type IconRef =
  | IconName // built-in: "table", "code", etc.
  | { type: "bundle"; uri: string } // from archive: "my-org/csv-pro@1.0.0/assets/icon.svg"
  | { type: "external"; url: string }; // external URL (fallback)
```

- **Built-in** (`IconName`): unchanged, for extensions that use CoCalc's icon set
- **Bundle** (`{ type: "bundle", uri }`): references an asset packed inside the signed archive. The archive is extracted and cached in the browser; the URI resolves to a local blob URL. Format: `[extension-id]@[version]/assets/[path]`
- **External** (`{ type: "external", url }`): direct URL to an SVG (fallback for development)

The `<Icon>` component, tabs container, and menu/title-bar code are updated to handle `IconRef` -- rendering built-in icons as before, and bundle/external icons via `<img>` or inline SVG injection.

### Local Development Server

The SDK ships a CLI for rapid local development with a watch-build-serve-reload loop:

```bash
# Start the dev server (watches + rebuilds + serves + notifies CoCalc)
npx @cocalc/editor-extensions dev

# Or manual trigger mode (no file watching)
npx @cocalc/editor-extensions dev --no-watch

# Production build + package + sign
npm run build        # compile extension.js
npm run package      # create signed .tar.gz archive
```

**What `npx @cocalc/editor-extensions dev` does:**

1. **Watch** -- Monitors `src/` and `assets/` for changes (via chokidar or similar)
2. **Rebuild** -- On change (or manual trigger with `--no-watch`), runs esbuild to produce `extension.js`, regenerates `manifest.json`
3. **Package** -- Creates an unsigned `.tar.gz` archive in memory (no signing in dev mode)
4. **Serve** -- Starts a local HTTP server (default `http://localhost:4100`) serving the archive
5. **Notify** -- Sends a WebSocket message to CoCalc's frontend telling it to re-fetch and reload the extension

**CoCalc side -- dev mode:**

- In project settings, configure an extension with a `localhost` URL
- CoCalc's `loader.ts` **skips signature verification only when both conditions are met**: (a) the URL is `localhost`, AND (b) CoCalc itself is running as a dev build (`NODE_ENV === 'development'`) or the user has an explicit "developer mode" flag in their account settings. This prevents collaborators in shared projects from loading unsigned code via localhost URLs on other users' browsers.
- CoCalc's frontend listens for the dev server's WebSocket reload signal on a well-known port
- On reload signal: re-downloads archive, re-extracts, re-registers the extension, and refreshes any open editors using it

**Typical dev workflow:**

```bash
# Terminal 1: CoCalc dev server
/home/hsy/p/cocalc-dev/cocalc-hub.sh run 2     # CoCalc on localhost:5002

# Terminal 2: Extension dev server
cd ~/p/my-extension
npx @cocalc/editor-extensions dev               # serves on localhost:4100

# In CoCalc (localhost:5002) project settings → Editor Extensions:
#   Add extension: http://localhost:4100/my-extension.tar.gz
#   (dev mode indicator shown -- unsigned, localhost)

# Now: edit src/my-component.tsx → dev server rebuilds → CoCalc auto-reloads → see changes
```

**Dev server protocol:**

```typescript
// WebSocket message from dev server to CoCalc frontend
interface DevReloadMessage {
  type: "extension-reload";
  extensionId: string;
  version: string;
  archiveUrl: string; // http://localhost:4100/my-extension.tar.gz
  timestamp: number;
}
```

CoCalc's extension registry listens on `ws://localhost:4100/ws` (configurable port). When it receives `extension-reload`, it re-fetches the archive and hot-swaps the extension. Open editors using the extension are re-rendered.

### Template repo

To make it easy to get started, we provide a template repository:

```
cocalc-extension-template/
  package.json            -- depends on @cocalc/editor-extensions; scripts: dev, build, package
  tsconfig.json
  src/
    index.ts              -- defineEditor() call + registerExtension()
    my-component.tsx      -- React component for the main frame
  assets/
    icon.svg              -- extension icon
  keys/
    supplier.key          -- private key (gitignored!)
    supplier.pub          -- public key (shared with admin)
  cocalc-extension.config.ts  -- dev server + build config (port, externals, entry point)
  dist/                   -- gitignored, built by CI
    manifest.json
    extension.js
    signature.json
    assets/icon.svg
    my-extension-1.0.0.tar.gz  -- final signed archive
  README.md               -- how to develop, build, sign, publish
```

---

## Published SDK Package: `@cocalc/editor-extensions`

Published to npm. This is what extension authors `import` from. The SDK is **thin** -- it provides types, the `defineEditor`/`defineFrame`/`registerExtension` API, and CLI tooling. It does **not** re-export `@cocalc/frontend` or other heavy packages.

Instead, heavy host packages (`@cocalc/frontend`, `@cocalc/util`, `@cocalc/conat`, `react`, `redux`) are **injected at runtime** by CoCalc. Extensions are just glue code -- their bundles are tiny because all the heavy lifting comes from the host environment.

### Runtime injection model

```
┌─────────────────────────────────────────────────────┐
│ CoCalc Host (browser)                               │
│                                                     │
│  Exposes via import map / global registry:           │
│    "react"              → CoCalc's React instance   │
│    "@cocalc/util"       → @cocalc/util package      │
│    "@cocalc/frontend"   → frontend components/hooks │
│    "@cocalc/conat"      → conat client              │
│    "@cocalc/editor-extensions" → SDK runtime API    │
│                                                     │
│  ┌───────────────────────────────────────────┐      │
│  │ Extension bundle (tiny)                    │      │
│  │                                            │      │
│  │  import { defineEditor } from              │      │
│  │    "@cocalc/editor-extensions";            │      │
│  │  import { CodemirrorEditor } from          │      │
│  │    "@cocalc/frontend/frame-editors/...";   │      │
│  │  import { useSync } from                   │      │
│  │    "@cocalc/frontend/extensions/hooks";    │      │
│  │                                            │      │
│  │  // All imports resolve to host packages   │      │
│  │  // at runtime -- nothing bundled          │      │
│  └───────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────┘
```

**How it works:**

1. Extension's build config marks `react`, `@cocalc/*` as **externals** (not bundled)
2. CoCalc's frontend exposes these packages via an [import map](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap) or a global module registry
3. When the extension's `extension.js` loads, its `import` statements resolve to the host's live packages
4. No circular dependency: SDK doesn't depend on frontend at build time; extensions get frontend at runtime

**What the SDK npm package provides (build time):**

- TypeScript types for all host APIs (so extensions get full type-checking and autocomplete)
- `defineEditor()`, `defineFrame()`, `registerExtension()` -- thin API functions
- Validation logic for manifest shape
- CLI tooling (dev server, build, package, sign)

**What the host provides (runtime):**

- React, Redux
- `@cocalc/frontend` components: CodemirrorEditor, Terminal, TimeTravel, RenderedMarkdown, etc.
- `@cocalc/frontend` hooks: useSyncValue, useSyncDB, useEditorState, etc.
- `@cocalc/util`, `@cocalc/conat`
- Actions base classes and factory

### SDK package structure

Source lives in-tree at `packages/editor-extensions/`:

```
packages/editor-extensions/
  package.json
  tsconfig.json
  index.ts              -- public exports: defineEditor, defineFrame, registerExtension
  define-editor.ts      -- validates + normalizes editor definition
  define-frame.ts       -- validates + normalizes frame definition
  register.ts           -- registerExtension() -- called by bundles to self-register
  types.ts              -- EditorExtensionManifest, EditorDefinition, FrameDefinition
  validate.ts           -- runtime validation of manifest shape

  # Contract type interfaces (compile-time only, no runtime code):
  # Extensions compile against these .d.ts files for full type-checking.
  # At runtime, the real implementations are injected by the CoCalc host.
  typings/
    frontend.d.ts       -- type declarations for @cocalc/frontend APIs available to extensions
    util.d.ts           -- type declarations for @cocalc/util
    conat.d.ts          -- type declarations for @cocalc/conat
    react.d.ts          -- re-export of React types (peer dep)

  # CLI tooling (runs in Node, not browser):
  signing/
    keygen.ts           -- Ed25519 key pair generation
    sign.ts             -- sign archive contents
    verify.ts           -- verify signature against public key
  cli/
    dev.ts              -- `npx @cocalc/editor-extensions dev` entry point
    build.ts            -- `npx @cocalc/editor-extensions build` entry point
    package.ts          -- `npx @cocalc/editor-extensions package` (archive + sign)
    dev-server.ts       -- HTTP server for .tar.gz + WebSocket for reload notifications
```

### Host-side injection setup

CoCalc's frontend (in `packages/static` webpack/esbuild config or at app startup) exposes packages:

```typescript
// In CoCalc's frontend initialization:
import { setupExtensionImportMap } from "@cocalc/frontend/extensions/import-map";

setupExtensionImportMap({
  react: React,
  "@cocalc/util": () => import("@cocalc/util"),
  "@cocalc/conat": () => import("@cocalc/conat"),
  "@cocalc/frontend/frame-editors/code-editor/codemirror-editor": () =>
    import("./frame-editors/code-editor/codemirror-editor"),
  "@cocalc/frontend/extensions/hooks": () => import("./extensions/hooks"),
  "@cocalc/editor-extensions": () => import("@cocalc/editor-extensions"),
  // ... more as needed
});
```

Extensions import these paths normally in their source code. At build time, they get type-checking from the SDK's type declarations. At runtime, the imports resolve to the host's live modules.

### What `defineEditor()` does

- Validates manifest shape at definition time (fail fast with clear errors)
- Normalizes command sets (array -> `{ [name]: true }` object)
- Uses frame object keys as `EditorDescription.type` (key = type, no separate field)
- If no `actions` provided, uses `actionsFactory` to **synthesize an Actions subclass** from the declarative `sync` and `defaultLayout` config
- Returns a typed object ready for `registerExtension()`

### What `defineFrame()` does

- Produces an `EditorDescription`-compatible object
- Validates that frame `type` is a namespaced string
- Wraps component in async loading

### What `registerExtension()` does

- Called by the bundle at load time (self-registration pattern)
- Adds the extension to the live `ExtensionRegistry` singleton
- Triggers re-evaluation of file-extension mappings
- If the extension provides icons as SVG/data URIs, registers them with the icon system

### Actions synthesis

When an extension provides `sync: { doctype: "syncstring" }` and `defaultLayout` but no custom `actions`, the SDK's `actionsFactory` generates an Actions subclass automatically:

```typescript
// Internally in actionsFactory:
class GeneratedActions extends CodeEditorActions {
  _raw_default_frame_tree() {
    return manifest.defaultLayout;
  }
  _init2(): void {
    this._init_syncstring_value();
  }
}
```

This means simple editors (like CSV) need zero Actions code. Complex editors can still provide a custom class.

---

## Migration Strategy

Existing editors continue to work unchanged. Migration is opt-in and incremental.

### Prerequisite refactors (Phase 0)

These changes fix bugs/limitations in CoCalc's own internals to make the extension mechanism possible:

1. **Fix frame type resolution** -- Change frame tree leaf resolution from EditorSpec key to `EditorDescription.type`. This means:
   - `frame-tree.tsx` and `leaf.tsx`: look up frames by `type` field, not object key
   - `code-editor/actions.ts`: `set_frame_type()` uses `type` field
   - All existing editors: ensure EditorSpec keys match their `EditorDescription.type` values (fix the `"grid"` vs `"csv-grid"` inconsistency etc.)
   - Widen `EditorType` from string union to `string`

2. **Remove `is_public` from registration** -- Remove from `file-editors.ts`, `frame-tree/register.ts`, and all `register.ts` files. Dead code cleanup.

3. **Multi-candidate registry** -- Both `file-editors.ts` and `frame-tree/register.ts` store only one editor per extension. Change both to multi-candidate (`spec[]` per extension) with a resolution function.

4. **Make `file_associations` observable** -- Add event emission so `code-editor/register.ts` can react to new extensions instead of snapshotting at import time.

### Migration per editor

Each editor can be converted independently. The conversion for a simple editor like CSV:

**Before** (3 files, ~120 lines):

- `register.ts` -- calls `register_file_editor`
- `editor.ts` -- defines EditorSpec + `createEditor()`
- `actions.ts` -- extends CodeEditorActions with `_raw_default_frame_tree()` + `_init2()`

**After** (1 file, ~40 lines):

- `index.ts` -- single `defineEditor()` call. No actions.ts needed because the SDK synthesizes Actions from `sync` + `defaultLayout`.

---

## Security Model

Extensions are like apps installed in an OS -- they run with full privileges in the browser context. They must be trusted. The trust model uses **cryptographic signing** with admin-managed supplier keys.

### Signed archive format

Extensions are distributed as signed `.tar.gz` archives (not bare `.js` files):

```
my-extension-1.0.0.tar.gz
  manifest.json          -- extension manifest (id, version, extensions, icon refs, etc.)
  extension.js           -- the compiled JS bundle
  signature.json         -- { algorithm, supplierKeyId, signature }
  assets/                -- icons, images, etc. (optional)
    icon.svg
    icon-small.svg
```

The **signature** covers the entire archive content (all files except `signature.json` itself). Verification process:

1. Extract archive
2. Compute hash of all files (deterministic order, excluding `signature.json`)
3. Verify hash against `signature.json` using the supplier's public key
4. Check that the supplier's key ID is in the admin's trusted keys list

### Trust levels

- **Builtin** (`source: "builtin"`): ships with CoCalc, loaded via static imports. No signature verification needed.
- **Signed** (`source: "signed"`): distributed as signed archives. The admin manages a list of **trusted supplier public keys** in the admin settings. Each supplier (organization or individual) has a key pair. The frontend verifies the archive signature against the supplier's public key before loading.

### Admin configuration

Admin settings include:

```typescript
{
  "trusted_extension_suppliers": [
    {
      "id": "sagemath",
      "name": "SageMath",
      "publicKey": "-----BEGIN PUBLIC KEY-----\n...",
      "enabled": true
    },
    {
      "id": "example-org",
      "name": "Example Organization",
      "publicKey": "-----BEGIN PUBLIC KEY-----\n...",
      "enabled": true
    }
  ]
}
```

### Signing workflow (for extension authors)

1. Author generates a key pair (e.g., Ed25519)
2. Author gives public key to CoCalc admin, who adds it to trusted suppliers
3. Build pipeline produces the archive and signs it with the private key
4. Signed archive is hosted (GitHub Releases, CDN, etc.)
5. Project admin configures the archive URL in project settings
6. Frontend downloads, verifies signature, extracts, and loads

### Runtime enforcement

- `loader.ts` downloads the archive, verifies signature before extracting
- Unsigned or invalid-signature archives are rejected with a clear error
- Extensions run in the same JS context (no iframe sandbox) -- acceptable because all loaded extensions are cryptographically verified
- Archive contents are cached in browser storage (IndexedDB) keyed by `[id]@[version]`

---

## Implementation Phases

### Phase 0: Internal Refactors

**Goal**: Fix CoCalc's own frame editor internals to make them extensible. No new extension API yet -- just prerequisite cleanups.

- [ ] Fix frame type resolution: resolve by `EditorDescription.type`, not EditorSpec key
  - Update `frame-tree.tsx`, `leaf.tsx`, `code-editor/actions.ts`
  - Audit all editors: ensure EditorSpec keys match their `type` values
  - Widen `EditorType` to `string` in `frame-tree/types.ts:90`
- [ ] Remove `is_public` from the entire frontend editor system (legacy from pre-share-server era)
  - **Registration layer**:
    - `file-editors.ts`: remove `is_public` dimension from `file_editors` object, `register_file_editor()`, `get_ed()`, `generateAsync()`, `initializeAsync()`
    - `frame-tree/register.ts`: remove `is_public` from `Register`/`AsyncRegister` interfaces, `REGISTRY` keying, `get_file_editor()`
    - All `*-editor/register.ts` files: remove `is_public` parameter from registration calls
    - All callers of `get_file_editor(ext, is_public)` and `get_ed(...)`: remove the `is_public` argument
    - `frame-tree.tsx`, `code-editor-manager.ts`: update `get_file_editor()` calls
  - **Runtime layer**:
    - `code-editor/actions.ts`: remove `_init()` branch that switches between `_init_value()` and `_init_syncstring()` based on `is_public`; remove `_init_value()` entirely
    - `code-editor/actions.ts`: remove `is_public` from `CodeEditorState` interface
    - All editors with public-specific frame trees or behavior (HTML, CSV, etc.): remove those branches
    - `CodemirrorEditor`: remove `is_public` read-only mode logic
    - `SaveButton` and other components: remove `is_public` conditional rendering
    - Grep for all remaining `is_public` references in `src/packages/frontend/frame-editors/` and remove
  - **Open-file plumbing**:
    - `project/open-file.ts`: remove `component.is_public` storage
    - `project_actions.ts`: remove `is_public` from tab reopening, saving, and editor removal paths
- [ ] Assign stable manifest IDs to all built-in editors
  - Add `id` field to `Register`/`AsyncRegister` interfaces in `frame-tree/register.ts`
  - Assign IDs to all built-in registrations (e.g., `"cocalc/code-editor"`, `"cocalc/markdown-editor"`, `"cocalc/jupyter-editor"`, `"cocalc/csv-editor"`, etc.)
  - Store IDs in the registry so `targetEditors` (Phase 3) has something to match against
  - This is a prerequisite for Level 2 frame extensions
- [ ] Persist editor ID per tab in the open-file flow
  - Add `editorId` to `open_files[path]` in `project/open-file.ts`
  - Flow `editorId` through `project_actions.ts` → `initializeAsync()` → `generateAsync()`
  - Tab restore / background re-initialization uses `editorId` (not just `ext`) to pick the correct editor
- [ ] Change both registries to multi-candidate (list per extension, not single entry)
  - `file-editors.ts`: `file_editors[ext] = FileEditorSpec[]` with resolution function
  - `frame-tree/register.ts`: `REGISTRY[ext] = data[]` with resolution function
- [ ] Create unified file-type resolver
  - Replaces scattered `filename_extension()` + `noext-${basename}` pattern
  - Handles both extensions and exact filenames
  - Provides file-type metadata: syntax mode, icon, compute server eligibility
  - Replaces extension-only lookups in `filenameMode()`, `filenameIcon()`, `excludeFromComputeServer()`
- [ ] Make `file_associations` observable; fix `code-editor/register.ts` snapshot timing

**Files to modify**:

- `src/packages/frontend/frame-editors/frame-tree/types.ts`
- `src/packages/frontend/frame-editors/frame-tree/frame-tree.tsx`
- `src/packages/frontend/frame-editors/frame-tree/leaf.tsx`
- `src/packages/frontend/frame-editors/code-editor/actions.ts`
- `src/packages/frontend/file-editors.ts`
- `src/packages/frontend/frame-editors/frame-tree/register.ts`
- `src/packages/frontend/frame-editors/code-editor/register.ts`
- `src/packages/frontend/file-associations.ts`
- `src/packages/frontend/project/open-file.ts` (is_public removal + editorId persistence)
- `src/packages/frontend/project_actions.ts` (is_public removal + editorId flow)
- All `*-editor/register.ts` files (remove `is_public`, add `id`)
- All editors with key/type mismatches

### Phase 1: SDK Package + Registry

**Goal**: Create the `@cocalc/editor-extensions` SDK package (thin: types + API + CLI) and the extension registry with host-side runtime injection.

- [ ] Create `packages/editor-extensions/` with thin SDK:
  - `defineEditor()`, `defineFrame()`, `registerExtension()` -- API functions
  - Contract type declarations (`.d.ts`) for host APIs: `@cocalc/frontend`, `@cocalc/util`, `@cocalc/conat`
  - Actions factory: synthesize Actions subclass from declarative config
  - Validation logic for manifest shape
- [ ] Create `frontend/extensions/` registry infrastructure:
  - `registry.ts` -- ExtensionRegistry singleton
  - `loader.ts` -- bundle loading with timeout/retry
  - `resolve.ts` -- priority-based resolution
  - `types.ts` -- ExtensionManifest
- [ ] Extend icon system with `IconRef` type (built-in | bundle | external)
  - Update `EditorDescription.icon` type in `frame-tree/types.ts`
  - Full audit + update of ALL `EditorDescription.icon` consumers:
    - `<Icon>` component
    - Tabs container (`tabs-container.tsx`)
    - Title bar / menu
    - Frame-type picker and application menu (`frame-tree/commands/manage.tsx`)
    - Any other code that passes `EditorDescription.icon` to `<Icon name={...}>`
- [ ] Set up host-side import map / module registry for runtime injection
  - `frontend/extensions/import-map.ts`: expose `react`, `@cocalc/util`, `@cocalc/frontend/*`, etc.
  - Configure webpack/esbuild in `packages/static` to expose these as externals
- [ ] Set up `@cocalc/editor-extensions` as externally resolvable at runtime (global or import map)
- [ ] Implement `registerExtension()` self-registration entry point
- [ ] Implement archive loading in `loader.ts`:
  - Download `.tar.gz`, extract, verify signature
  - Cache extracted contents in IndexedDB keyed by `[id]@[version]`
  - Resolve bundle asset URIs to blob URLs
- [ ] Design and implement signing/verification schema:
  - Ed25519 key pair generation tooling (CLI helper in SDK)
  - `signature.json` format: `{ algorithm, supplierKeyId, signature }`
  - Verification: deterministic hash of all archive files, verify against supplier public key
  - Admin settings: trusted supplier public keys list
- [ ] Admin UI: manage trusted extension suppliers (public keys)
- [ ] Unit tests for defineEditor/defineFrame/actionsFactory/signature verification

**Files to create**:

- `src/packages/editor-extensions/package.json` (publishable as `@cocalc/editor-extensions`)
- `src/packages/editor-extensions/tsconfig.json`
- `src/packages/editor-extensions/index.ts`
- `src/packages/editor-extensions/define-editor.ts`
- `src/packages/editor-extensions/define-frame.ts`
- `src/packages/editor-extensions/register.ts`
- `src/packages/editor-extensions/types.ts`
- `src/packages/editor-extensions/validate.ts`
- `src/packages/editor-extensions/typings/` (type-only declarations for host APIs)
- `src/packages/editor-extensions/signing/` (key generation, signing, verification)
- `src/packages/editor-extensions/cli/` (dev server, build, package commands)
- `src/packages/frontend/extensions/types.ts`
- `src/packages/frontend/extensions/registry.ts`
- `src/packages/frontend/extensions/loader.ts` (archive download, verify, extract, cache)
- `src/packages/frontend/extensions/resolve.ts`
- `src/packages/frontend/extensions/import-map.ts` (host-side module injection for extensions)
- `src/packages/frontend/extensions/hooks.ts` (useSyncValue, useSyncDB, useEditorState -- for extensions)
- `src/packages/frontend/admin/trusted-suppliers.tsx` (admin UI for supplier keys)

### Phase 2: First Extension Conversion + Dynamic Loading

**Goal**: Convert CSV editor to `defineEditor()` AND prove dynamic loading works end-to-end with signed archives and the dev server.

- [ ] Write CSV editor as a `defineEditor()` + `registerExtension()` call
  - No separate actions.ts -- SDK synthesizes Actions from `sync` + `defaultLayout`
  - Verify frame tree, sync, reference counting all work
- [ ] Add dynamic extension loading path after static imports
- [ ] Implement dev server CLI (`npx @cocalc/editor-extensions dev`)
  - File watching + rebuild + serve + WebSocket reload notification
  - `--no-watch` mode for manual trigger
- [ ] CoCalc frontend: listen for dev server WebSocket reload signals
  - Skip signature verification only when: localhost URL AND (dev build OR user has developer-mode flag)
  - Re-fetch, re-extract, re-register on reload signal
- [ ] Add project settings UI: "Editor Extensions" section (per-project, shared by all project users)
  - Backed by project-scoped conat DKV (`project_id`, name: `editor-extensions`), not `projects.settings`
  - Install/enable/disable extensions by archive URL
  - Map file extensions to editors
  - Shows verification status (signed by which supplier, or "dev mode" for localhost)
- [ ] Add account settings UI: per-user editor preference overrides (when multiple editors claim an extension)
- [ ] End-to-end test: package CSV editor as a signed archive, load via project settings, open a .csv file
- [ ] End-to-end dev test: run dev server, configure localhost URL, edit code, see auto-reload

**Files to modify**:

- `src/packages/frontend/frame-editors/csv-editor/` (rewrite to use SDK)
- `src/packages/frontend/frame-editors/register.ts` (add dynamic loading path)

**Files to create**:

- `src/packages/frontend/project/settings/editor-extensions.tsx`
- `src/packages/frontend/account/editor-extensions.tsx`
- `src/packages/frontend/extensions/dev-reload-listener.ts` (WebSocket client for dev server)
- `src/packages/editor-extensions/cli/dev.ts`
- `src/packages/editor-extensions/cli/dev-server.ts`

### Phase 3: Frame-Level Extensions

**Goal**: Enable Level 2 extensions that inject frames into existing editors.

- [ ] Implement `defineFrame()` registration path in the registry
- [ ] Make `EditorSpec` composable: base spec + contributed frames
- [ ] Project settings: per-editor "extra frames" configuration (which contributed frames to enable)
- [ ] Test: add a custom preview frame to markdown editor via extension

### Phase 4: Migration + Distribution

**Goal**: Convert existing editors, publish SDK, create template.

- [ ] Publish `@cocalc/editor-extensions` to npm
- [ ] Create template repo (`cocalc-extension-template`) with build + dev + sign config
- [ ] Write extension developer documentation with tutorial (getting started, dev workflow, signing, publishing)
- [ ] Convert existing editors one-by-one (markdown, HTML, LaTeX, etc.)
- [ ] Add 2-3 example extensions as separate repos using the template

---

## Verification Plan

After each phase:

1. **Build**: `pnpm build` in `packages/editor-extensions`, then `pnpm build-dev` in `packages/static`
2. **Unit tests**: run tests for the new package (`packages/editor-extensions`)
3. **Manual test**: open a CSV file in the dev server, verify grid + raw views work, verify sync
4. **Regression**: open existing editors (code, Jupyter, markdown, LaTeX) and verify they still work
5. **Dynamic loading** (Phase 2+): add an extension via project settings, verify it appears as an editor option

---

## Open Questions

1. **Package name**: `editor-extensions` vs `editor-sdk` vs `editor-plugins`? Using `editor-extensions` for now since it describes both the mechanism and the authoring SDK.

2. **Frame extension composition**: When a Level 2 extension adds a frame to an existing editor, should it appear in the frame picker automatically, or require the user to enable it via project settings? Suggest: controlled via per-editor settings in project configuration (Phase 3).

3. **Marketplace**: A curated registry/directory of extensions. Out of scope for initial implementation but the signing infrastructure supports it -- suppliers are already identified by public key.

4. **SDK versioning**: When `@cocalc/editor-extensions` is published to npm, extensions pin to a version. CoCalc ships a runtime version. How do we handle version mismatches? Options: (a) semver compatibility -- extensions declare minimum SDK version in manifest, CoCalc rejects incompatible ones; (b) adapter layer in the registry that bridges minor differences.

5. **React version coupling**: Extensions bundle their own components but use CoCalc's React instance. This means extensions must be compatible with CoCalc's React version. Document this clearly; the template repo should pin a compatible React version as a peer dependency.

6. **Namespaced type format**: Exact format for frame type identifiers -- `org/name` vs `org/name@version` vs URLs. Need to decide on validation rules and whether version is part of the type or only in the manifest.

7. **Dev server port conflicts**: When developing multiple extensions simultaneously, each needs its own port. The dev server should auto-increment or accept `--port` flag. CoCalc needs to listen on multiple WebSocket ports or use a single multiplexed connection.

## Resolved Decisions

- **`is_public`**: Remove entirely -- registration AND runtime. Public file viewing is handled by the share server.
- **Frame extension targeting**: By stable editor manifest ID (e.g., `"cocalc/markdown-editor"`), not file extensions.
- **Exact filenames**: Manifest supports `filenames?: string[]` for Dockerfile, .env, etc.
- **File dispatch**: OS-style -- file type → default editor, with "Open with..." context menu for alternatives.
- **SDK architecture**: Thin SDK (types + API + CLI). Heavy packages injected at runtime via import map. No circular deps.
- **Icon typing**: Preserve `IconName` literal union for built-ins, extend with `{ type: "bundle" | "external", ... }` object types. No string heuristics.
- **Extension hot-reload**: Yes, via WebSocket from dev server to CoCalc frontend. Part of Phase 2.
- **Bundle format**: Signed `.tar.gz` archives, not bare `.js` files. Contains manifest, code, assets, signature.
- **Trust model**: Ed25519 signing. Admin manages trusted supplier public keys. `localhost` URLs skip verification only on dev builds or with explicit developer-mode flag.
- **Editor IDs**: All editors (built-in and extensions) have stable manifest IDs. Stored per-tab for "Open with..." persistence.
- **File-type resolution**: Unified resolver handles extensions, exact filenames, and metadata (mode, icon, etc.).
- **Configuration scope**: Per-project is primary (all users in project see same extensions). Per-user overrides for editor preference when multiple editors claim an extension.
