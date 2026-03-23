# Frame Editor Drag-and-Drop

This document describes the current drag-and-drop implementation for CoCalc's
frame editor. It is intended as a quick lookup for coding agents working in
`packages/frontend/frame-editors/frame-tree/`.

## Scope

This doc covers the current shipped behavior in the frame editor:

- rearranging frames by drag-and-drop
- N-ary split nodes and tab containers
- tab reorder and tab extraction
- the main action and tree-op entry points

For broader frame editor architecture, see `docs/frame-editors.md`.

## Overview

Frame editor DnD is implemented in the frontend frame-tree code and operates on
the per-user `local_view_state.frame_tree`. It is not a shared collaborative
layout; each client migrates and stores its own tree locally.

Main supported interactions:

- drag one frame onto another frame body to swap
- drag onto an edge to split around the target
- drag onto a title bar or tab bar to merge into tabs
- drag tabs within a tab container to reorder
- drag a tab onto one of its own edge zones to extract it from the tab group

## Key Files

- `packages/frontend/frame-editors/frame-tree/editor.tsx`
  Wraps the frame tree in `FrameDndProvider` and computes `is_only`.
- `packages/frontend/frame-editors/frame-tree/frame-tree.tsx`
  Renders split nodes, tab containers, and leaf frames.
- `packages/frontend/frame-editors/frame-tree/frame-leaf-container.tsx`
  Adds per-leaf droppable behavior and zone overlays.
- `packages/frontend/frame-editors/frame-tree/title-bar.tsx`
  Defines the frame drag handle in the title bar.
- `packages/frontend/frame-editors/frame-tree/tabs-container.tsx`
  Implements tab containers, tab drag sources, reorder drop targets, and tab-bar
  drop behavior.
- `packages/frontend/frame-editors/frame-tree/dnd/frame-dnd-provider.tsx`
  Owns the `@dnd-kit` context and maps drop targets to action calls.
- `packages/frontend/frame-editors/frame-tree/dnd/use-frame-drop-zone.ts`
  Computes `center` / `tab` / edge zones from pointer position.
- `packages/frontend/frame-editors/frame-tree/dnd/drop-zone-overlay.tsx`
  Renders hover overlays for valid drop zones.
- `packages/frontend/frame-editors/frame-tree/tree-ops.ts`
  Pure tree mutation helpers.
- `packages/frontend/frame-editors/code-editor/actions.ts`
  Action methods that call tree-ops and maintain focus/fullscreen invariants.
- `packages/frontend/components/dnd/config.ts`
  Shared sensor and drag-overlay config used by frame DnD and file explorer DnD.

## Frame Tree Model

The current frame tree is no longer purely binary. On load, legacy
`first`/`second`/`pos` trees are migrated to the newer shape in
`code-editor/actions.ts` via `tree_ops.migrateToNary(...)`.

Current node types:

```ts
type SplitNode = {
  id: string;
  type: "node";
  direction: "row" | "col";
  children: FrameTree[];
  sizes: number[];
};

type TabsNode = {
  id: string;
  type: "tabs";
  children: FrameTree[];
  activeTab: number;
};

type LeafNode = {
  id: string;
  type: string;
  font_size?: number;
  path?: string;
  // other per-frame data
};
```

Notes:

- split nodes may have more than 2 children
- tab containers collapse away when they end up with a single child
- old binary fields still exist in types and rendering as a compatibility path,
  but current operations migrate to and work with `children`/`sizes`

## Drag Sources And Targets

### Frame drag sources

- normal frames drag from the title-bar handle in `title-bar.tsx`
- tabs drag from the tab label in `tabs-container.tsx`

The title-bar drag handle is also the frame's app-menu dropdown trigger, so the
drag affordance and frame menu live in the same control.

### Frame drop targets

Each leaf frame is wrapped by `FrameLeafContainer`, which uses
`useFrameDropZone(...)` to register one droppable target with per-pointer zone
computation.

Drop zones on a leaf:

- `center`: swap with the target frame
- `tab`: title-bar strip, merge with target as tabs
- `top`, `bottom`, `left`, `right`: split around the target

`TabsContainer` also defines two tab-specific target types:

- `tab-reorder-drop`: drop before a sibling tab
- `tab-bar-drop`: drop anywhere on the tab bar to append/reorder at the end

## Drop Semantics

The provider in `frame-dnd-provider.tsx` resolves the current target and then
dispatches one of these operations:

| Drop result                    | Action method                                     |
| ------------------------------ | ------------------------------------------------- |
| frame body center              | `actions.swap_frames(sourceId, targetId)`         |
| title bar / tab bar            | `actions.move_frame(sourceId, targetId, "tab")`   |
| edge of another frame          | `actions.move_frame(sourceId, targetId, edge)`    |
| edge of the dragged tab itself | `actions.extract_tab(sourceId, edge)`             |
| tab before sibling tab         | `actions.reorder_tab(tabsId, sourceId, targetId)` |
| tab bar of same container      | `actions.reorder_tab(tabsId, sourceId, null)`     |

Important behavior:

- dropping onto self is normally a no-op
- self-drop on an edge is only meaningful for a tab inside a tab container with
  at least 2 tabs; that becomes tab extraction
- when dropping onto a frame inside a tab container using an edge zone, the code
  splits the tab container, not just the hovered child leaf

## Tree Operations

The main mutations live in `tree-ops.ts`:

- `migrateToNary(tree)`
  Converts legacy binary trees into `children`/`sizes` trees.
- `swap_nodes(tree, idA, idB)`
  Swaps two subtrees.
- `move_node(tree, sourceId, targetId, position)`
  Handles swap, directional moves, and tab merge.
- `merge_as_tabs(tree, sourceId, targetId)`
  Internal helper used by `move_node(..., "tab")`.
- `extract_from_tabs(tree, sourceId, position)`
  Splits one tab out of its tab container.
- `reorder_tab(tree, tabsId, sourceFrameId, beforeFrameId)`
  Reorders tabs within a tab container.
- `collapse_trivial(tree)`
  Removes single-child split or tab wrappers after mutations.

The actions layer in `code-editor/actions.ts` is what UI code should call:

- `swap_frames(...)`
- `move_frame(...)`
- `add_tab(...)`
- `reorder_tab(...)`
- `extract_tab(...)`

These methods also do follow-up work such as:

- re-focus the moved frame via `active_id`
- clear `full_id` when a tab merge invalidates fullscreen semantics
- call `set_resize?.()` after structural changes

## Rendering Model

`FrameTree` handles three render paths:

- `type === "node"`: render a split container from `children` and `sizes`
- `type === "tabs"`: render `TabsContainer`
- any other `type`: render a leaf editor inside `FrameLeafContainer`

`FrameTreeDragBar` still handles manual resize between adjacent split children.

`TabsContainer` keeps all tab contents mounted and hides inactive tabs rather
than unmounting them. This preserves editor DOM state such as CodeMirror scroll
position.

## Visual Feedback

Shared DnD config lives in `packages/frontend/components/dnd/config.ts`.
The frame editor intentionally reuses the same shared DnD foundation as the
project explorer so drag activation, overlay positioning, and overlay styling
feel consistent across both parts of the UI. The explorer remains the other
main consumer of this shared layer; see `docs/project-files.md`.

Current feedback behavior:

- drag activation uses the same sensor config as file-explorer DnD
- the active dragged frame is dimmed in `FrameLeafContainer`
- valid targets show a subtle inactive border even before a zone is active
- active zones are highlighted by `DropZoneOverlay`
- `FrameDndProvider` shows a drag overlay label describing the resulting action

Shared pieces reused from explorer DnD:

- `MOUSE_SENSOR_OPTIONS`
- `TOUCH_SENSOR_OPTIONS`
- `DRAG_OVERLAY_MODIFIERS`
- `DragOverlayContent`

Zone geometry is computed in `use-frame-drop-zone.ts`:

- title bar height maps to the `tab` zone
- edges use 25% bands
- center is the remaining interior
- corners resolve to the closer edge

## Invariants Worth Preserving

When changing this code, keep these expectations intact:

- `active_id` should always reference a leaf
- `full_id` may need clearing after structural changes, especially tab merges
- tab extraction and directional moves should be followed by
  `collapse_trivial`
- `TabsContainer` should stay in sync with programmatic focus changes by
  deriving its visible tab from `active_id`
- `frame_tree` migration must remain idempotent because old trees may still be
  loaded from local storage

## Tests

Tree-op coverage is in:

- `packages/frontend/frame-editors/frame-tree/__tests__/tree-ops.test.ts`

Those tests cover migration, swapping, tab creation, extraction, collapse, and
reorder behavior. UI interaction behavior is mostly encoded indirectly through
the provider and tree-op/action integration rather than a dedicated DnD UI test
suite.
