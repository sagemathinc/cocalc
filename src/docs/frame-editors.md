# Frame Editors

This document explains CoCalc's frame editor system — the layout tree that lets
users view multiple panes (source, preview, terminal, table of contents, etc.)
for a single file.

## Overview

Every file in CoCalc opens in a **frame editor**: a container that arranges one
or more **frames** (editor panes) in a resizable layout tree with split nodes
and tab containers. Each file type defines its own **editor spec** — a map of
available frame types with their React components, commands, and toolbar
buttons.

```
┌─────────────────────────────────────────┐
│  Title Bar  [Slate] [Code] [Terminal]   │
├─────────────────────┬───────────────────┤
│                     │                   │
│  Slate Editor       │  Rendered Preview │
│  (editable text)    │  (read-only)      │
│                     │                   │
├─────────────────────┴───────────────────┤
│  Status Bar                             │
└─────────────────────────────────────────┘
```

The layout is a tree: each node is either a leaf (a single frame), a split node
that arranges children horizontally (`"row"`) or vertically (`"col"`), or a
tab container. Legacy binary trees are still loaded, but current state is
normalized to the newer `children`/`sizes` representation.

For the current drag-and-drop behavior and tab/split mutation logic, see
`docs/frame-editor-dnd.md`.

## Architecture

### Key Components

```
createEditor({ editor_spec })
  → FrameTreeEditor (editor.tsx)
    → FrameTree (frame-tree.tsx)        ← recursive split/tab tree renderer
      → Leaf (leaf.tsx)                 ← renders a single frame
        → EditorDescription.component  ← the actual editor React component
      → TitleBar (title-bar.tsx)        ← frame selector tabs, buttons
    → StatusBar (status-bar.tsx)        ← bottom status line
```

### Frame Tree Structure

```typescript
// packages/frontend/frame-editors/frame-tree/types.ts
interface FrameTree {
  direction?: "row" | "col"; // split direction (internal nodes)
  type: string; // editor type name (leaf nodes)
  first?: FrameTree; // legacy left/top child
  second?: FrameTree; // legacy right/bottom child
  pos?: number; // legacy split position (0-1)
  children?: FrameTree[]; // current split or tabs children
  sizes?: number[]; // split sizes for type:"node"
  activeTab?: number; // selected child for type:"tabs"
  font_size?: number; // per-frame font size
}
```

Tree operations are in `tree-ops.ts`:

- `set(tree, {id, ...})` — update a node by ID
- `set_leafs(tree, obj)` — update all leaf nodes
- `delete_node(tree, id)` — remove a node (sibling takes parent's place)
- `generate_id(tree)` — assign unique IDs to all nodes
- `migrateToNary(tree)` — convert legacy binary trees to `children`/`sizes`

## EditorDescription

Each frame type is defined by an `EditorDescription`:

```typescript
// packages/frontend/frame-editors/frame-tree/types.ts
interface EditorDescription {
  type: EditorType; // unique identifier
  short: string | IntlMessage; // short label for tab
  name: string | IntlMessage; // longer description
  icon: IconName; // icon in tab
  component: (props: EditorComponentProps) => ReactNode; // React component

  commands?: { [name: string]: boolean }; // available commands
  customizeCommands?: { [name: string]: Partial<Command> }; // override commands
  buttons?: { [name: string]: boolean }; // toolbar buttons

  hide_file_menu?: boolean;
  mode?: any; // CodeMirror mode
  placeholder?: string; // placeholder when empty
  style?: object; // custom CSS
}
```

### EditorType Values

All available frame types (from the `EditorType` union):

| Type                                                           | Description                   |
| -------------------------------------------------------------- | ----------------------------- |
| `"cm"`                                                         | CodeMirror source editor      |
| `"slate"`                                                      | Slate rich text editor        |
| `"markdown"` / `"markdown-rendered"`                           | Rendered markdown view        |
| `"markdown-toc"`                                               | Markdown table of contents    |
| `"jupyter"`                                                    | Jupyter notebook cells        |
| `"jupyter-toc"`                                                | Jupyter table of contents     |
| `"terminal"`                                                   | Terminal emulator             |
| `"latex"` / `"latex-build"` / `"latex-output"` / `"latex-toc"` | LaTeX editor frames           |
| `"pdfjs-canvas"`                                               | PDF viewer                    |
| `"preview-html"`                                               | HTML preview                  |
| `"search"`                                                     | Search panel                  |
| `"settings"`                                                   | Editor settings               |
| `"timetravel"`                                                 | Time travel (version history) |
| `"errors"`                                                     | Error display                 |
| `"chat"` / `"chatroom"`                                        | Side chat                     |
| `"tasks"`                                                      | Task list                     |
| `"whiteboard"`                                                 | Whiteboard canvas             |
| `"slides"` / `"slides-slideshow"`                              | Slides editor                 |
| `"course-students"` / `"course-assignments"` / etc.            | Course management tabs        |

## Creating an Editor

Each file type creates its editor via `createEditor()`:

```typescript
// packages/frontend/frame-editors/frame-tree/editor.tsx
export function createEditor(opts: {
  editor_spec: EditorSpec; // map of frame type name → EditorDescription
  format_bar?: boolean; // show formatting toolbar
  format_bar_exclude?: SetMap; // hide specific format buttons
  display_name: string; // React display name
}): React.FC<EditorProps>;
```

### Example: Code Editor

```typescript
// packages/frontend/frame-editors/code-editor/editor.ts
const cm: EditorDescription = {
  type: "cm",
  short: "Code",
  name: "Source Code",
  icon: "code",
  component: CodemirrorEditor,
  commands: set(["print", "save", "find", "replace", "undo", "redo", ...]),
};

const EDITOR_SPEC = { cm, terminal, time_travel };

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "CodeEditor",
});
```

### Example: Markdown Editor

```typescript
// packages/frontend/frame-editors/markdown-editor/editor.ts
const EDITOR_SPEC = {
  slate, // rich text (Slate)
  cm, // raw markdown (CodeMirror)
  markdown, // rendered/locked view
  markdown_table_of_contents, // ToC panel
  terminal,
  settings: SETTINGS_SPEC,
  time_travel,
};

export const Editor = createEditor({
  format_bar: true,
  editor_spec: EDITOR_SPEC,
  display_name: "MarkdownEditor",
});
```

## Registration

Editors register for file extensions via `register_file_editor()`:

```typescript
// packages/frontend/frame-editors/frame-tree/register.ts
register_file_editor({
  ext: "md", // or ["md", "markdown"]
  editor: () => import("./editor"),
  actions: () => import("./actions"),
});
```

Registration supports **async loading** — editor code is loaded on demand when
a file is first opened, with timeout/retry logic for network resilience.

The registration system maintains a **reference count** per open file. When the
count drops to zero, the Redux store and actions for that file are cleaned up.

## Editor-Specific Directories

Each file type has its own directory under `packages/frontend/frame-editors/`:

| Directory             | File Types                | Frames                                  |
| --------------------- | ------------------------- | --------------------------------------- |
| `code-editor/`        | `.py`, `.js`, `.ts`, etc. | cm, terminal, time_travel               |
| `markdown-editor/`    | `.md`                     | slate, cm, markdown, toc                |
| `latex-editor/`       | `.tex`                    | cm, pdf, build log, toc, errors         |
| `jupyter-editor/`     | `.ipynb`                  | jupyter, toc, json, introspect          |
| `html-editor/`        | `.html`                   | cm, iframe preview                      |
| `pdf-editor/`         | `.pdf`                    | pdfjs-canvas                            |
| `terminal-editor/`    | `.term`                   | terminal                                |
| `course-editor/`      | `.course`                 | students, assignments, handouts, config |
| `slides-editor/`      | `.board` slides           | whiteboard, slideshow                   |
| `csv-editor/`         | `.csv`                    | grid view, cm                           |
| `sagews-editor/`      | `.sagews`                 | sage cells, cm                          |
| `rst-editor/`         | `.rst`                    | cm, html preview                        |
| `rmd-editor/`         | `.rmd`                    | cm, html preview, build                 |
| `qmd-editor/`         | `.qmd`                    | cm, preview, build log                  |
| `crm-editor/`         | CRM tools                 | CRM tables, accounts                    |
| `chat-editor/`        | `.sage-chat`              | chatroom                                |
| `time-travel-editor/` | (built-in)                | version history viewer                  |
| `settings/`           | (built-in)                | editor settings panel                   |

## EditorComponentProps

Every frame component receives these props:

```typescript
interface EditorComponentProps {
  id: string; // frame node ID
  actions: any; // file-level Actions
  path: string; // file path
  project_id: string; // project UUID
  font_size: number; // current font size
  is_current: boolean; // whether this frame is focused
  is_fullscreen: boolean;
  is_visible: boolean;
  is_public: boolean; // public view (no editing)
  read_only: boolean;
  desc: NodeDesc; // frame tree node description
  editor_state: Map<string, any>;
  editor_settings: AccountState["editor_settings"];
  settings: Map<string, any>; // shared file settings from SyncDoc
  cursors?: Map<string, any>; // collaborative cursors
  value?: string; // document content (for some editors)
  status: string; // status bar text
  resize: number; // incremented on resize events
  // ...more
}
```

## Commands System

`packages/frontend/frame-editors/frame-tree/commands/` defines the command
registry. Commands are actions available via menus, keyboard shortcuts, and
toolbar buttons.

Each `EditorDescription` declares which commands are available (`commands`) and
which appear as toolbar buttons (`buttons`). Commands can be customized per
frame type via `customizeCommands`.

Common commands: `save`, `undo`, `redo`, `find`, `replace`, `goto_line`,
`increase_font_size`, `decrease_font_size`, `time_travel`, `terminal`,
`chatgpt`, `format`, `print`, `cut`, `copy`, `paste`.

## Actions Base Class

`packages/frontend/frame-editors/code-editor/actions.ts` provides the base
`Actions` class for frame editors. Key responsibilities:

- Frame tree management (split, close, focus, resize)
- SyncDoc/SyncString lifecycle
- Save/load coordination
- Undo/redo
- Format (via prettier, etc.)
- Terminal management
- Time travel initialization
- Settings persistence

Each editor type can extend this base class to add file-type-specific behavior.

## Key Source Files

| File                                              | Description                                        |
| ------------------------------------------------- | -------------------------------------------------- |
| `frame-editors/frame-tree/types.ts`               | FrameTree, EditorDescription, EditorComponentProps |
| `frame-editors/frame-tree/editor.tsx`             | FrameTreeEditor component, createEditor()          |
| `frame-editors/frame-tree/frame-tree.tsx`         | Recursive binary tree renderer                     |
| `frame-editors/frame-tree/leaf.tsx`               | Single frame renderer                              |
| `frame-editors/frame-tree/title-bar.tsx`          | Frame tabs and toolbar                             |
| `frame-editors/frame-tree/status-bar.tsx`         | Bottom status line                                 |
| `frame-editors/frame-tree/tree-ops.ts`            | Binary tree manipulation                           |
| `frame-editors/frame-tree/register.ts`            | register_file_editor()                             |
| `frame-editors/frame-tree/commands/`              | Command definitions                                |
| `frame-editors/code-editor/editor.ts`             | Code editor spec                                   |
| `frame-editors/code-editor/actions.ts`            | Base Actions class                                 |
| `frame-editors/code-editor/codemirror-editor.tsx` | CodeMirror component                               |
| `frame-editors/markdown-editor/editor.ts`         | Markdown editor spec                               |
| `frame-editors/latex-editor/editor.ts`            | LaTeX editor spec                                  |
| `frame-editors/jupyter-editor/editor.ts`          | Jupyter editor spec                                |
| `frame-editors/terminal-editor/editor.ts`         | Terminal frame definition                          |
| `frame-editors/generic/chat.ts`                   | Side chat frame (included in all editors)          |

## Common Patterns for Agents

### Adding a New Frame Type

1. Define an `EditorDescription` with component, commands, buttons
2. Add it to the editor spec of the relevant file type
3. The frame will automatically appear in the title bar dropdown

```typescript
const myFrame: EditorDescription = {
  type: "my-frame",
  short: "My Frame",
  name: "My Custom Frame",
  icon: "magic",
  component: MyFrameComponent,
  commands: set(["save", "time_travel"]),
};

// Add to editor spec
const EDITOR_SPEC = { ...existingSpec, myFrame };
```

### Accessing Frame Tree State

```typescript
// In actions:
this._get_frame_tree(); // get immutable frame tree
this.set_frame_tree(tree); // update frame tree
this._get_frame_node(id); // get specific node
this.set_active_id(id); // focus a frame

// Frame operations:
this.split_frame("row", id); // split horizontally
this.split_frame("col", id); // split vertically
this.close_frame(id); // close a frame
```

### Registering a New File Type

```typescript
// In a new directory: frame-editors/my-editor/

// editor.ts
import { createEditor } from "../frame-tree/editor";
export const Editor = createEditor({
  editor_spec: { cm, terminal, time_travel },
  display_name: "MyEditor",
});

// register.ts
import { register_file_editor } from "../frame-tree/register";
register_file_editor({
  ext: "myext",
  editor: () => import("./editor"),
  actions: () => import("./actions"),
});
```
