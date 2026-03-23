# Frame Editor Menus, Toolbar, and Icon Pinning

This document describes the command/menu system in CoCalc's frame editor —
how menus are built, how the symbol bar (quick-access toolbar) works, and how
users pin/unpin icons from menus to the toolbar.

Companion docs: `frame-editors.md` (layout tree, editor specs),
`frame-editor-dnd.md` (drag-and-drop).

## Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ [≡ Slate ▾]  File  Edit  Format  View  Go  Help   [≡][×][⊡]  │  ← menus + frame controls
│  Bold  Italic  Header  Font  Color  AI  Sync  ToC             │  ← symbol bar (pinned buttons)
├─────────────────────────────────────────────────────────────────┤
│                        Editor Content                          │
└─────────────────────────────────────────────────────────────────┘
```

Each menu item has an icon on its left. Clicking the **icon** toggles whether
that command is pinned to the symbol bar. Clicking the **label** executes the
command. Pinned icons appear highlighted (`background: #ddd`) in the menu.

## Architecture

```
commands/types.ts       Command interface, MenuSpec, Group types
commands/commands.ts    COMMANDS registry + addCommands()
commands/menus.ts       MENUS & GROUPS registries + addMenus(), addCommandsToMenus()
commands/generic-menus.ts   Standard menu definitions (file, edit, view, go, help, …)
commands/generic-commands.tsx   Common commands (save, undo, zoom, frame ops, …)
commands/format-commands.tsx    Format submenu commands (bold, font, header, …)
commands/editor-menus.ts    addEditorMenus() helper for editor-specific menus
commands/manage.tsx     ManageCommands class — visibility, rendering, pinning
title-bar.tsx           FrameTitleBar component — renders menus + symbol bar
```

## Registration: Commands, Groups, and Menus

### Hierarchy

```
Menu (e.g. "edit")
  └─ Group (e.g. "undo-redo", "find", "copy", "ai", "format", "config")
       └─ Command (e.g. "undo", "redo", "find", "replace", …)
```

- **`MENUS`** (`menus.ts`): top-level dropdown menus. Each has a `label`, `pos`
  (sort order), and `groups[]` listing which groups it contains.
- **`GROUPS`** (`menus.ts`): maps group name → array of command names.
- **`COMMANDS`** (`commands.ts`): maps command name → `Command` object.

### Registration flow

```typescript
// 1. Register menu structure (generic-menus.ts)
addMenus({
  edit: { label: menu.edit, pos: 1, groups: ["undo-redo", "find", "copy", "ai", "format", "config"] },
  // ...
});

// 2. Register commands — automatically added to their group via addCommandsToMenus()
addCommands({
  undo: { group: "undo-redo", pos: 0, icon: "undo", label: "Undo", onClick: ... },
  redo: { group: "undo-redo", pos: 1, icon: "redo", label: "Redo", onClick: ... },
});
```

### Editor-specific registration

Each editor type can add its own menus and commands via `addEditorMenus()` helper
(in `editor-menus.ts`). This builds both menu groups and command objects from a
simpler specification format, supporting nested children for submenus.

Example: `format-commands.tsx` registers format commands with submenu children
(font size, font family, headers, colors, etc.).

## The Command Interface

```typescript
interface Command {
  group: Group;             // which menu group this belongs to
  pos?: number;             // sort position within group (default: 1e6)
  icon?: IconName | ReactNode | ((opts: ManageCommands) => ReactNode);
  iconRotate?: IconRotation;
  label?: CommandText;      // text shown in menus
  button?: CommandText;     // text shown on toolbar button (if different from label)
  title?: CommandText;      // tooltip text
  onClick?: OnClick;        // handler; falls back to actions[commandName](frameId)
  children?: Command[] | ((opts: ManageCommands) => Command[]); // submenu items
  keyboard?: ReactNode;     // shortcut display (desktop only)
  isVisible?: string | ((opts) => boolean);  // visibility predicate
  disabled?: (opts) => boolean;              // grayed-out predicate
  alwaysShow?: boolean;     // override all visibility checks
  neverVisibleOnMobile?: boolean;
  stayOpenOnClick?: boolean; // keep dropdown open after click
  popconfirm?: PopconfirmOpts | ((opts) => PopconfirmOpts);
  disable?: keyof StudentProjectFunctionality; // educational restrictions
  search?: string;          // extra search terms for command search
}
```

### Icon types

Icons can be one of three forms:
- **String** (`IconName`): e.g. `"bold"`, `"undo"`, `"colors"` — renders via `<Icon name={...} />`
- **ReactNode**: e.g. `<span style={{fontSize: 18}}>A</span>` — custom rendering
- **Function**: `(opts: ManageCommands) => ReactNode` — dynamic icon based on state

## ManageCommands Class (`manage.tsx`)

Central class instantiated per frame title bar. Handles:

### Visibility

```typescript
isVisible(name, cmd?): boolean
```

Checks (in order):
1. Explicitly hidden by spec (`spec.commands["-commandName"]`) → false
2. `alwaysShow` → true
3. `neverVisibleOnMobile` + mobile → false
4. Student project restrictions → false
5. Custom `isVisible` predicate
6. Must be in `spec.commands` or `spec.customizeCommands`

### Menu rendering

```typescript
commandToMenuItem({ name, cmd, key, noChildren, button }): MenuItem
```

Converts a `Command` into an antd `MenuItem`. When `button=true`, renders in
toolbar style (icon + optional small label). When `button=false`, renders in
menu style (icon + full label + keyboard shortcut).

### Icon pinning

```typescript
// Check if command is pinned to the toolbar
isOnButtonBar(name): boolean
  → editorSettings.getIn(["buttons", editorType(), name])
  ?? spec.buttons?.[name]  // fallback to editor default

// Toggle pin state — persisted to account settings
toggleButton(name): void
  → set_account_table({ editor_settings: { buttons: { [editorType]: { [name]: bool } } } })

// Get ordered list of pinned button names
getToolbarButtons(): string[]
  → merges user-customized buttons + spec default buttons
  → sorted by command position (menu order)
```

**Editor type key**: `"${filename_extension}-${frame_type}"` (e.g. `"md-slate"`,
`"ipynb-jupyter"`, `"tex-cm"`). This means pinning is per file-extension and
per frame-type.

### Storage

Pin state is stored in the user's account table:
```
account.editor_settings.buttons = {
  "md-slate": { "format-bold": true, "format-header": true, ... },
  "tex-cm":   { "build": true, "sync": true, ... },
  ...
}
```

- `true` = explicitly pinned
- `false` = explicitly unpinned (overrides editor default)
- `undefined` = falls back to editor spec default

### Toolbar management commands

- **Remove All**: `removeAllToolbarButtons()` — sets all spec defaults to `false`
- **Reset**: `resetToolbar()` — clears all user customizations, restoring spec defaults

## Title Bar Rendering (`title-bar.tsx`)

### Menu rendering

```typescript
getMenuItems(name)   // builds MenuItem[] from groups for a named menu
renderMenu(name)     // wraps getMenuItems in a DropdownMenu component
renderMenus()        // iterates all MENUS, renders dropdowns sorted by pos
```

Items within groups are sorted by `pos`. Groups are separated by dividers.

### Symbol bar rendering

```typescript
renderButtonBar(popup?)
  → manageCommands.getToolbarButtons()   // get ordered button names
  → renderButtonBarButton(name)          // render each as icon + optional label
```

Each toolbar button:
- If the command has `children` → renders as a `DropdownMenu` (click opens submenu)
- Otherwise → renders as a simple `Button` with icon + tooltip

### Symbol bar labels

Users can toggle labels below icons via right-click context menu on the symbol bar.
Stored in `account.other_settings.show_symbol_bar_labels`.

When labels are shown:
- Symbol bar moves to its own row below the menu bar
- Each button shows a small label (11px) below the icon, truncated to 50px

When labels are hidden:
- Symbol bar is inline with the menu bar (more compact)

### Pin toggle UI in menus

When `extra_button_bar` is enabled (the toolbar is visible), each top-level menu
item's icon becomes a clickable button:

```
 [🔤]  Bold            ← click icon = toggle pin; click "Bold" = execute
 [🔤]  Italic           gray bg on icon = currently pinned
```

The icon shows a tooltip: "Click icon to add/remove from toolbar".
Only top-level commands (not submenu children) have this toggle.

## Default Pinned Buttons per Editor

Each `EditorDescription` can declare default toolbar buttons:

```typescript
const slate: EditorDescription = {
  type: "slate",
  // ...
  buttons: {
    "format-ai_formula": true,
    "format-header": true,
    "format-text": true,
    "format-font": true,
    "format-color": true,
    "sync": true,
    "show_table_of_contents": true,
  },
};
```

These appear on the toolbar by default until the user explicitly unpins them.

### Examples of editor defaults

- **Jupyter**: insert cell, run cell, interrupt kernel, restart kernel, cell type
- **LaTeX**: AI formula, sync, header, text, font, color, build, build-on-save, ToC
- **Markdown/Slate**: AI formula, sync, header, text, font, color, ToC
- **Code**: (minimal — typically just undo/redo from generic commands)

## Data Flow Summary

```
Editor spec (editor.ts)
  → EditorDescription.commands    # which commands are available
  → EditorDescription.buttons     # which are pinned by default
  → EditorDescription.customizeCommands  # overrides per editor

User interaction
  → click icon in menu → toggleButton(name) → account.editor_settings.buttons
  → right-click toolbar → toggle labels → account.other_settings.show_symbol_bar_labels

Rendering
  → ManageCommands.isVisible()        # filter commands
  → ManageCommands.getToolbarButtons() # merge defaults + user prefs
  → title-bar.tsx renders menus + symbol bar
```
