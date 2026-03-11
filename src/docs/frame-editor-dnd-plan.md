# Frame Editor Drag-and-Drop Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add drag-and-drop frame rearrangement to CoCalc's frame editor, evolving the binary tree to an N-ary tree with tab groups.

**Architecture:** Evolve the existing Immutable.js-based binary frame tree into an N-ary tree with three node types (split, tabs, leaf). Create a new shared DnD module (`components/dnd/`) and refactor the file explorer to use it — this is a new abstraction + file explorer refactor, not just extraction of existing generic code. VS Code-like drop zones determine action: body=swap, title bar=tab merge, edges=split.

**Tech Stack:** TypeScript, React, @dnd-kit/core, Immutable.js, Jest

**Design Spec:** `src/docs/frame-editor-dnd-design.md`

---

## Invariants

These invariants govern how `active_id`, `full_id`, `is_only`, and frame
metadata behave during tree mutations. All tree-op callers (action methods)
must maintain them.

### `active_id`

- Must always point to a **leaf** node. `set_active_id` (actions.ts:698)
  warns and bails if the id is not a leaf.
- After `swap_frames`: `active_id` is unchanged (the leaf itself moved, but
  its id is still valid).
- After `move_frame`: set `active_id` to `sourceId` (the moved frame should
  be focused in its new location).
- After tab merge: set `active_id` to the moved frame (now the active tab).
- After deleting a frame that was active: call
  `make_most_recent_frame_active()` (existing behavior in `close_frame`,
  actions.ts:1008). This uses focus history first (`_get_most_recent_active_frame_id`),
  then falls back to `get_some_leaf_id` only if no history entry is valid.
  DnD operations that remove a frame from one location and insert elsewhere
  (directional splits, tab merges) should NOT trigger this fallback — instead
  they explicitly set `active_id` to `sourceId` after the move.

### `full_id`

- Points to a leaf that is "maximized" (full-tab mode). Can be `undefined`.
- After `swap_frames`: unchanged — the leaf is still in the tree, just in a
  different position.
- After `move_frame` with directional split: unchanged — the leaf is still in
  the tree.
- After any `move_frame` with `position === "tab"`: **always clear `full_id`**.
  Tab merges change the structural context around the maximized frame — even
  though the leaf itself is still a leaf, it's now inside a tabs container
  and "maximize" semantics don't apply. This is an unconditional clear, not a
  conditional check on `is_leaf_id`.
- After deleting `full_id`: clear it (existing behavior in `_tree_op`).
- Validation in `move_frame`: clear `full_id` if (a) it's no longer a valid
  leaf (`!is_leaf_id`), OR (b) the operation was a tab merge.

### `is_only`

- Currently computed as `frame_tree.get("type") !== "node"` in editor.tsx:170.
- Must be updated to: `type !== "node" && type !== "tabs"` — a single leaf
  with no splits and no tabs is `is_only`. This is part of the Phase 1b
  migration boundary.

### Tab behavior

- `activeTab` must always be a valid index: `0 <= activeTab < children.size`.
- When a tab is removed, if `activeTab >= children.size`, set it to
  `children.size - 1`.
- When a frame is dropped on a title bar, it becomes the active tab
  (`activeTab` = index of newly added tab).
- When the last-but-one tab is dragged out, the tabs node collapses via
  `collapse_trivial`. **Call site:** `move_frame` calls
  `this._tree_op("collapse_trivial")` immediately after
  `this._tree_op("move_node", ...)`. This also normalizes single-child
  split nodes left behind when `delete_node` removes a child during
  directional moves. `close_frame` already handles its own collapsing
  via the existing `delete_node` logic (single-child → child replaces
  parent), so no additional call is needed there.

### Leaf metadata preservation

- `swap_nodes` and `move_node` must preserve all leaf properties (`font_size`,
  `data-*` custom fields, `connection_status`, etc.). The operations move
  entire subtree references — they do NOT reconstruct nodes, so metadata is
  inherently preserved.
- Test: verify that `font_size` survives a swap.

### Resize semantics

- After any DnD operation that changes the tree structure, call
  `actions.set_resize?.()` to notify frames they may need to re-measure.

---

## Chunk 1: Data Structure + Tree Operations

### Task 1: Extend FrameTree type

**Files:**
- Modify: `src/packages/frontend/frame-editors/frame-tree/types.ts:17-27`

- [ ] **Step 1: Update FrameTree interface**

Add N-ary fields alongside existing binary fields (both coexist during migration):

```typescript
export interface FrameTree {
  direction?: FrameDirection;
  type: string;
  // Legacy binary fields (migrated on load)
  first?: FrameTree;
  second?: FrameTree;
  pos?: number;
  // N-ary fields
  children?: FrameTree[];
  sizes?: number[];
  activeTab?: number;  // only for type: "tabs"
  font_size?: number;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd src/packages/frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: no new errors (existing code still uses `first`/`second`, which remain valid)

- [ ] **Step 3: Commit**

```bash
git add src/packages/frontend/frame-editors/frame-tree/types.ts
git commit -m "feat(frame-tree): extend FrameTree type with N-ary fields (children/sizes/activeTab)"
```

### Task 2: Migration function + tree-ops N-ary traversal

**Files:**
- Modify: `src/packages/frontend/frame-editors/frame-tree/tree-ops.ts`

- [ ] **Step 1: Write the migration function**

Add at the top of `tree-ops.ts` (after imports):

```typescript
/**
 * Migrate a binary tree (first/second/pos) to N-ary (children/sizes).
 * Runs recursively. Idempotent — already-migrated trees pass through unchanged.
 */
export function migrateToNary(tree: ImmutableFrameTree): ImmutableFrameTree {
  if (tree == null) return tree;

  // Already migrated: has children
  if (tree.has("children")) {
    // Recurse into children
    const children = tree.get("children");
    const newChildren = children.map((child: ImmutableFrameTree) =>
      migrateToNary(child),
    );
    if (newChildren !== children) {
      return tree.set("children", newChildren);
    }
    return tree;
  }

  // Leaf node: no first/second — nothing to migrate
  const first = tree.get("first");
  const second = tree.get("second");
  if (!first && !second) {
    return tree;
  }

  // Internal binary node: convert first/second → children/sizes
  const pos = tree.get("pos") ?? 0.5;
  const migratedFirst = migrateToNary(first);
  const migratedSecond = migrateToNary(second);

  return tree
    .delete("first")
    .delete("second")
    .delete("pos")
    .set("children", fromJS([migratedFirst, migratedSecond]))
    .set("sizes", fromJS([pos, 1 - pos]));
}
```

- [ ] **Step 2: Update `call_on_children` to support both formats**

Replace the existing `call_on_children` function (line 125-128):

```typescript
function call_on_children(node: ImmutableFrameTree, f: Function): void {
  // N-ary path
  const children = node.get("children");
  if (children) {
    children.forEach((child: ImmutableFrameTree) => f(child));
    return;
  }
  // Legacy binary path
  if (node.has("first")) f(node.get("first"));
  if (node.has("second")) f(node.get("second"));
}
```

- [ ] **Step 3: Update `set` to traverse children array**

In the `set` function (line 14-56), replace the `for (const x of ["first", "second"])` loop (lines 45-52) with:

```typescript
    // N-ary path
    const children = node.get("children");
    if (children) {
      const newChildren = children.map((child: ImmutableFrameTree) => {
        const result = process(child);
        return result;
      });
      if (newChildren !== children) {
        node = node.set("children", newChildren);
      }
      return node;
    }
    // Legacy binary path
    for (const x of ["first", "second"]) {
      const sub0 = node.get(x);
      const sub1 = process(sub0);
      if (sub0 !== sub1) {
        node = node.set(x, sub1);
      }
    }
```

- [ ] **Step 4: Update `set_leafs`, `assign_ids`, `ensure_ids_are_unique`**

Apply the same pattern to each function that walks the tree — check for `children` first, fall back to `first`/`second`. The pattern in each is:

```typescript
// Replace:
for (const x of ["first", "second"]) { ... }
// With:
const children = node.get("children");
if (children) {
  const newChildren = children.map((child: ImmutableFrameTree) => process(child));
  if (newChildren !== children) {
    node = node.set("children", newChildren);
  }
  return node;
}
for (const x of ["first", "second"]) { ... }
```

Functions to update:
- `set_leafs` (line 66-88): the `for (const x of ["first", "second"])` loop at line 79
- `assign_ids` (line 104-123): the loop at line 112
- `ensure_ids_are_unique` (line 170-201): the loop at line 184
- `get_parent_id` (line 407-432): the `for (const limb of ["first", "second"])` loop at line 418
- `get_some_leaf_id` (line 380-405): the `for (const limb of ["first", "second"])` loop at line 392
- `split_leaf` outer function (line 316-352): the `for (const x of ["first", "second"])` loop at line 340

- [ ] **Step 5: Update `is_leaf` for N-ary**

```typescript
export function is_leaf(node: ImmutableFrameTree): boolean {
  return (
    node != null &&
    !node.get("first") &&
    !node.get("second") &&
    !node.get("children")
  );
}
```

- [ ] **Step 6: Update `delete_node` for N-ary**

Replace the existing function (line 245-279):

```typescript
export function delete_node(
  tree: ImmutableFrameTree,
  id: string,
): ImmutableFrameTree {
  if (tree.get("id") === id) {
    return tree; // never delete root
  }
  let done = false;
  function process(node: ImmutableFrameTree): ImmutableFrameTree {
    if (done) return node;

    // N-ary path
    const children = node.get("children");
    if (children) {
      const idx = children.findIndex(
        (c: ImmutableFrameTree) => c.get("id") === id,
      );
      if (idx >= 0) {
        done = true;
        const newChildren = children.delete(idx);
        const sizes = node.get("sizes");
        const newSizes = sizes ? sizes.delete(idx) : null;
        if (newChildren.size === 1) {
          // Collapse: single child replaces parent
          return newChildren.get(0);
        }
        // Renormalize sizes
        let result = node.set("children", newChildren);
        if (newSizes) {
          const total = newSizes.reduce((a: number, b: number) => a + b, 0);
          result = result.set(
            "sizes",
            newSizes.map((s: number) => s / total),
          );
        }
        // Adjust activeTab for tabs nodes
        if (node.get("type") === "tabs") {
          const activeTab = node.get("activeTab") ?? 0;
          if (idx < activeTab) {
            result = result.set("activeTab", activeTab - 1);
          } else if (idx === activeTab) {
            // Deleted the active tab — clamp to valid range
            result = result.set(
              "activeTab",
              Math.min(activeTab, newChildren.size - 1),
            );
          }
          // idx > activeTab: no change needed
        }
        return result;
      }
      // Descend
      const newCh = children.map((child: ImmutableFrameTree) => process(child));
      if (newCh !== children) {
        return node.set("children", newCh);
      }
      return node;
    }

    // Legacy binary path
    for (const x of ["first", "second"]) {
      if (!node.has(x)) continue;
      const t = node.get(x);
      if (t.get("id") === id) {
        done = true;
        return x === "first" ? node.get("second") : node.get("first");
      }
      const t1 = process(t);
      if (t1 !== t) {
        node = node.set(x, t1);
      }
    }
    return node;
  }
  return process(tree);
}
```

- [ ] **Step 7: Update `split_leaf` for N-ary**

In `split_the_leaf` (line 281-314), update to produce N-ary output:

```typescript
function split_the_leaf(
  leaf: ImmutableFrameTree,
  direction: FrameDirection,
  type?: string,
  extra?: object,
  first?: boolean,
  ids?: Set<string>,
) {
  let leaf2;
  if (type == leaf.get("type") || type == null) {
    leaf2 = leaf.set("id", generate_id(ids));
  } else {
    leaf2 = fromJS({ id: generate_id(ids), type });
  }
  if (extra != null) {
    for (const key in extra) {
      leaf2 = leaf2.set(key, fromJS(extra[key]));
    }
  }
  // Build N-ary node
  const children = first ? [leaf2, leaf] : [leaf, leaf2];
  return fromJS({
    direction,
    id: generate_id(ids),
    type: "node",
    children,
    sizes: [0.5, 0.5],
  }) as ImmutableFrameTree;
}
```

Also update `new_frame` (line 357-371) similarly:

```typescript
export function new_frame(
  tree: ImmutableFrameTree,
  type: string,
  direction: FrameDirection,
  first: boolean,
): ImmutableFrameTree {
  const ids = getAllIds(tree);
  const newLeaf = fromJS({ type, id: generate_id(ids) });
  const children = first ? [newLeaf, tree] : [tree, newLeaf];
  return fromJS({
    id: generate_id(ids),
    direction,
    type: "node",
    children,
    sizes: [0.5, 0.5],
  }) as ImmutableFrameTree;
}
```

- [ ] **Step 8: Add `swap_nodes` operation**

```typescript
/**
 * Swap two nodes in the tree by their IDs.
 * Single-pass algorithm: walks the tree once, replacing idA→nodeB and idB→nodeA
 * simultaneously. This avoids the bug where a two-pass approach would find a
 * duplicate ID after the first replacement.
 */
export function swap_nodes(
  tree: ImmutableFrameTree,
  idA: string,
  idB: string,
): ImmutableFrameTree {
  if (idA === idB) return tree;
  const nodeA = get_node(tree, idA);
  const nodeB = get_node(tree, idB);
  if (!nodeA || !nodeB) return tree;

  // Single pass: replace both simultaneously
  return replaceNodes(tree, new Map([
    [idA, nodeB],
    [idB, nodeA],
  ]));
}

/**
 * Replace multiple nodes in a single pass.
 * replacements: Map<id-to-find, replacement-node>
 */
function replaceNodes(
  tree: ImmutableFrameTree,
  replacements: Map<string, ImmutableFrameTree>,
): ImmutableFrameTree {
  let remaining = replacements.size;
  function process(node: ImmutableFrameTree): ImmutableFrameTree {
    if (node == null || remaining === 0) return node;
    const id = node.get("id");
    const replacement = replacements.get(id);
    if (replacement !== undefined) {
      remaining--;
      return replacement;
    }
    // Descend into children
    const children = node.get("children");
    if (children) {
      const newChildren = children.map((child: ImmutableFrameTree) =>
        process(child),
      );
      if (newChildren !== children) return node.set("children", newChildren);
      return node;
    }
    for (const x of ["first", "second"]) {
      if (!node.has(x)) continue;
      const sub = node.get(x);
      const sub1 = process(sub);
      if (sub1 !== sub) node = node.set(x, sub1);
    }
    return node;
  }
  return process(tree);
}

/** Replace a single node by id. Convenience wrapper around replaceNodes. */
function replaceNode(
  tree: ImmutableFrameTree,
  id: string,
  replacement: ImmutableFrameTree,
): ImmutableFrameTree {
  return replaceNodes(tree, new Map([[id, replacement]]));
}
```

- [ ] **Step 9: Add `move_node` operation**

```typescript
export type DropPosition =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "center"
  | "tab";

/**
 * Move sourceId to a position relative to targetId.
 * - "center": swap source and target
 * - "tab": merge source into target's tab group
 * - directional: remove source, split target, insert source as sibling
 */
export function move_node(
  tree: ImmutableFrameTree,
  sourceId: string,
  targetId: string,
  position: DropPosition,
): ImmutableFrameTree {
  if (sourceId === targetId) return tree;

  // Reject if target is a descendant of source — this would create a cycle
  // or lose the source subtree. Check before any mutation.
  const sourceNode = get_node(tree, sourceId);
  if (!sourceNode) return tree;
  if (has_id(sourceNode, targetId)) return tree; // target is inside source

  if (position === "center") return swap_nodes(tree, sourceId, targetId);
  if (position === "tab") return merge_as_tabs(tree, sourceId, targetId);

  // Directional: remove source, then split target

  // Remove source first
  let result = delete_node(tree, sourceId);

  // Determine split direction and order
  const direction: FrameDirection =
    position === "left" || position === "right" ? "col" : "row";
  const insertFirst = position === "left" || position === "top";

  // Check if target's parent is a split with the same direction — if so,
  // insert into the parent's children array instead of nesting
  const parentId = get_parent_id(result, targetId);
  if (parentId) {
    const parent = get_node(result, parentId);
    if (parent && parent.get("direction") === direction && parent.get("type") === "node") {
      const children = parent.get("children");
      if (children) {
        const targetIdx = children.findIndex(
          (c: ImmutableFrameTree) => c.get("id") === targetId,
        );
        if (targetIdx >= 0) {
          const insertIdx = insertFirst ? targetIdx : targetIdx + 1;
          const newChildren = children.insert(insertIdx, sourceNode);
          // Redistribute sizes evenly
          const newSize = 1.0 / newChildren.size;
          const newSizes = fromJS(
            Array(newChildren.size).fill(newSize),
          );
          const newParent = parent
            .set("children", newChildren)
            .set("sizes", newSizes);
          return replaceNode(result, parentId, newParent);
        }
      }
    }
  }

  // Different direction or no suitable parent: wrap target in new split
  const targetNode = get_node(result, targetId);
  if (!targetNode) return result;

  const ids = getAllIds(result);
  const childrenArr = insertFirst
    ? [sourceNode, targetNode]
    : [targetNode, sourceNode];
  const newSplit = fromJS({
    id: generate_id(ids),
    type: "node",
    direction,
    children: childrenArr,
    sizes: [0.5, 0.5],
  }) as ImmutableFrameTree;

  return replaceNode(result, targetId, newSplit);
}

/**
 * Merge source into target's tab group.
 * If target is already in a tabs node, add source to that group.
 * Otherwise, create a new tabs node wrapping both.
 */
function merge_as_tabs(
  tree: ImmutableFrameTree,
  sourceId: string,
  targetId: string,
): ImmutableFrameTree {
  const sourceNode = get_node(tree, sourceId);
  if (!sourceNode) return tree;

  // Remove source
  let result = delete_node(tree, sourceId);

  // Check if target is inside a tabs node
  const targetParentId = get_parent_id(result, targetId);
  if (targetParentId) {
    const parent = get_node(result, targetParentId);
    if (parent && parent.get("type") === "tabs") {
      // Add source to existing tab group
      const children = parent.get("children");
      const newChildren = children.push(sourceNode);
      const newParent = parent
        .set("children", newChildren)
        .set("activeTab", newChildren.size - 1);
      return replaceNode(result, targetParentId, newParent);
    }
  }

  // Create new tabs node wrapping target and source
  const targetNode = get_node(result, targetId);
  if (!targetNode) return result;

  const ids = getAllIds(result);
  const tabsNode = fromJS({
    id: generate_id(ids),
    type: "tabs",
    children: [targetNode, sourceNode],
    activeTab: 1,
  }) as ImmutableFrameTree;

  return replaceNode(result, targetId, tabsNode);
}
```

- [ ] **Step 10: Add `collapse_trivial` operation**

```typescript
/**
 * Normalize the tree: collapse single-child nodes.
 * A "node" or "tabs" with exactly 1 child is replaced by that child.
 */
export function collapse_trivial(
  tree: ImmutableFrameTree,
): ImmutableFrameTree {
  if (tree == null) return tree;

  const children = tree.get("children");
  if (children) {
    // Recurse first
    const newChildren = children.map((child: ImmutableFrameTree) =>
      collapse_trivial(child),
    );
    const updated =
      newChildren !== children ? tree.set("children", newChildren) : tree;

    // Collapse if single child
    if (updated.get("children").size === 1) {
      return updated.get("children").get(0);
    }
    return updated;
  }

  // Legacy binary — recurse
  for (const x of ["first", "second"]) {
    const sub0 = tree.get(x);
    if (sub0) {
      const sub1 = collapse_trivial(sub0);
      if (sub1 !== sub0) {
        tree = tree.set(x, sub1);
      }
    }
  }
  return tree;
}
```

- [ ] **Step 11: Commit**

```bash
git add src/packages/frontend/frame-editors/frame-tree/tree-ops.ts
git commit -m "feat(frame-tree): migrate tree-ops to N-ary tree (children/sizes)

Add migrateToNary, swap_nodes, move_node, merge_as_tabs, collapse_trivial.
Update all traversal functions to support both binary and N-ary formats."
```

### Task 3: Test suite for tree operations

**Files:**
- Create: `src/packages/frontend/frame-editors/frame-tree/__tests__/tree-ops.test.ts`

- [ ] **Step 1: Write migration tests**

```typescript
import { fromJS } from "immutable";
import {
  migrateToNary,
  swap_nodes,
  move_node,
  collapse_trivial,
  delete_node,
  split_leaf,
  assign_ids,
  is_leaf,
  get_node,
  get_leaf_ids,
} from "../tree-ops";
import type { ImmutableFrameTree } from "../types";

function makeTree(obj: object): ImmutableFrameTree {
  return assign_ids(fromJS(obj) as ImmutableFrameTree);
}

describe("migrateToNary", () => {
  it("converts a simple binary split", () => {
    const tree = makeTree({
      type: "node",
      direction: "col",
      pos: 0.6,
      first: { type: "cm" },
      second: { type: "terminal" },
    });
    const result = migrateToNary(tree);
    expect(result.has("first")).toBe(false);
    expect(result.has("second")).toBe(false);
    expect(result.get("children").size).toBe(2);
    expect(result.get("sizes").toJS()).toEqual([0.6, 0.4]);
    expect(result.get("children").get(0).get("type")).toBe("cm");
    expect(result.get("children").get(1).get("type")).toBe("terminal");
  });

  it("uses 0.5 default when pos is missing", () => {
    const tree = makeTree({
      type: "node",
      direction: "row",
      first: { type: "cm" },
      second: { type: "cm" },
    });
    const result = migrateToNary(tree);
    expect(result.get("sizes").toJS()).toEqual([0.5, 0.5]);
  });

  it("handles nested binary trees", () => {
    const tree = makeTree({
      type: "node",
      direction: "col",
      first: {
        type: "node",
        direction: "row",
        first: { type: "cm" },
        second: { type: "terminal" },
      },
      second: { type: "jupyter" },
    });
    const result = migrateToNary(tree);
    expect(result.get("children").size).toBe(2);
    const inner = result.get("children").get(0);
    expect(inner.get("children").size).toBe(2);
    expect(inner.get("children").get(0).get("type")).toBe("cm");
  });

  it("is idempotent on already-migrated trees", () => {
    const tree = makeTree({
      type: "node",
      direction: "col",
      first: { type: "cm" },
      second: { type: "terminal" },
    });
    const migrated = migrateToNary(tree);
    const twice = migrateToNary(migrated);
    expect(twice).toBe(migrated); // reference equality — no changes
  });

  it("leaves leaf nodes unchanged", () => {
    const tree = makeTree({ type: "cm" });
    const result = migrateToNary(tree);
    expect(result.get("type")).toBe("cm");
    expect(result.has("children")).toBe(false);
  });
});
```

- [ ] **Step 2: Write swap_nodes tests**

```typescript
describe("swap_nodes", () => {
  it("swaps two leaves", () => {
    const tree = migrateToNary(
      makeTree({
        type: "node",
        direction: "col",
        first: { type: "cm" },
        second: { type: "terminal" },
      }),
    );
    const idA = tree.get("children").get(0).get("id");
    const idB = tree.get("children").get(1).get("id");
    const result = swap_nodes(tree, idA, idB);
    expect(result.get("children").get(0).get("type")).toBe("terminal");
    expect(result.get("children").get(1).get("type")).toBe("cm");
    // IDs follow the nodes
    expect(result.get("children").get(0).get("id")).toBe(idB);
    expect(result.get("children").get(1).get("id")).toBe(idA);
  });

  it("is a no-op when swapping a node with itself", () => {
    const tree = migrateToNary(
      makeTree({
        type: "node",
        direction: "col",
        first: { type: "cm" },
        second: { type: "terminal" },
      }),
    );
    const idA = tree.get("children").get(0).get("id");
    const result = swap_nodes(tree, idA, idA);
    expect(result).toBe(tree);
  });
});
```

- [ ] **Step 3: Write move_node tests**

```typescript
describe("move_node", () => {
  it("center position swaps nodes", () => {
    const tree = migrateToNary(
      makeTree({
        type: "node",
        direction: "col",
        first: { type: "cm" },
        second: { type: "terminal" },
      }),
    );
    const idA = tree.get("children").get(0).get("id");
    const idB = tree.get("children").get(1).get("id");
    const result = move_node(tree, idA, idB, "center");
    expect(result.get("children").get(0).get("type")).toBe("terminal");
    expect(result.get("children").get(1).get("type")).toBe("cm");
  });

  it("tab position creates tabs group", () => {
    const tree = migrateToNary(
      makeTree({
        type: "node",
        direction: "col",
        first: { type: "cm" },
        second: { type: "terminal" },
      }),
    );
    const idA = tree.get("children").get(0).get("id");
    const idB = tree.get("children").get(1).get("id");
    const result = move_node(tree, idA, idB, "tab");
    // After removing A, the tree collapses to just B (which is now a tabs node)
    expect(result.get("type")).toBe("tabs");
    expect(result.get("children").size).toBe(2);
  });

  it("right position inserts into same-direction parent", () => {
    const tree = migrateToNary(
      makeTree({
        type: "node",
        direction: "col",
        first: { type: "cm" },
        second: {
          type: "node",
          direction: "col",
          first: { type: "terminal" },
          second: { type: "jupyter" },
        },
      }),
    );
    const cmId = tree.get("children").get(0).get("id");
    const inner = tree.get("children").get(1);
    const terminalId = inner.get("children").get(0).get("id");
    // Move cm to the right of terminal — same direction "col"
    const result = move_node(tree, cmId, terminalId, "right");
    // The inner node should now have 3 children
    // After delete_node removes cm from root, root collapses to the inner node
    const leafIds = get_leaf_ids(result);
    expect(Object.keys(leafIds).length).toBe(3);
  });

  it("different direction creates nested split", () => {
    const tree = migrateToNary(
      makeTree({
        type: "node",
        direction: "col",
        first: { type: "cm" },
        second: { type: "terminal" },
      }),
    );
    const cmId = tree.get("children").get(0).get("id");
    const termId = tree.get("children").get(1).get("id");
    // Move cm below terminal — direction "row" vs parent "col"
    const result = move_node(tree, cmId, termId, "bottom");
    // terminal's slot should now be a "row" split
    // After removing cm, tree collapses to the new split
    expect(result.get("type")).toBe("node");
    expect(result.get("direction")).toBe("row");
    expect(result.get("children").size).toBe(2);
  });
});
```

- [ ] **Step 4: Write collapse_trivial and delete_node tests**

```typescript
describe("collapse_trivial", () => {
  it("collapses single-child node", () => {
    const tree = fromJS({
      id: "root",
      type: "node",
      direction: "col",
      children: [{ id: "leaf1", type: "cm" }],
      sizes: [1.0],
    }) as ImmutableFrameTree;
    const result = collapse_trivial(tree);
    expect(result.get("type")).toBe("cm");
    expect(result.get("id")).toBe("leaf1");
  });

  it("collapses single-child tabs", () => {
    const tree = fromJS({
      id: "root",
      type: "tabs",
      children: [{ id: "leaf1", type: "terminal" }],
      activeTab: 0,
    }) as ImmutableFrameTree;
    const result = collapse_trivial(tree);
    expect(result.get("type")).toBe("terminal");
  });

  it("does not collapse nodes with 2+ children", () => {
    const tree = fromJS({
      id: "root",
      type: "node",
      direction: "col",
      children: [
        { id: "a", type: "cm" },
        { id: "b", type: "terminal" },
      ],
      sizes: [0.5, 0.5],
    }) as ImmutableFrameTree;
    const result = collapse_trivial(tree);
    expect(result.get("children").size).toBe(2);
  });
});

describe("delete_node (N-ary)", () => {
  it("removes child and renormalizes sizes", () => {
    const tree = fromJS({
      id: "root",
      type: "node",
      direction: "col",
      children: [
        { id: "a", type: "cm" },
        { id: "b", type: "terminal" },
        { id: "c", type: "jupyter" },
      ],
      sizes: [0.5, 0.25, 0.25],
    }) as ImmutableFrameTree;
    const result = delete_node(tree, "b");
    expect(result.get("children").size).toBe(2);
    // Sizes renormalized: 0.5/(0.5+0.25) and 0.25/(0.5+0.25)
    const sizes = result.get("sizes").toJS();
    expect(sizes[0]).toBeCloseTo(0.667, 2);
    expect(sizes[1]).toBeCloseTo(0.333, 2);
  });

  it("collapses to single child when only 2 remain", () => {
    const tree = fromJS({
      id: "root",
      type: "node",
      direction: "col",
      children: [
        { id: "a", type: "cm" },
        { id: "b", type: "terminal" },
      ],
      sizes: [0.5, 0.5],
    }) as ImmutableFrameTree;
    const result = delete_node(tree, "b");
    expect(result.get("type")).toBe("cm");
    expect(result.get("id")).toBe("a");
  });
});
```

- [ ] **Step 5: Write additional coverage tests**

```typescript
describe("is_leaf (N-ary)", () => {
  it("returns false for node with children", () => {
    const tree = fromJS({
      id: "root",
      type: "node",
      children: [{ id: "a", type: "cm" }],
    }) as ImmutableFrameTree;
    expect(is_leaf(tree)).toBe(false);
  });

  it("returns true for leaf without children", () => {
    const tree = fromJS({ id: "a", type: "cm" }) as ImmutableFrameTree;
    expect(is_leaf(tree)).toBe(true);
  });
});

describe("merge_as_tabs", () => {
  it("adds to existing tabs group", () => {
    const tree = fromJS({
      id: "root",
      type: "node",
      direction: "col",
      children: [
        { id: "a", type: "cm" },
        {
          id: "tabs1",
          type: "tabs",
          children: [
            { id: "b", type: "terminal" },
            { id: "c", type: "jupyter" },
          ],
          activeTab: 0,
        },
      ],
      sizes: [0.5, 0.5],
    }) as ImmutableFrameTree;
    const result = move_node(tree, "a", "b", "tab");
    // After removing a, root collapses to the tabs node
    expect(result.get("type")).toBe("tabs");
    expect(result.get("children").size).toBe(3);
  });
});

describe("split_leaf (N-ary output)", () => {
  it("produces children/sizes instead of first/second", () => {
    const tree = makeTree({ type: "cm" });
    const id = tree.get("id");
    const result = split_leaf(tree, id, "col", "terminal");
    expect(result.has("children")).toBe(true);
    expect(result.has("first")).toBe(false);
    expect(result.get("children").size).toBe(2);
    expect(result.get("sizes").toJS()).toEqual([0.5, 0.5]);
  });
});

describe("get_parent_id (N-ary)", () => {
  it("finds parent in N-ary tree", () => {
    const tree = fromJS({
      id: "root",
      type: "node",
      direction: "col",
      children: [
        { id: "a", type: "cm" },
        { id: "b", type: "terminal" },
        { id: "c", type: "jupyter" },
      ],
      sizes: [0.33, 0.34, 0.33],
    }) as ImmutableFrameTree;
    expect(get_parent_id(tree, "b")).toBe("root");
    expect(get_parent_id(tree, "root")).toBeUndefined();
  });
});

describe("failure and edge cases", () => {
  it("move_node into own descendant returns tree unchanged", () => {
    // Moving a parent into its own child would create a cycle.
    // move_node must detect this and reject before mutating.
    const tree = fromJS({
      id: "root",
      type: "node",
      direction: "col",
      children: [
        {
          id: "parent",
          type: "node",
          direction: "row",
          children: [
            { id: "childA", type: "cm" },
            { id: "childB", type: "terminal" },
          ],
          sizes: [0.5, 0.5],
        },
        { id: "other", type: "jupyter" },
      ],
      sizes: [0.5, 0.5],
    }) as ImmutableFrameTree;
    // Try to move parent into its own child — should not crash
    const result = move_node(tree, "parent", "childA", "right");
    // Tree must be returned unchanged — no data loss
    expect(result).toBe(tree);
  });

  it("swap preserves leaf metadata (font_size)", () => {
    const tree = fromJS({
      id: "root",
      type: "node",
      direction: "col",
      children: [
        { id: "a", type: "cm", font_size: 18 },
        { id: "b", type: "terminal", font_size: 14 },
      ],
      sizes: [0.5, 0.5],
    }) as ImmutableFrameTree;
    const result = swap_nodes(tree, "a", "b");
    // Node at position 0 should be "b" (terminal) with font_size 14
    expect(result.get("children").get(0).get("font_size")).toBe(14);
    // Node at position 1 should be "a" (cm) with font_size 18
    expect(result.get("children").get(1).get("font_size")).toBe(18);
  });

  it("move_node self-drop is a no-op", () => {
    const tree = fromJS({
      id: "root",
      type: "node",
      direction: "col",
      children: [
        { id: "a", type: "cm" },
        { id: "b", type: "terminal" },
      ],
      sizes: [0.5, 0.5],
    }) as ImmutableFrameTree;
    const result = move_node(tree, "a", "a", "right");
    expect(result).toBe(tree);
  });

  it("delete_node adjusts activeTab when active tab is deleted", () => {
    const tree = fromJS({
      id: "tabs1",
      type: "tabs",
      children: [
        { id: "a", type: "cm" },
        { id: "b", type: "terminal" },
        { id: "c", type: "jupyter" },
      ],
      activeTab: 2,
    }) as ImmutableFrameTree;
    const result = delete_node(tree, "c");
    expect(result.get("children").size).toBe(2);
    // activeTab 2 was deleted; should clamp to 1 (last valid index)
    expect(result.get("activeTab")).toBe(1);
  });

  it("delete_node decrements activeTab when earlier tab is deleted", () => {
    const tree = fromJS({
      id: "tabs1",
      type: "tabs",
      children: [
        { id: "a", type: "cm" },
        { id: "b", type: "terminal" },
        { id: "c", type: "jupyter" },
      ],
      activeTab: 2,
    }) as ImmutableFrameTree;
    const result = delete_node(tree, "a");
    expect(result.get("children").size).toBe(2);
    // Deleted index 0, which is before activeTab 2 → activeTab becomes 1
    expect(result.get("activeTab")).toBe(1);
  });
});
```

- [ ] **Step 6: Run tests**

Run: `cd src/packages/frontend && npx jest frame-editors/frame-tree/__tests__/tree-ops.test.ts --verbose 2>&1 | tail -30`
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/packages/frontend/frame-editors/frame-tree/__tests__/tree-ops.test.ts
git commit -m "test(frame-tree): add test suite for N-ary tree operations"
```

### Task 4: Integrate migration into Actions + update rendering

This task is the **migration boundary** — actions, rendering, drag bar, and
`is_only` logic all update together as one coordinated change. The binary
renderer (`render_cols`/`render_rows`), binary drag bar (`pos` scalar), and
binary `is_only` check are all replaced in this single task.

**Files:**
- Modify: `src/packages/frontend/frame-editors/code-editor/actions.ts:810-815`
- Modify: `src/packages/frontend/frame-editors/frame-tree/frame-tree.tsx:420-530`
- Modify: `src/packages/frontend/frame-editors/frame-tree/frame-tree-drag-bar.tsx`
- Modify: `src/packages/frontend/frame-editors/frame-tree/editor.tsx` (`is_only` check)

- [ ] **Step 1: Call migrateToNary in _process_frame_tree**

In `actions.ts`, update `_process_frame_tree` (line 810-815):

```typescript
  private _process_frame_tree(rawTree: FrameTree): Map<string, any> {
    let frame_tree = fromJS(rawTree) as Map<string, any>;
    frame_tree = tree_ops.assign_ids(frame_tree);
    frame_tree = tree_ops.ensure_ids_are_unique(frame_tree);
    frame_tree = tree_ops.migrateToNary(frame_tree);
    return frame_tree;
  }
```

Also add `migrateToNary` import — it's already imported via `import * as tree_ops`.

- [ ] **Step 2: Add swap_frames and move_frame action methods**

In `actions.ts`, after `set_frame_tree_leafs` (line ~887):

```typescript
  /** Swap two frames by their IDs. */
  swap_frames(idA: string, idB: string): void {
    this._tree_op("swap_nodes", idA, idB);
    this.set_resize?.();
  }

  /** Move a frame to a new position relative to another frame. */
  move_frame(
    sourceId: string,
    targetId: string,
    position: string,
  ): void {
    this._tree_op("move_node", sourceId, targetId, position);
    // Normalize: collapse single-child nodes left by delete_node
    this._tree_op("collapse_trivial");
    // Validate full_id
    const tree = this._get_tree();
    let local = this.store.get("local_view_state");
    const fullId = local?.get("full_id");
    if (fullId) {
      // Always clear on tab merge (structural context changes even
      // though the leaf is still a leaf — see invariant at line 42).
      // Also clear if the leaf was removed from the tree entirely.
      if (position === "tab" || !tree_ops.is_leaf_id(tree, fullId)) {
        local = local.delete("full_id");
        this.setState({ local_view_state: local });
      }
    }
    // Focus the moved frame
    this.set_active_id(sourceId, true);
    this.set_resize?.();
  }
```

- [ ] **Step 2b: Update is_only computation in editor.tsx**

In `editor.tsx` (line ~170), the `is_only` prop is computed as:
```typescript
frame_tree.get("type") !== "node"
```
Update to:
```typescript
frame_tree.get("type") !== "node" && frame_tree.get("type") !== "tabs"
```

A single leaf with no splits and no tabs is `is_only`. A tabs node containing
multiple frames is NOT `is_only`.

- [ ] **Step 3: Update frame-tree.tsx rendering for N-ary children**

In `frame-tree.tsx`, replace `get_data` (line 420-450), `render_cols` (line 452-470), `render_rows` (line 472-494), and `render_root` (line 503-520):

```typescript
    function render_children() {
      const children = frame_tree.get("children");
      if (!children) {
        // Legacy binary fallback (shouldn't happen after migration, but safe)
        const direction = frame_tree.get("direction");
        return direction === "col" ? render_cols_legacy() : render_rows_legacy();
      }

      const direction = frame_tree.get("direction");
      const sizes = frame_tree.get("sizes");
      const isHorizontal = direction === "col";
      const containerRef = isHorizontal ? cols_container_ref : rows_container_ref;

      const elements: React.ReactNode[] = [];
      children.forEach((child: any, i: number) => {
        if (i > 0) {
          elements.push(
            <FrameTreeDragBar
              key={`drag-${i}`}
              actions={actions}
              containerRef={containerRef}
              dir={direction}
              frame_tree={frame_tree}
              childIndex={i}
            />,
          );
        }
        const flex = sizes ? sizes.get(i, 1.0 / children.size) : 0.5;
        elements.push(
          <div
            key={child.get("id")}
            className="smc-vfill"
            style={{ display: "flex", flex }}
          >
            {render_one(child)}
          </div>,
        );
      });

      const outerStyle: React.CSSProperties = isHorizontal
        ? { display: "flex", flexDirection: "row", flex: 1, overflow: "hidden" }
        : {};

      return (
        <div
          ref={containerRef}
          className={isHorizontal ? undefined : "smc-vfill"}
          style={outerStyle}
        >
          {elements}
        </div>
      );
    }

    // Keep legacy renderers as fallback (can be removed once migration is confirmed stable)
    function render_cols_legacy() { /* existing render_cols body */ }
    function render_rows_legacy() { /* existing render_rows body */ }

    function render_root() {
      if (full_id) {
        const node = tree_ops.get_node(frame_tree, full_id);
        if (node != null) {
          return render_one(node);
        }
      }

      const type = frame_tree.get("type");
      if (type !== "node" && type !== "tabs") {
        return render_one(frame_tree);
      }
      if (type === "tabs") {
        // TODO: Phase 5 — TabsContainer
        // For now, render active tab only
        const activeTab = frame_tree.get("activeTab", 0);
        const children = frame_tree.get("children");
        if (children && children.size > 0) {
          const child = children.get(activeTab, children.get(0));
          return render_one(child);
        }
        return render_one(frame_tree);
      }
      return render_children();
    }
```

- [ ] **Step 4: Update FrameTreeDragBar for N-ary**

Add optional `childIndex` prop to `FrameTreeDragBar` to support N-ary splits.
The drag bar needs to update the `sizes` array instead of `pos`:

In `frame-tree-drag-bar.tsx`, update `calcPosition` to handle `sizes`:

```typescript
interface Props {
  actions: Actions;
  containerRef: React.RefObject<HTMLDivElement>;
  dir: "col" | "row";
  frame_tree: Map<string, any>;
  childIndex?: number; // index of the child AFTER this drag bar (for N-ary)
}
```

Replace `calcPosition` with an N-ary aware version:

```typescript
  function calcPosition(_, ui) {
    const elt = containerRef.current;
    if (elt == null) return;

    const offsetNode = dir === "col" ? ui.node.offsetLeft : ui.node.offsetTop;
    const offset = offsetNode + ui[axis] + DRAG_OFFSET;
    const totalSize = dir === "col" ? elt.offsetWidth : elt.offsetHeight;
    const origin = dir === "col" ? elt.offsetLeft : elt.offsetTop;
    const posFraction = (offset - origin) / totalSize;
    reset();

    if (childIndex != null) {
      // N-ary: update sizes[childIndex-1] and sizes[childIndex]
      const sizes = frame_tree.get("sizes");
      if (!sizes) return;
      const i = childIndex - 1;
      const j = childIndex;
      const combined = sizes.get(i) + sizes.get(j);
      // posFraction is the absolute position in the container;
      // we need the relative split between children i and j.
      // Sum of sizes before child i gives the start offset of child i.
      let startOffset = 0;
      for (let k = 0; k < i; k++) startOffset += sizes.get(k);
      const newSizeI = Math.max(0.05, Math.min(combined - 0.05, posFraction - startOffset));
      const newSizeJ = combined - newSizeI;
      const newSizes = sizes.set(i, newSizeI).set(j, newSizeJ);
      actions.set_frame_tree({ id: frame_tree.get("id"), sizes: newSizes.toJS() });
    } else {
      // Legacy binary: set pos directly
      const pos = dir === "col"
        ? (offset - elt.offsetLeft) / elt.offsetWidth
        : (offset - elt.offsetTop) / elt.offsetHeight;
      actions.set_frame_tree({ id: frame_tree.get("id"), pos });
    }
    actions.set_resize?.();
    actions.focus();
  }
```

- [ ] **Step 5: Verify app builds**

Run: `cd src/packages/frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(frame-tree): integrate N-ary migration into Actions and rendering

- migrateToNary runs on _process_frame_tree
- Add swap_frames/move_frame action methods
- Update FrameTree to render N children with drag bars
- Update FrameTreeDragBar for sizes array"
```

---

## Chunk 2: Shared DnD Module + File Explorer Refactor

**Scope note:** There is no existing generic DnD abstraction in the codebase.
The file explorer has a domain-specific `FileDndProvider` with reusable
*patterns* (sensor config, overlay positioning, overlay styling) but no
generic shared module. This task creates a new `components/dnd/` module with
generic constants and an overlay component, then refactors `file-dnd-provider`
to import from it. This is a new abstraction + file explorer refactor, not
just "extraction." The coupling increase is intentional — both DnD consumers
should behave identically for sensor activation and overlay appearance.

### Task 5: Create shared DnD module and refactor file explorer

**Files:**
- Create: `src/packages/frontend/components/dnd/config.ts`
- Create: `src/packages/frontend/components/dnd/drag-overlay-content.tsx`
- Modify: `src/packages/frontend/project/explorer/dnd/file-dnd-provider.tsx`

- [ ] **Step 1: Create shared DnD config**

```typescript
// src/packages/frontend/components/dnd/config.ts
//
// Shared DnD configuration constants for @dnd-kit.
// Used by both file explorer DnD and frame editor DnD to ensure
// identical activation behavior and visual appearance.

import type { Modifier } from "@dnd-kit/core";

// --- Sensor activation constraints ---

/** Mouse: 300ms hold OR 3px drag distance to activate. */
export const MOUSE_SENSOR_OPTIONS = {
  activationConstraint: { distance: 3, delay: 300, tolerance: 5 },
} as const;

/** Touch: 300ms hold to activate. */
export const TOUCH_SENSOR_OPTIONS = {
  activationConstraint: { delay: 300, tolerance: 5 },
} as const;

// --- Overlay positioning ---

/** Extract clientX/clientY from mouse, pointer, or touch events. */
function getEventCoords(event: Event): { x: number; y: number } | null {
  if ("clientX" in event && typeof (event as any).clientX === "number") {
    return {
      x: (event as MouseEvent).clientX,
      y: (event as MouseEvent).clientY,
    };
  }
  const te = event as TouchEvent;
  const touch = te.touches?.[0] ?? te.changedTouches?.[0];
  if (touch) {
    return { x: touch.clientX, y: touch.clientY };
  }
  return null;
}

/**
 * Position DragOverlay at pointer (12px bottom-right offset)
 * instead of at the original element's origin.
 */
export const snapToPointerModifier: Modifier = ({
  activatorEvent,
  activeNodeRect,
  transform,
}) => {
  if (!activatorEvent || !activeNodeRect) return transform;
  const coords = getEventCoords(activatorEvent);
  if (!coords) return transform;
  return {
    ...transform,
    x: transform.x + (coords.x - activeNodeRect.left) + 12,
    y: transform.y + (coords.y - activeNodeRect.top) + 12,
  };
};

export const DRAG_OVERLAY_MODIFIERS: Modifier[] = [snapToPointerModifier];

// --- Overlay styling ---

export const DRAG_OVERLAY_STYLE = {
  padding: "4px 10px",
  borderRadius: 4,
  fontSize: "12px",
  whiteSpace: "nowrap" as const,
  width: "max-content" as const,
  pointerEvents: "none" as const,
} as const;
```

- [ ] **Step 2: Create shared DragOverlayContent component**

```typescript
// src/packages/frontend/components/dnd/drag-overlay-content.tsx
//
// Generic drag overlay label shown next to the cursor during DnD.
// Used by both file explorer and frame editor for consistent appearance.

import { Icon, type IconName } from "@cocalc/frontend/components/icon";
import { COLORS } from "@cocalc/util/theme";
import { DRAG_OVERLAY_STYLE } from "./config";

type Variant = "valid" | "neutral" | "invalid";

const VARIANT_COLORS: Record<Variant, string> = {
  valid: `${COLORS.ANTD_LINK_BLUE}e0`,
  neutral: `${COLORS.GRAY_D}d0`,
  invalid: `${COLORS.ANTD_RED}e0`,
};

interface Props {
  icon: IconName;
  text: string;
  variant: Variant;
}

export function DragOverlayContent({ icon, text, variant }: Props) {
  return (
    <div
      style={{
        ...DRAG_OVERLAY_STYLE,
        background: VARIANT_COLORS[variant],
        color: COLORS.WHITE,
      }}
    >
      <Icon name={icon} style={{ marginRight: 6 }} />
      {text}
    </div>
  );
}
```

- [ ] **Step 3: Create index barrel export**

```typescript
// src/packages/frontend/components/dnd/index.ts
export {
  MOUSE_SENSOR_OPTIONS,
  TOUCH_SENSOR_OPTIONS,
  snapToPointerModifier,
  DRAG_OVERLAY_MODIFIERS,
  DRAG_OVERLAY_STYLE,
} from "./config";
export { DragOverlayContent } from "./drag-overlay-content";
```

- [ ] **Step 4: Refactor file-dnd-provider.tsx to use shared config**

In `file-dnd-provider.tsx`:

1. Add import: `import { MOUSE_SENSOR_OPTIONS, TOUCH_SENSOR_OPTIONS, DRAG_OVERLAY_MODIFIERS, DragOverlayContent } from "@cocalc/frontend/components/dnd";`

2. Replace the sensor config (lines 318-325):
```typescript
  const sensors = useSensors(
    useSensor(MouseSensor, MOUSE_SENSOR_OPTIONS),
    useSensor(TouchSensor, TOUCH_SENSOR_OPTIONS),
  );
```

3. Delete `snapToPointerModifier`, `getEventCoords`, and `DRAG_OVERLAY_MODIFIERS` (lines 132-178) — now imported from shared config.

4. Refactor `FileDragOverlayContent` (lines 181-258) to use `DragOverlayContent`:
```typescript
function FileDragOverlayContent({ data, isCopy, overFolder, isInvalid }) {
  const n = data.paths.length;
  if (isInvalid && overFolder != null) {
    const folderName = path_split(overFolder).tail || "Home";
    return (
      <DragOverlayContent
        icon="times-circle"
        text={`Cannot move into ${folderName}`}
        variant="invalid"
      />
    );
  }
  const op = isCopy ? "Copy" : "Move";
  if (overFolder != null) {
    const target = path_split(overFolder).tail || "Home";
    return (
      <DragOverlayContent
        icon={isCopy ? "copy" : "arrow-right"}
        text={`${op} ${n} ${plural(n, "file")} → ${target}`}
        variant="valid"
      />
    );
  }
  return (
    <DragOverlayContent
      icon={isCopy ? "copy" : "arrows"}
      text={`${op} ${n} ${plural(n, "file")} onto a folder`}
      variant="neutral"
    />
  );
}
```

- [ ] **Step 5: Verify file explorer still works**

Run: `cd src/packages/frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/packages/frontend/components/dnd/ src/packages/frontend/project/explorer/dnd/file-dnd-provider.tsx
git commit -m "refactor(dnd): extract shared DnD config and overlay from file explorer

New components/dnd/ module with MOUSE_SENSOR_OPTIONS, TOUCH_SENSOR_OPTIONS,
snapToPointerModifier, DRAG_OVERLAY_MODIFIERS, and DragOverlayContent.
File explorer refactored to import from shared module — no behavior change."
```

---

## Chunk 3: Frame DnD — Swap

### Task 6: Add grip icon to title bar

**Files:**
- Modify: `src/packages/frontend/frame-editors/frame-tree/title-bar.tsx`

- [ ] **Step 1: Add grip icon to renderMainMenusAndButtons**

In `title-bar.tsx`, update `renderMainMenusAndButtons` (line 839-856) to include
a drag handle before the buttons. The grip icon should be the first element
inside the flex container. It will receive `useDraggable` listeners in Task 7.

Add a ref that can be passed the drag listeners:

Use `COLORS` from `@cocalc/util/theme` (already imported in title-bar.tsx) —
do NOT introduce new hardcoded color values. The existing title bar has some
legacy hardcoded colors; preserve those as-is (cleaning them up is out of
scope for this feature). New code uses `COLORS` exclusively.

```typescript
  const dragHandleRef = useRef<HTMLDivElement>(null);

  function renderDragHandle(): Rendered {
    if (props.is_only) return null; // no drag if only one frame
    return (
      <div
        ref={dragHandleRef}
        style={{
          cursor: "grab",
          padding: "0 6px",
          color: COLORS.GRAY,
          display: "flex",
          alignItems: "center",
          borderRight: `1px solid ${COLORS.GRAY_L}`,
          marginRight: 4,
        }}
        title="Drag to rearrange"
      >
        <Icon name="bars" />
      </div>
    );
  }
```

Insert `{renderDragHandle()}` as the first child inside `renderMainMenusAndButtons`.

- [ ] **Step 2: Commit**

```bash
git add src/packages/frontend/frame-editors/frame-tree/title-bar.tsx
git commit -m "feat(frame-tree): add drag grip icon to frame title bar"
```

### Task 7: FrameDndProvider with swap drop zone

**Files:**
- Create: `src/packages/frontend/frame-editors/frame-tree/dnd/frame-dnd-provider.tsx`
- Create: `src/packages/frontend/frame-editors/frame-tree/dnd/use-frame-drop-zone.ts`
- Create: `src/packages/frontend/frame-editors/frame-tree/dnd/drop-zone-overlay.tsx`
- Modify: `src/packages/frontend/frame-editors/frame-tree/editor.tsx` (wrap with provider)

- [ ] **Step 1: Create FrameDndProvider**

```typescript
// src/packages/frontend/frame-editors/frame-tree/dnd/frame-dnd-provider.tsx

import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent, DragStartEvent } from "@dnd-kit/core";
import React, { useCallback, useState } from "react";

import {
  MOUSE_SENSOR_OPTIONS,
  TOUCH_SENSOR_OPTIONS,
  DRAG_OVERLAY_MODIFIERS,
  DragOverlayContent,
} from "@cocalc/frontend/components/dnd";
import { Actions } from "../../code-editor/actions";

export interface FrameDragData {
  type: "frame-drag";
  frameId: string;
  frameType: string; // e.g., "cm", "terminal" — for overlay text
  frameLabel: string; // e.g., "Code Editor" — human label
}

interface Props {
  actions: Actions;
  children: React.ReactNode;
}

export function FrameDndProvider({ actions, children }: Props) {
  const [activeData, setActiveData] = useState<FrameDragData | null>(null);
  const [dropAction, setDropAction] = useState<string>("Swap");
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, MOUSE_SENSOR_OPTIONS),
    useSensor(TouchSensor, TOUCH_SENSOR_OPTIONS),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as FrameDragData;
    if (data?.type === "frame-drag") {
      setActiveData(data);
      document.body.classList.add("cc-frame-dragging");
    }
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      document.body.classList.remove("cc-frame-dragging");
      const data = activeData;
      setActiveData(null);
      setDropTarget(null);
      setDropAction("Swap");

      if (!data || !event.over) return;

      const overData = event.over.data.current;
      if (!overData) return;

      const sourceId = data.frameId;
      const targetId = overData.frameId;
      if (sourceId === targetId) return;

      // For Phase 3: body drop = swap
      actions.swap_frames(sourceId, targetId);
    },
    [activeData, actions],
  );

  const handleDragCancel = useCallback(() => {
    document.body.classList.remove("cc-frame-dragging");
    setActiveData(null);
    setDropTarget(null);
  }, []);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {children}
      <DragOverlay modifiers={DRAG_OVERLAY_MODIFIERS}>
        {activeData ? (
          <DragOverlayContent
            icon={dropTarget ? "exchange" : "arrows"}
            text={
              dropTarget
                ? `↔ Swap with "${dropTarget}"`
                : `Drag onto a frame`
            }
            variant={dropTarget ? "valid" : "neutral"}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
```

- [ ] **Step 2: Create useFrameDropZone hook**

```typescript
// src/packages/frontend/frame-editors/frame-tree/dnd/use-frame-drop-zone.ts

import { useDroppable } from "@dnd-kit/core";

/**
 * Make a frame's body area a drop target for frame DnD.
 * Phase 3: only body drop (swap). Phase 4 adds edge detection.
 */
export function useFrameDropZone(frameId: string, frameLabel: string) {
  const { setNodeRef, isOver, active } = useDroppable({
    id: `frame-body-${frameId}`,
    data: { type: "frame-drop", frameId, frameLabel },
  });
  const isDragActive = active?.data?.current?.type === "frame-drag";
  const isSelfDrag = active?.data?.current?.frameId === frameId;

  return {
    dropRef: setNodeRef,
    isOver: isOver && isDragActive && !isSelfDrag,
    isDragActive: isDragActive && !isSelfDrag,
  };
}
```

- [ ] **Step 3: Create DropZoneOverlay component**

```typescript
// src/packages/frontend/frame-editors/frame-tree/dnd/drop-zone-overlay.tsx

import React from "react";
import { COLORS } from "@cocalc/util/theme";

interface Props {
  isOver: boolean;
  isDragActive: boolean;
}

/**
 * Semi-transparent overlay shown on a frame when it's a valid drop target.
 * Phase 3: shows only center zone. Phase 4 adds edge zones.
 */
export function DropZoneOverlay({ isOver, isDragActive }: Props) {
  if (!isDragActive) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 50,
        pointerEvents: "none",
        background: isOver
          ? `${COLORS.ANTD_LINK_BLUE}20`
          : `${COLORS.GRAY_L}10`,
        border: isOver
          ? `2px solid ${COLORS.ANTD_LINK_BLUE}`
          : `2px dashed ${COLORS.GRAY_L}`,
        borderRadius: 4,
        transition: "all 0.15s ease",
      }}
    />
  );
}
```

- [ ] **Step 4: Wire up in frame-tree.tsx**

In `frame-tree.tsx`, update the leaf rendering (around line 394-417) to include
the drop zone hook and overlay. The `FrameContext.Provider` wrapper div needs
`position: relative` and the drop ref:

Since `frame-tree.tsx`'s `render_one` is inside a `React.memo` component (not a
custom hook context), we can't call hooks like `useFrameDropZone` directly in it.
Extract the leaf rendering into a separate `FrameLeafContainer` component:

```typescript
// Create: src/packages/frontend/frame-editors/frame-tree/frame-leaf-container.tsx

import React from "react";
import { FrameContext } from "./frame-context";
import { useFrameDropZone } from "./dnd/use-frame-drop-zone";
import { DropZoneOverlay } from "./dnd/drop-zone-overlay";
import type { Rendered } from "@cocalc/frontend/app-framework";

interface Props {
  id: string;
  frameLabel: string;
  contextValue: any;
  style?: React.CSSProperties;
  onClick: () => void;
  onTouchStart: () => void;
  titlebar: Rendered;
  leaf: Rendered;
}

/**
 * Wrapper for frame leaf nodes that provides DnD drop zone support.
 * Extracted from FrameTree.render_one so we can use hooks.
 */
export const FrameLeafContainer: React.FC<Props> = ({
  id,
  frameLabel,
  contextValue,
  style,
  onClick,
  onTouchStart,
  titlebar,
  leaf,
}) => {
  const { dropRef, isOver, isDragActive } = useFrameDropZone(id, frameLabel);

  return (
    <FrameContext.Provider value={contextValue}>
      <div
        ref={dropRef}
        className="smc-vfill"
        style={{ ...style, position: "relative" }}
        onClick={onClick}
        onTouchStart={onTouchStart}
      >
        {titlebar}
        {leaf}
        <DropZoneOverlay isOver={isOver} isDragActive={isDragActive} />
      </div>
    </FrameContext.Provider>
  );
};
```

Then in `frame-tree.tsx`, replace the `FrameContext.Provider` block in
`render_one` with:

```typescript
return (
  <FrameLeafContainer
    id={desc.get("id")}
    frameLabel={spec?.short?.toString() ?? desc.get("type")}
    contextValue={{
      id: desc.get("id"),
      project_id,
      path,
      actions: editor_actions,
      desc,
      font_size: desc.get("font_size") ?? font_size,
      isFocused: active_id == desc.get("id"),
      isVisible: tab_is_visible,
      redux,
    }}
    style={spec?.style}
    onClick={() => actions.set_active_id(desc.get("id"), true)}
    onTouchStart={() => actions.set_active_id(desc.get("id"))}
    titlebar={render_titlebar(desc, spec, editor_actions)}
    leaf={render_leaf(desc, component, spec, editor_actions)}
  />
);
```

- [ ] **Step 5: Wrap editor with FrameDndProvider**

In `editor.tsx`, wrap the `FrameTree` component with `FrameDndProvider`:

```typescript
import { FrameDndProvider } from "./dnd/frame-dnd-provider";

// In the render:
<FrameDndProvider actions={actions}>
  <FrameTree ... />
</FrameDndProvider>
```

- [ ] **Step 6: Add useDraggable to title bar grip icon**

In `title-bar.tsx`, import `useDraggable` and attach it to the grip icon:

```typescript
import { useDraggable } from "@dnd-kit/core";
import type { FrameDragData } from "./dnd/frame-dnd-provider";

// Inside FrameTitleBar:
const { attributes, listeners, setNodeRef } = useDraggable({
  id: `frame-drag-${props.id}`,
  data: {
    type: "frame-drag",
    frameId: props.id,
    frameType: props.type,
    frameLabel: spec?.short?.toString() ?? props.type,
  } satisfies FrameDragData,
});

// Apply to grip icon (replaces the placeholder from Task 6):
function renderDragHandle(): Rendered {
  if (props.is_only) return null;
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        cursor: "grab",
        padding: "0 6px",
        color: COLORS.GRAY,
        display: "flex",
        alignItems: "center",
        borderRight: `1px solid ${COLORS.GRAY_L}`,
        marginRight: 4,
      }}
      title="Drag to rearrange"
    >
      <Icon name="bars" />
    </div>
  );
}
```

- [ ] **Step 7: Add CSS for cc-frame-dragging body class**

In `src/packages/frontend/index.sass`, add rules for frame dragging
(modeled after the existing `body.cc-file-dragging` rules):

```sass
body.cc-frame-dragging
  cursor: grabbing !important
  user-select: none
```

- [ ] **Step 8: Verify app builds and TypeScript compiles**

Run: `cd src/packages/frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

- [ ] **Step 9: Commit**

```bash
git add src/packages/frontend/frame-editors/frame-tree/dnd/ \
        src/packages/frontend/frame-editors/frame-tree/editor.tsx \
        src/packages/frontend/frame-editors/frame-tree/frame-tree.tsx \
        src/packages/frontend/frame-editors/frame-tree/title-bar.tsx \
        src/packages/frontend/index.sass
git commit -m "feat(frame-tree): add DnD swap via grip icon and body drop zone

- FrameDndProvider with @dnd-kit sensors matching file explorer config
- useDraggable on grip icon in title bar
- useFrameDropZone + DropZoneOverlay on frame body
- Dropping frame A on frame B's body swaps them"
```

---

## Chunk 4: Edge-Zone Splits

### Task 8: Edge detection and directional drops

**Files:**
- Modify: `src/packages/frontend/frame-editors/frame-tree/dnd/use-frame-drop-zone.ts`
- Modify: `src/packages/frontend/frame-editors/frame-tree/dnd/drop-zone-overlay.tsx`
- Modify: `src/packages/frontend/frame-editors/frame-tree/dnd/frame-dnd-provider.tsx`

- [ ] **Step 1: Add edge detection to useFrameDropZone**

Extend the hook to compute which zone the pointer is in based on element geometry.
Use a `onPointerMove` handler on the drop target div to track position:

```typescript
export type DropZone = "center" | "top" | "bottom" | "left" | "right" | null;

export function computeDropZone(
  rect: DOMRect,
  pointerX: number,
  pointerY: number,
): DropZone {
  const relX = (pointerX - rect.left) / rect.width;
  const relY = (pointerY - rect.top) / rect.height;
  const EDGE = 0.25;

  // Check if in an edge zone
  const inTop = relY < EDGE;
  const inBottom = relY > 1 - EDGE;
  const inLeft = relX < EDGE;
  const inRight = relX > 1 - EDGE;

  // Corner resolution: closest edge wins
  if (inTop && inLeft) {
    return relY < relX ? "top" : "left";
  }
  if (inTop && inRight) {
    return relY < 1 - relX ? "top" : "right";
  }
  if (inBottom && inLeft) {
    return 1 - relY < relX ? "bottom" : "left";
  }
  if (inBottom && inRight) {
    return 1 - relY < 1 - relX ? "bottom" : "right";
  }
  if (inTop) return "top";
  if (inBottom) return "bottom";
  if (inLeft) return "left";
  if (inRight) return "right";
  return "center";
}
```

- [ ] **Step 2: Update DropZoneOverlay to show directional zones**

Show the active zone visually — highlight the top/bottom/left/right 25% strip
or the center area based on the computed zone:

```typescript
interface Props {
  isOver: boolean;
  isDragActive: boolean;
  activeZone: DropZone;
}
```

Render 5 overlay divs (one per zone), highlight the active one.

- [ ] **Step 3: Update FrameDndProvider to dispatch move_node on edge drops**

Map drop zones to `move_node` positions:
- `"center"` → `actions.swap_frames()`
- `"top"` → `actions.move_frame(sourceId, targetId, "top")`
- `"bottom"` → `actions.move_frame(sourceId, targetId, "bottom")`
- etc.

Update overlay text to show: "Split below Terminal", "Split right of Terminal", etc.

- [ ] **Step 4: Run tree-ops tests to verify move_node works**

Run: `cd src/packages/frontend && npx jest frame-editors/frame-tree/__tests__/tree-ops.test.ts --verbose`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/packages/frontend/frame-editors/frame-tree/dnd/
git commit -m "feat(frame-tree): add edge-zone detection for directional splits

Drop on edges splits the target: top/bottom for row splits, left/right
for col splits. Corner overlap resolved by closest-edge-wins rule."
```

---

## Chunk 5: Tab Groups

### Task 9: TabsContainer component

**Files:**
- Create: `src/packages/frontend/frame-editors/frame-tree/tabs-container.tsx`
- Modify: `src/packages/frontend/frame-editors/frame-tree/frame-tree.tsx`

- [ ] **Step 1: Create TabsContainer**

Renders a `type: "tabs"` node using Ant Design `Tabs`. Each tab shows the
frame's icon + type name. Tabs are draggable via @dnd-kit `SortableContext` +
`useSortable` (within the parent FrameDndProvider's DndContext — no nested
DndContext).

- [ ] **Step 2: Wire into render_root in frame-tree.tsx**

Replace the Phase 5 TODO placeholder:
```typescript
if (type === "tabs") {
  return <TabsContainer ... />;
}
```

- [ ] **Step 3: Add title bar drop zone for tab merge**

In `useFrameDropZone`, add detection for drops on the title bar area.
When a frame is dropped on another frame's title bar → `actions.move_frame(sourceId, targetId, "tab")`.

- [ ] **Step 4: Add tab-to-edge splitting**

When a tab label is dragged to the bottom/right/left/top edge of the
TabsContainer, call `actions.move_frame(tabId, tabGroupId, direction)` to
split the tab out into its own frame.

- [ ] **Step 5: Run all tests**

Run: `cd src/packages/frontend && npx jest frame-editors/frame-tree/__tests__/tree-ops.test.ts --verbose`
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add src/packages/frontend/frame-editors/frame-tree/tabs-container.tsx \
        src/packages/frontend/frame-editors/frame-tree/frame-tree.tsx \
        src/packages/frontend/frame-editors/frame-tree/dnd/
git commit -m "feat(frame-tree): add TabsContainer and tab merge/split DnD

- TabsContainer renders tabs nodes with Ant Design Tabs
- Title bar drop zone merges frames into tab groups
- Tab labels are draggable for reordering and splitting out"
```
