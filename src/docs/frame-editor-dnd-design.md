# Frame Editor Drag-and-Drop Design

Design spec for drag-and-drop frame rearrangement in CoCalc's frame editor system.

## Goals

- Drag-and-drop to rearrange frames (swap, split, merge as tabs)
- Evolve the binary tree data structure to an N-ary tree supporting tab groups
- VS Code-like drop zone behavior
- Shared DnD infrastructure with the file explorer
- Incremental delivery in 5 phases

## Data Structure: N-ary Frame Tree

The current binary tree (`first`/`second`/`pos`) evolves to an N-ary tree with
three node kinds:

```typescript
// Internal split node — lays out children in a row or column
{
  type: "node",
  direction: "row" | "col",
  children: FrameTree[],   // 2+ children
  sizes: number[],          // relative sizes, sum to 1.0
}

// Tab group node — shows one child at a time
{
  type: "tabs",
  children: FrameTree[],   // 2+ children (each a leaf)
  activeTab: number,        // index of visible tab
}

// Leaf node — actual editor (unchanged)
{
  type: "cm" | "terminal" | "jupyter" | ...,
  // existing leaf properties: font_size, etc.
}
```

### Migration

On load, if a tree has `first`/`second` instead of `children`, convert:

```
{ first, second, pos: 0.5 }  →  { children: [first, second], sizes: [0.5, 0.5] }
```

If `pos` is missing, default to 0.5. Backwards-compatible — old saved trees are
upgraded transparently.

### Direction Semantics

`direction` follows the existing convention: `"col"` means children are laid out
as columns (horizontally, `flexDirection: "row"`), `"row"` means children are
laid out as rows (vertically, `flexDirection: "column"`). The name refers to the
drag bar orientation, not the flex direction. This is unchanged from the binary
tree.

### Invariants

- A `"node"` with 1 child collapses: the child replaces the node
- A `"tabs"` with 1 child collapses: the child replaces the tabs node
- A `"tabs"` with 0 children is removed entirely
- `sizes` always sums to 1.0 and has the same length as `children`

### N-ary Children (3+ children in a split node)

When `move_node` inserts a frame into an existing split of the **same
direction**, it appends to the `children` array instead of wrapping in a new
node. Example: if a `"col"` node has children `[A, B]` and you drop frame C to
the right of B, the result is `children: [A, B, C]` with `sizes` redistributed
— not a nested `{ children: [A, { children: [B, C] }] }`. This keeps the tree
flat where possible. If the directions differ (dropping left/right into a
`"row"` node), a new nested split is created.

### Persistence

The new `children`/`sizes` format is persisted directly. There is no
round-tripping back to `first`/`second`/`pos`. The migration function runs on
load, so older saved trees are upgraded on first open. In multi-user sessions,
each client runs its own migration independently — the frame tree is stored in
`local_view_state` (per-user, not shared), so there is no cross-client
compatibility concern.

## Tree Operations

New operations in `tree-ops.ts`:

- **`swap_nodes(tree, idA, idB)`** — Swap two leaf/subtree positions anywhere in
  the tree.
- **`move_node(tree, sourceId, targetId, position)`** — Move a frame to a new
  location. `position` is one of `"left" | "right" | "top" | "bottom" |
  "center" | "tab"`.
  - `"center"` → swap (delegates to `swap_nodes`)
  - `"tab"` → merge source into target's tab group (or create new tabs node)
  - `"left"/"right"` → remove source from old location, wrap target in a new
    split node with source as sibling
  - `"top"/"bottom"` → same but vertical split
- **`collapse_trivial(tree)`** — Normalize after operations: remove single-child
  nodes, remove empty nodes.

Updated existing ops: `split_leaf`, `delete_node`, `set`, `get_node`,
`get_parent_id` — all updated for `children` array traversal instead of
`first`/`second`.

### Actions Integration

The base Actions class (`code-editor/actions.ts`) gets new methods that call
the tree-ops:

- **`swap_frames(idA, idB)`** — calls `swap_nodes`, updates tree state
- **`move_frame(sourceId, targetId, position)`** — calls `move_node`, updates
  tree state, sets `active_id` to the moved frame
- These follow the existing pattern: call `_tree_op()` dispatcher, which applies
  the operation and calls `_save_local_view_state()`

### Edge Cases

- **Single frame**: grip icon is hidden, no drag possible
- **Drag cancelled** (Escape, blur, tab switch): tree unchanged, drop zone
  overlays removed, cursor restored. `FrameDndProvider` handles `onDragCancel`.
- **Self-drop**: dropping a frame onto itself is a no-op (detected and ignored)
- **Undo/redo**: frame tree changes from DnD are part of the normal
  `local_view_state` update path — undo is not supported for layout changes
  (consistent with existing split/close behavior)

### Test Suite

Pure-function tests for all N-ary tree operations — no mocking needed since
tree-ops take a tree in and return a tree out. Covers: `swap_nodes`, `move_node`,
`collapse_trivial`, migration function, and updated `split_leaf`/`delete_node`.

## Drag Handle

A dedicated ≡ (three horizontal lines) grip icon at the **far left** of each
frame's title bar, before the frame type dropdown and other buttons. Always
visible when there are 2+ frames.

Within a `TabsContainer`, the **tab labels themselves** are the drag handles —
no grip icon needed for individual tabs.

## Drop Zones

Where you drop determines what happens. Drop zones are computed from pointer
position relative to the target frame's bounding rect:

| Drop target             | Action                     | Cursor overlay text              |
| ----------------------- | -------------------------- | -------------------------------- |
| Frame body (center 50%) | Swap frames                | ↔ Swap with "Terminal"           |
| Title bar               | Merge into tab group       | ⊞ Tab with "Terminal"            |
| Top edge (25%)          | Split above                | Split above "Terminal"           |
| Bottom edge (25%)       | Split below                | Split below "Terminal"           |
| Left edge (25%)         | Split left                 | Split left of "Terminal"         |
| Right edge (25%)        | Split right                | Split right of "Terminal"        |

Edge detection is computed in drag-move handlers (pointer position vs bounding
rect), not via separate `useDroppable` instances per zone.

### Corner Overlap Resolution

When the pointer is in a corner where two edge zones overlap (e.g., top-left),
the zone is determined by **which edge the pointer is closer to**. For a point
at `(x, y)` relative to the frame rect: compare `distanceToTop` vs
`distanceToLeft` — the smaller distance wins. This gives diagonal zone
boundaries in corners, matching VS Code's behavior.

## Shared DnD Infrastructure

Extracted from the file explorer into common modules so both file DnD and frame
DnD share identical configuration and visual appearance.

### `components/dnd/config.ts`

Shared constants imported by both file explorer and frame editor:

- `MOUSE_SENSOR_OPTIONS` — activation constraint config object: `{ distance: 3,
  delay: 300, tolerance: 5 }`. Each consumer calls `useSensor(MouseSensor,
  MOUSE_SENSOR_OPTIONS)` in their own component — these are config values, not
  hook instances.
- `TOUCH_SENSOR_OPTIONS` — `{ delay: 300, tolerance: 5 }`
- `DND_COLLISION_DETECTION` — `pointerWithin` (re-exported from @dnd-kit/core)
- `snapToPointerModifier` — the modifier function, extracted from
  `file-dnd-provider.tsx`
- `DRAG_OVERLAY_STYLE` — styling constants (font size, border radius, padding,
  opacity)

### `components/dnd/drag-overlay-content.tsx`

Generic drag overlay component extracted from `FileDragOverlayContent`:

- Props: `{ icon, text, variant: "valid" | "neutral" | "invalid" }`
- Color-coded backgrounds: blue (valid), gray (neutral), red (invalid)
- Semi-transparent, non-interactive (`pointerEvents: "none"`)

The file explorer is refactored to import from these shared modules. No behavior
change — just extraction.

## Visual Feedback

- **Drag activation**: 300ms delay or 3px distance (matching file explorer)
- **During drag**: `body.cc-frame-dragging` class applied (distinct from
  `body.cc-file-dragging` so CSS rules don't interfere). Target frames get a
  subtle tint to indicate they're valid drop targets.
- **Active drop zone**: semi-transparent blue overlay on the hovered zone
  (center, edge, or title bar)
- **Cursor overlay**: contextual label next to cursor showing the action that
  will occur on drop

## Rendering Updates

### `FrameTree` component (`frame-tree.tsx`)

Updated to render N children instead of binary `first`/`second`:

- Iterate over `children` array with `FrameTreeDragBar` between adjacent children
- Sizes from `sizes` array applied as flex values
- New `render_children(direction)` replaces `render_cols()`/`render_rows()`

### `TabsContainer` component (new)

Renders a `type: "tabs"` node:

- Uses Ant Design `Tabs` with one tab per child
- Tab labels show frame icon + type name
- Active tab controlled by `activeTab` from tree state
- Tab labels are themselves draggable (for reordering within group and dragging
  out to edges)
- Tab reordering within a group uses @dnd-kit `useSortable` directly inside
  the `FrameDndProvider`'s existing `DndContext` (via `SortableContext`), NOT
  a nested `DndContext`. The existing `SortableTabs` component creates its own
  `DndContext` and cannot be reused here — instead, `TabsContainer` implements
  sortable tabs using `SortableContext` + `useSortable` within the parent
  context

### Title bar (`title-bar.tsx`)

- ≡ grip icon rendered at the far left, before all buttons
- Uses `useDraggable` — the grip is the drag activator
- Only visible when there are 2+ frames

### Drop zone overlays

Lightweight `div`s layered on each frame during an active drag. Show colored
zones that highlight as the cursor enters. Hidden when no drag is active.

## Implementation Phases

Each phase is independently shippable and testable.

### Phase 1a: Data structure + tree-ops

- Extend `FrameTree` type with `children`/`sizes`/`activeTab`
- Migration function: `first`/`second`/`pos` → `children`/`sizes`
- Update `tree-ops.ts` for N-ary traversal
- Test suite for all tree operations
- **Verify**: all tree-ops tests pass, TypeScript compiles

### Phase 1b: Rendering migration

- Update `FrameTree` component rendering for N children
- Update `FrameTreeDragBar` for N-ary splits
- Add `swap_frames` and `move_frame` to Actions class
- **Verify**: app builds, frame editor opens and renders correctly, split/close
  work as before. Manual smoke test.

### Phase 2: Shared DnD infrastructure

- Extract `components/dnd/config.ts` and `components/dnd/drag-overlay-content.tsx`
- Refactor file explorer to use shared components
- **Result**: file explorer works identically, shared foundation ready

### Phase 3: Frame DnD — swap

- Add ≡ grip icon to title bar
- `FrameDndProvider` with drag/drop
- Body drop zone → `swap_nodes`
- Cursor overlay showing swap action
- **Result**: frames can be swapped via drag and drop

### Phase 4: Edge-zone splits

- Edge detection (top/bottom/left/right 25%)
- Visual zone highlighting during drag
- `move_node` with split positioning
- **Result**: drag to edges to rearrange layout

### Phase 5: Tab groups

- `TabsContainer` component
- Title bar drop zone → `merge_as_tabs`
- Draggable tab labels within tab group
- Drag tab to edge → split out of group
- Tab reordering within group via `SortableTabs`
- **Result**: full tab support

## Future Work (out of scope)

- **Preset layouts**: dropdown at top-right of frame editor (outside individual
  frames) with tmux-style presets — all horizontal, rotate, ⅔ left + stacked
  right, etc. Deferred until DnD + tabs are stable.

## Key Source Files

| File                                                   | Role                          |
| ------------------------------------------------------ | ----------------------------- |
| `frame-editors/frame-tree/types.ts`                    | FrameTree type definitions    |
| `frame-editors/frame-tree/tree-ops.ts`                 | Tree manipulation functions   |
| `frame-editors/frame-tree/frame-tree.tsx`              | Recursive tree renderer       |
| `frame-editors/frame-tree/title-bar.tsx`               | Frame title bar               |
| `frame-editors/frame-tree/frame-tree-drag-bar.tsx`     | Resize drag bar               |
| `frame-editors/code-editor/actions.ts`                 | Base Actions class            |
| `project/explorer/dnd/file-dnd-provider.tsx`           | File DnD (source for extract) |
| `components/dnd/config.ts`                             | Shared DnD config (new)       |
| `components/dnd/drag-overlay-content.tsx`              | Shared overlay component (new)|
| `frame-editors/frame-tree/dnd/frame-dnd-provider.tsx`  | Frame DnD provider (new)      |
