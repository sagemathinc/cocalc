# Project Files: Explorer, Flyout, and Browsing Paths

> **Maintenance note**: Update this file when the file explorer layout,
> flyout panel, browsing-path model, file actions, drag-and-drop, or
> localStorage persistence patterns change.

Package: `packages/frontend`
Build: `cd packages/static && pnpm build-dev`

## Overview

File management is central to every CoCalc project. Users browse, open,
create, upload, move, copy, compress, download, and delete files through
two independent UI surfaces that share a single Redux store per project:

```
┌─────────────────────────────────────────────────────────┐
│  Project Page                                           │
│  ┌──────────────────────────────┐  ┌──────────────────┐ │
│  │  Explorer (full page)        │  │  Flyout (sidebar) │ │
│  │  ┌──────┐ ┌───────────────┐  │  │                  │ │
│  │  │ Tree │ │ File Listing  │  │  │  File Listing    │ │
│  │  │Panel │ │ (TableVirtuoso│  │  │  (Virtuoso)      │ │
│  │  │      │ │  + DnD)       │  │  │                  │ │
│  │  └──────┘ └───────────────┘  │  │                  │ │
│  └──────────────────────────────┘  └──────────────────┘ │
│                                                         │
│  ┌────────────────────────────────────────────────────┐  │
│  │  File Action Modal (rename, delete, move, copy,    │  │
│  │  compress, download, share)                        │  │
│  └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

- **Explorer** — the main file browser, shown when the "Files" tab is active.
  Has a resizable directory tree panel on the left and a virtual-scrolling
  file table on the right. Supports drag-and-drop, context menus, inline
  rename, type/extension filtering, and breadcrumb navigation.

- **Flyout** — a narrow sidebar panel that can remain visible while editing
  files. Shows a compact file listing with the same navigation, filtering,
  and file-action capabilities as the explorer.

Both panels maintain **independent browsing paths** so the user can browse
one directory in the explorer while keeping the flyout pointed at another.

## The Three-Path Model

A project has three directory-path concepts in its Redux store
(`ProjectStoreState` in `project_store.ts`):

| Redux key                | Meaning                                                                                                            | Persisted to                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `current_path`           | Directory of the **active file tab**. Updated by `set_current_path()` when the user opens a file or switches tabs. | URL (browser address bar)                       |
| `explorer_browsing_path` | The directory the **explorer** is showing. Independent of which file tab is active.                                | `localStorage` (`${project_id}::explorer` JSON) |
| `flyout_browsing_path`   | The directory the **flyout** is showing. Independent of both the explorer and the active tab.                      | `localStorage` (`${project_id}::flyout` JSON)   |

### Why three paths?

Historically there was only `current_path`, and it served double duty: it
was the directory shown in the file listing AND the directory implied by the
active file tab. This coupling meant that switching between file tabs would
jump the file listing to a different directory — disorienting when the user
was in the middle of browsing.

The decoupled model lets each panel remember where the user was browsing.
The `current_path` still exists for legacy code and for the "Current
directory follows files" account setting.

### "Current directory follows files" setting

Account setting: `other_settings.follow_current_path`

When **enabled**: every file-tab switch propagates `current_path` into both
`explorer_browsing_path` and `flyout_browsing_path`, giving the old
follow-the-tab behavior. This happens in `set_active_tab()` in
`project_actions.ts`.

When **disabled**: `current_path` still updates (for URL and legacy code),
but the browsing paths only change when the user explicitly navigates within
a panel.

### Initialization on page load

Both panels use the same pattern (see `explorer.tsx` and
`use-flyout-navigation.ts`):

1. On first mount, the browsing path is `null` (not yet initialized).
2. An `useEffect` waits for the account store to be ready.
3. If `follow_current_path` is on → start at `current_path`.
4. If off → restore from localStorage via `getInitialBrowsingPath()`.
5. Fetch the directory listing and start watching the directory.

### Navigation helper

`navigate-browsing-path.ts` provides `navigateBrowsingPath()`, used by both
panels. It:

- Normalizes ".." segments
- Computes the history path (for breadcrumb depth)
- Sets Redux state (`explorer_browsing_path` or `flyout_browsing_path`)
- Persists to localStorage
- Watches the directory for push-based listing updates
- Fetches the listing immediately
- Clears checked-file selection

## "+New" Path Model

The "+New" UI (for creating new files) exists in two forms — a **flyout** panel
and a **full page** — each with its own independent current directory:

| Redux key         | Meaning                                           | Fallback          |
| ----------------- | ------------------------------------------------- | ----------------- |
| `flyout_new_path` | Directory shown in the +New **flyout** panel      | `current_path`    |
| `new_page_path`   | Directory shown in the +New **full page** tab     | `current_path`    |

Both are `string | undefined` in `ProjectStoreState` (`project_store.ts`).
When `undefined`, the component falls back to `current_path`:

```typescript
// In flyouts/new.tsx
const current_path = flyout_new_path ?? redux_current_path;

// In new/new-file-page.tsx
const current_path = new_page_path ?? redux_current_path;
```

### How +New paths get updated

| Source                                     | Updates                                      |
| ------------------------------------------ | -------------------------------------------- |
| PathNavigator in +New flyout               | `flyout_new_path`                            |
| PathNavigator in +New full page            | `new_page_path`                              |
| Explorer browsing (`navigateBrowsingPath`) | `new_page_path` (piggybacks on explorer nav) |
| Flyout browsing (`navigateBrowsingPath`)   | `flyout_new_path` (piggybacks on flyout nav) |
| Home button click                          | Both reset to `""`                           |
| Deep-link URL navigation to `/new/...`     | Both set to the URL path                     |
| Frame editor File → +New menu             | `flyout_new_path` only (flyout is what opens) |

### Frame editor File → +New interaction

When a user clicks **File → "+ New"** in a frame editor, the action
(`show_file_action_panel` with `action: "new"`, `source: "editor"`)
opens the +New flyout and sets `flyout_new_path` to the directory of the
file being edited. This ensures the new file will be created next to the
current one. Only the flyout path is updated because the flyout is the
variant that opens; `new_page_path` (full-page +New) is left untouched.

This directory override only happens when `source === "editor"` (i.e., the
frame editor's File menu). Other +New entry points (the + tab button,
explorer "New" button, etc.) do not change these paths — they rely on the
existing browsing state or the `follow_current_path` preference.

## File Listing Components

### Explorer table

`packages/frontend/project/explorer/file-listing/`

The explorer uses `react-virtuoso` `TableVirtuoso` for efficient rendering
of large directories (500+ files):

| File                     | Purpose                                                   |
| ------------------------ | --------------------------------------------------------- |
| `file-listing.tsx`       | Main component: columns, sorting, context menu, selection |
| `file-listing-row.tsx`   | Custom `<tr>` components for DnD (drag + folder drop)     |
| `file-listing-ctx.tsx`   | Context menu builder (`makeContextMenu()`)                |
| `file-listing-utils.tsx` | Icon/name/date rendering helpers                          |
| `types.ts`               | `FileEntry`, `VirtualEntry`, `PeekEntry` type definitions |
| `consts.ts`              | Column widths                                             |
| `utils.ts`               | Sorting, filtering, extension lists                       |

**Key design constraint**: Virtuoso uses referential equality on its
`components` prop. The `VIRTUOSO_COMPONENTS` object and sub-components
(`VirtuosoTable`, `VirtuosoTableHead`, `VirtualTableRow`) are defined at
**module level** — not inside a component — to prevent infinite
unmount/remount loops.

### Flyout listing

`packages/frontend/project/page/flyouts/files.tsx`

Uses plain `react-virtuoso` `Virtuoso` (not table mode) with a custom
`FileListItem` row component. The flyout has its own sort state
(persisted via Conat DKV settings, not Redux) and its own hidden-files
toggle (local `useState`, not shared with explorer).

## File Actions

File actions are operations triggered on the set of **checked files**
(`checked_files` in Redux, an `immutable.Set<string>` of full paths).

### Action types

Defined in `packages/frontend/project-file.ts`:

```
rename | duplicate | move | copy | share | delete | download | compress
```

### Action flow

1. User checks files (checkbox click, shift-select, or context menu).
2. User triggers an action (toolbar button, context menu, keyboard shortcut).
3. `actions.set_file_action(action)` stores the action type in Redux.
4. `FileActionModal` (`project/file-action-modal.tsx`) opens, rendering
   the appropriate `ActionBox` sub-component.
5. The modal footer has the submit button; forms use `htmlType="submit"`
   with a shared `formId` so the modal button submits the inner form.
6. On success, the modal clears `file_action` and unchecks all files.

### Path derivation in file actions

**Critical pattern**: file action components derive the working directory
from the checked files themselves, NOT from any browsing-path Redux key:

```typescript
const files = checked_files.toArray();
const path = files.length > 0 ? path_split(files[0]).head : "";
```

This makes actions **context-agnostic** — they work correctly regardless of
whether the action was triggered from the explorer, the flyout, or a
context menu, and regardless of what `current_path` happens to be.

Components that follow this pattern:

- `download.tsx` — zip archive creation and single-file download
- `create-archive.tsx` — compress to zip
- `file-action-modal.tsx` — delete, move, copy (derives `current_path` prop)
- `dnd/file-dnd-provider.tsx` — DnD move/copy refresh

### `fetch_directory_listing()` caveat

`actions.fetch_directory_listing()` without a `path` argument falls back to
`store.get("current_path")` internally. Always pass an explicit `{ path }`
when calling from a context where the browsing path may differ from
`current_path`.

## Quick Cut / Copy / Paste (File Clipboard)

Gmail-style hover buttons for cut, copy, paste, and delete appear on each
file row in both the explorer and flyout. These buttons overlay the filename
area (CSS `visibility: hidden` / `visible` on hover, with `transition: none`
to prevent fade artefacts during scroll).

### Global clipboard state

Clipboard state lives on the **page store** (`PageState.file_clipboard`) so
it persists across projects:

```typescript
file_clipboard?: {
  mode: "copy" | "cut";
  files: Array<{ project_id: string; path: string }>;
};
```

Helper functions in `file-clipboard/actions.ts` read/write this via
`redux.getActions("page").setState()`. Because the store wraps plain objects
in ImmutableJS Maps, `getClipboard()` calls `.toJS()` when reading back.

### Clipboard pill

When the clipboard is non-empty a pill badge appears in the explorer info
row (`ActionBarInfo`) and flyout header, showing e.g. "2 files selected for
copy ✕". Next to it a green "Paste here" button triggers the paste.

### Paste semantics

- **Same project, copy mode** → `ProjectActions.copy_paths()`
- **Same project, cut mode** → `ProjectActions.move_files()`
- **Cross-project, copy mode** → `ProjectActions.copy_paths_between_projects()`
- **Cross-project, cut mode** → copy first, then `delete_files()` on source

Files are grouped by source `project_id`, so a mixed clipboard (files from
multiple projects) is handled correctly.

After paste: copy mode preserves the clipboard (paste again); cut mode
clears it.

### Hover paste button

The paste icon also appears in the per-row hover buttons (disabled when
clipboard is empty). Clicking paste on a **directory row** pastes into that
directory; on a **file row** it pastes into the current browsing directory.

### Visual highlighting

Files present in the clipboard get the `cc-explorer-row-checked` class
(explorer) or `selected` style (flyout), giving them the same blue
highlight as checkbox-selected files.

### Key files

| File                             | Role                                    |
| -------------------------------- | --------------------------------------- |
| `file-clipboard/actions.ts`     | addToCopy, addToCut, clear, pasteHere   |
| `file-clipboard/hook.ts`        | useFileClipboard, useClipboardPathSet   |
| `file-clipboard/quick-actions.tsx` | QuickActionButtons component          |
| `file-clipboard/clipboard-pill.tsx` | ClipboardPill status badge           |
| `app/store.ts`                   | PageState.file_clipboard type           |

## Drag and Drop

`packages/frontend/project/explorer/dnd/file-dnd-provider.tsx`

Uses `@dnd-kit/core`. The `FileDndProvider` wraps both explorer and flyout.
It now shares the common DnD foundation in
`packages/frontend/components/dnd/` with the frame editor DnD implementation,
so drag activation behavior, overlay positioning, and overlay styling stay
consistent across explorer and frame-editor interactions. See also
`docs/frame-editor-dnd.md`.

Shared pieces imported by the explorer:

- `MOUSE_SENSOR_OPTIONS`
- `TOUCH_SENSOR_OPTIONS`
- `DRAG_OVERLAY_MODIFIERS`
- `DragOverlayContent`

- **Drag sources**: file/folder rows (`useFileDrag`)
- **Drop targets**: folder rows, breadcrumb segments, ".." row, background
  area (`useFolderDrop`)
- **Modifier key**: Hold Shift to copy instead of move
- **Multi-file**: dragging a checked file drags the entire checked set
- After drop: refreshes both source and destination directory listings

## Directory Tree

`packages/frontend/project/explorer/directory-tree.tsx`

A resizable panel showing the project's directory hierarchy as an antd
`<Tree>`. The tree is independent of the file listing — clicking a tree
node navigates the explorer's browsing path.

State is persisted to localStorage as part of the `${project_id}::explorer`
JSON blob:

```typescript
interface LSExplorer {
  directory?: string; // explorer's last browsing directory
  tree?: {
    visible?: boolean; // tree panel shown/hidden
    width?: number; // panel width in px
    expanded_keys?: string[]; // expanded tree nodes (max 20)
    scroll_top?: number; // scroll position
  };
}
```

## localStorage Persistence

Two JSON blobs per project, accessed via `@cocalc/frontend/misc/local-storage-typed`:

| Key pattern               | Contents                                                                                                | Managed by                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `${project_id}::explorer` | `LSExplorer` — browsing directory + tree panel state                                                    | `directory-tree.tsx`            |
| `${project_id}::flyout`   | `LSFlyout` — browsing directory + flyout UI state (width, expanded tab, scroll positions, sort, filter) | `project/page/flyouts/state.ts` |

The typed wrapper prefixes all keys with `appBasePath::` (e.g.
`/::abc123::explorer` in the browser).

## File Upload

`packages/frontend/file-upload.tsx` provides `FileUploadWrapper`, used by
both explorer and flyout. The upload target directory is the panel's
current browsing path. On completion, the wrapper calls
`fetch_directory_listing({ path })` with an explicit path to refresh the
correct directory.

## Key Source Files

| File                                             | Description                                                   |
| ------------------------------------------------ | ------------------------------------------------------------- |
| `project/explorer/explorer.tsx`                  | Explorer top-level: layout, init, toolbar, path state         |
| `project/explorer/file-listing/file-listing.tsx` | Virtual-scrolling file table                                  |
| `project/explorer/directory-tree.tsx`            | Tree panel + LS persistence                                   |
| `project/explorer/navigate-browsing-path.ts`     | Shared navigation logic for both panels                       |
| `project/explorer/dnd/file-dnd-provider.tsx`     | Drag-and-drop infrastructure                                  |
| `project/explorer/action-box.tsx`                | File action form components                                   |
| `project/file-action-modal.tsx`                  | Modal wrapper for file actions                                |
| `project/page/flyouts/files.tsx`                 | Flyout file listing                                           |
| `project/page/flyouts/use-flyout-navigation.ts`  | Flyout browsing path hook                                     |
| `project/page/flyouts/state.ts`                  | Flyout LS persistence                                         |
| `project/page/flyouts/files-header.tsx`          | Flyout breadcrumb + toolbar                                   |
| `project/page/flyouts/files-controls.tsx`        | Flyout filter/sort controls                                   |
| `project_actions.ts`                             | `ProjectActions` — file ops, set_current_path, open_directory |
| `project_store.ts`                               | `ProjectStoreState` — all Redux keys                          |
| `project-file.ts`                                | `FILE_ACTIONS` registry, `FileAction` type                    |
| `file-clipboard/actions.ts`                      | Global clipboard helpers (cut/copy/paste/clear)               |
| `file-clipboard/hook.ts`                         | `useFileClipboard()`, `useClipboardPathSet()` hooks           |
| `file-clipboard/quick-actions.tsx`               | Hover-visible cut/copy/paste/delete buttons                   |
| `file-clipboard/clipboard-pill.tsx`              | Clipboard status pill with paste button                       |

## Common Patterns for Agents

### Navigate the explorer to a directory

```typescript
import { navigateBrowsingPath } from "./navigate-browsing-path";

navigateBrowsingPath(
  project_id,
  "subdir/nested",
  prevHistory,
  "explorer_browsing_path",
  "explorer_history_path",
);
```

### Trigger a file action programmatically

```typescript
// Check specific files, then open the action dialog
actions.set_file_checked("path/to/file.txt", true);
actions.set_file_action("rename");
```

### Read the correct browsing path

```typescript
// From the explorer
const explorerDir = store.get("explorer_browsing_path") ?? "";

// From the flyout
const flyoutDir = store.get("flyout_browsing_path") ?? "";

// From checked files (context-agnostic — preferred in file actions)
const dir =
  checked_files.size > 0 ? path_split(checked_files.first()).head : "";
```

### Refresh a directory listing

```typescript
// ALWAYS pass explicit path — bare call falls back to current_path
actions.fetch_directory_listing({ path: targetDir });
```
