/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Tree operations — supports both legacy binary (first/second/pos) and
N-ary (children/sizes) representations.
*/

import { fromJS } from "immutable";
import { FrameDirection, ImmutableFrameTree, SetMap } from "./types";
import { len, uuid } from "@cocalc/util/misc";

/**
 * Migrate a binary (first/second/pos) tree to N-ary (children/sizes).
 * Idempotent — already-migrated trees pass through unchanged.
 */
export function migrateToNary(tree: ImmutableFrameTree): ImmutableFrameTree {
  if (tree == null) return tree;
  // Already N-ary — recurse into children
  if (tree.has("children")) {
    const children = tree.get("children");
    const newChildren = children.map((child: ImmutableFrameTree) =>
      migrateToNary(child),
    );
    if (newChildren !== children) return tree.set("children", newChildren);
    return tree;
  }
  const first = tree.get("first");
  const second = tree.get("second");
  if (!first && !second) return tree; // leaf — nothing to do
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

export function set(tree: ImmutableFrameTree, obj: any): ImmutableFrameTree {
  const { id } = obj;
  if (id == null) {
    // id must be set
    return tree;
  }
  if (len(obj) < 2) {
    // nothing to do
    return tree;
  }
  let done = false;
  const process = (node) => {
    if (node == null || done) {
      return node;
    }
    if (node.get("id") === id) {
      // it's the one -- change it
      for (const k in obj) {
        const v = obj[k];
        if (k !== "id") {
          if (v == null) {
            // null or undefined means "delete", just like with syncdb
            node = node.delete(k);
          } else {
            node = node.set(k, fromJS(v));
          }
        }
      }
      done = true;
      return node;
    }
    // N-ary path
    const children = node.get("children");
    if (children) {
      const newChildren = children.map((child: ImmutableFrameTree) =>
        process(child),
      );
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
        // changed
        node = node.set(x, sub1);
      }
    }
    return node;
  };
  return process(tree);
}

export function set_leafs(
  tree: ImmutableFrameTree,
  obj: object,
): ImmutableFrameTree {
  if (len(obj) < 1) {
    // nothing to do
    return tree;
  }
  var process = function (node) {
    if (node == null) {
      return node;
    }
    if (is_leaf(node)) {
      // change it
      for (const k in obj) {
        const v = obj[k];
        node = node.set(k, fromJS(v));
      }
      return node;
    }
    // N-ary path
    const children = node.get("children");
    if (children) {
      const newChildren = children.map((child: ImmutableFrameTree) =>
        process(child),
      );
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
        // changed
        node = node.set(x, sub1);
      }
    }
    return node;
  };
  return process(tree);
}

// modifies ids to contain generated id.
function generate_id(ids?: Set<string>): string {
  let id = uuid().slice(0, 8);
  if (ids == null) return id;
  while (ids.has(id)) {
    id = uuid().slice(0, 8);
  }
  ids.add(id);
  return id;
}

// Ensure every node of the tree has an id set.
export function assign_ids(tree: ImmutableFrameTree): ImmutableFrameTree {
  var process = function (node) {
    if (node == null) {
      return node;
    }
    if (!node.has("id") || typeof node.get("id") != "string") {
      node = node.set("id", generate_id());
    }
    // N-ary path
    const children = node.get("children");
    if (children) {
      const newChildren = children.map((child: ImmutableFrameTree) =>
        process(child),
      );
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
        // changed
        node = node.set(x, sub1);
      }
    }
    return node;
  };
  return process(tree);
}

function call_on_children(node: ImmutableFrameTree, f: Function): void {
  const children = node.get("children");
  if (children) {
    children.forEach((child: ImmutableFrameTree) => f(child));
    return;
  }
  if (node.has("first")) f(node.get("first"));
  if (node.has("second")) f(node.get("second"));
}

// Call f on each node of tree.
// Does not return anything.
// Stops walking tree if f returns false.
function walk(tree: ImmutableFrameTree, f: Function): void {
  let done: boolean = false;
  function process(node) {
    if (done) return;
    if (f(node) === false) {
      done = true;
      return; // stop walking
    }
    call_on_children(node, process);
  }
  process(tree);
}

// Return map from leaf ids to true
export function get_leaf_ids(tree: ImmutableFrameTree): SetMap {
  const ids = {};
  walk(tree, function (node) {
    if (is_leaf(node)) {
      ids[node.get("id")] = true;
    }
  });
  return ids;
}

export function getAllIds(tree: ImmutableFrameTree): Set<string> {
  const ids = new Set<string>([]);
  walk(tree, function (node) {
    const id = node.get("id");
    if (id) {
      ids.add(id);
    }
  });
  return ids;
}

// Ensure ids are unique (changing tree if necessary).
// We assume every node has an id, and that they are all strings.
export function ensure_ids_are_unique(
  tree: ImmutableFrameTree,
): ImmutableFrameTree {
  const ids = {};
  let dupe = false;
  function process(node: ImmutableFrameTree): ImmutableFrameTree {
    if (node == null) {
      return node;
    }
    const id = node.get("id");
    if (ids[id] != null) {
      dupe = true;
      return node.set("id", generate_id());
    }
    // N-ary path
    const children = node.get("children");
    if (children) {
      const newChildren = children.map((child: ImmutableFrameTree) =>
        process(child),
      );
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
        // changed
        node = node.set(x, sub1);
      }
    }
    return node;
  }
  while (true) {
    dupe = false;
    tree = process(tree);
    if (!dupe) {
      return tree;
    }
  }
}

export function has_id(tree: ImmutableFrameTree, id: string): boolean {
  let has = false;
  function process(node: ImmutableFrameTree): void {
    if (has) {
      return;
    }
    if (node.get("id") === id) {
      has = true;
      return;
    }
    call_on_children(node, process);
  }
  process(tree);
  return has;
}

export function is_leaf(node: ImmutableFrameTree): boolean {
  return (
    node != null &&
    !node.get("first") &&
    !node.get("second") &&
    !node.get("children")
  );
}

// Get node in the tree with given id, or returned undefined if there is no such node.
export function get_node(
  tree: ImmutableFrameTree,
  id: string,
): ImmutableFrameTree | undefined {
  let the_node: ImmutableFrameTree | undefined;
  let done = false;
  function process(node: ImmutableFrameTree): void {
    if (done) {
      return;
    }
    if (node.get("id") === id) {
      the_node = node;
      done = true;
      return;
    }
    call_on_children(node, process);
  }
  process(tree);
  return the_node;
}

export function delete_node(
  tree: ImmutableFrameTree,
  id: string,
): ImmutableFrameTree {
  if (tree.get("id") === id) {
    // we never delete the root of the tree
    return tree;
  }
  let done = false;
  function process(node: ImmutableFrameTree): ImmutableFrameTree {
    if (done) {
      return node;
    }
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
        if (newChildren.size === 1) return newChildren.get(0);
        let result = node.set("children", newChildren);
        if (newSizes) {
          const total = newSizes.reduce((a: number, b: number) => a + b, 0);
          result = result.set(
            "sizes",
            newSizes.map((s: number) => s / total),
          );
        }
        if (node.get("type") === "tabs") {
          const activeTab = node.get("activeTab") ?? 0;
          if (idx < activeTab) {
            result = result.set("activeTab", activeTab - 1);
          } else if (idx === activeTab) {
            result = result.set(
              "activeTab",
              Math.min(activeTab, newChildren.size - 1),
            );
          }
        }
        return result;
      }
      const newCh = children.map((child: ImmutableFrameTree) => process(child));
      if (newCh !== children) return node.set("children", newCh);
      return node;
    }
    // Legacy binary path
    for (const x of ["first", "second"]) {
      if (!node.has(x)) continue;
      const t = node.get(x);
      if (t.get("id") == id) {
        // replace this entire node by the other branch.
        done = true;
        if (x === "first") {
          return node.get("second");
        } else {
          return node.get("first");
        }
      }
      // descend the tree
      const t1 = process(t);
      if (t1 !== t) {
        node = node.set(x, t1);
      }
    }
    return node;
  }
  return process(tree);
}

function split_the_leaf(
  leaf: ImmutableFrameTree,
  direction: FrameDirection,
  type?: string,
  extra?: object,
  first?: boolean,
  ids?: Set<string>,
) {
  // 1. split this leaf node
  let leaf2;
  if (type == leaf.get("type") || type == null) {
    // Same type: Make another leaf that is identical, except with a new id.
    leaf2 = leaf.set("id", generate_id(ids));
  } else {
    // Different type: make blank leaf with just an id and type
    leaf2 = fromJS({ id: generate_id(ids), type });
  }
  // Also, set extra data if given.
  if (extra != null) {
    for (const key in extra) {
      leaf2 = leaf2.set(key, fromJS(extra[key]));
    }
  }
  // 2. Make node with these two leafs as children (N-ary format)
  const children = first ? [leaf2, leaf] : [leaf, leaf2];
  return fromJS({
    direction,
    id: generate_id(ids),
    type: "node",
    children,
    sizes: [0.5, 0.5],
  }) as ImmutableFrameTree;
}

export function split_leaf(
  tree: ImmutableFrameTree,
  id: string,
  direction: FrameDirection,
  type?: string,
  extra?: object,
  first?: boolean, // if true, new leaf is left or top instead of right or bottom.
): ImmutableFrameTree {
  let done = false;
  var process = function (node) {
    if (node == null || done) {
      return node;
    }
    if (node.get("id") === id) {
      done = true;
      return split_the_leaf(
        node,
        direction,
        type,
        extra,
        first,
        getAllIds(tree),
      );
    }
    // N-ary path
    const children = node.get("children");
    if (children) {
      const newChildren = children.map((child: ImmutableFrameTree) =>
        process(child),
      );
      if (newChildren !== children) {
        node = node.set("children", newChildren);
      }
      return node;
    }
    // Legacy binary path
    for (const x of ["first", "second"]) {
      // descend the tree
      const t0 = node.get(x);
      const t1 = process(t0);
      if (t1 !== t0) {
        node = node.set(x, t1);
        break;
      }
    }
    return node;
  };
  return process(tree);
}

// create a new frame next to or below the current frame tree.
// This results in an entirely new root with two children.
// One child is the current frame tree, and the other is a new leaf.
export function new_frame(
  tree: ImmutableFrameTree,
  type: string,
  direction: FrameDirection,
  first: boolean, // if true, new leaf is left or top instead of right or bottom.
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

export function is_leaf_id(tree: ImmutableFrameTree, id: string): boolean {
  const node = get_node(tree, id);
  if (node == null) return false;
  return is_leaf(node);
}

// Get id of some leaf node.  Assumes all ids are set.
export function get_some_leaf_id(tree: ImmutableFrameTree): string {
  let done: boolean = false;
  let id: string | undefined = undefined;
  function process(node: ImmutableFrameTree): void {
    if (done || node == null) {
      return;
    }
    if (is_leaf(node)) {
      id = node.get("id");
      done = true;
      return;
    }
    // N-ary path
    const children = node.get("children");
    if (children) {
      children.forEach((child: ImmutableFrameTree) => {
        if (!done) process(child);
      });
      return;
    }
    // Legacy binary path
    for (const limb of ["first", "second"]) {
      if (!done && node.has(limb)) {
        process(node.get(limb));
      }
    }
  }
  process(tree);
  if (!id) {
    throw Error(
      "BUG -- get_some_leaf_id could not find any leaves! -- tree corrupt",
    );
  }
  return id;
}

export function get_parent_id(
  tree: ImmutableFrameTree,
  id: string,
): string | undefined {
  let done: boolean = false;
  let parent_id: string | undefined = undefined;
  function process(node: ImmutableFrameTree): void {
    if (done || node == null) {
      return;
    }
    if (is_leaf(node)) return;
    // N-ary path
    const children = node.get("children");
    if (children) {
      for (let i = 0; i < children.size; i++) {
        if (done) return;
        const child: ImmutableFrameTree = children.get(i);
        if (child.get("id") === id) {
          done = true;
          parent_id = node.get("id");
        } else {
          process(child);
        }
      }
      return;
    }
    // Legacy binary path
    for (const limb of ["first", "second"]) {
      if (!done && node.has(limb)) {
        const x: ImmutableFrameTree = node.get(limb);
        if (x.get("id") === id) {
          done = true;
          parent_id = node.get("id");
        } else {
          process(x);
        }
      }
    }
  }
  process(tree);
  return parent_id;
}

// --- Helper functions for DnD and tree manipulation ---

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

function replaceNode(
  tree: ImmutableFrameTree,
  id: string,
  replacement: ImmutableFrameTree,
): ImmutableFrameTree {
  return replaceNodes(tree, new Map([[id, replacement]]));
}

export type DropPosition =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "center"
  | "tab";

export function swap_nodes(
  tree: ImmutableFrameTree,
  idA: string,
  idB: string,
): ImmutableFrameTree {
  if (idA === idB) return tree;
  const nodeA = get_node(tree, idA);
  const nodeB = get_node(tree, idB);
  if (!nodeA || !nodeB) return tree;
  return replaceNodes(
    tree,
    new Map([
      [idA, nodeB],
      [idB, nodeA],
    ]),
  );
}

export function move_node(
  tree: ImmutableFrameTree,
  sourceId: string,
  targetId: string,
  position: DropPosition,
): ImmutableFrameTree {
  if (sourceId === targetId) return tree;
  const sourceNode = get_node(tree, sourceId);
  if (!sourceNode) return tree;
  // Don't allow moving a node into its own subtree
  if (has_id(sourceNode, targetId)) return tree;
  if (position === "center") return swap_nodes(tree, sourceId, targetId);
  if (position === "tab") return merge_as_tabs(tree, sourceId, targetId);

  // Remove the source node first
  let result = delete_node(tree, sourceId);
  const direction: FrameDirection =
    position === "left" || position === "right" ? "col" : "row";
  const insertFirst = position === "left" || position === "top";

  // Try to insert into existing parent if it has the same direction
  const parentId = get_parent_id(result, targetId);
  if (parentId) {
    const parent = get_node(result, parentId);
    if (
      parent &&
      parent.get("direction") === direction &&
      parent.get("type") === "node"
    ) {
      const children = parent.get("children");
      if (children) {
        const targetIdx = children.findIndex(
          (c: ImmutableFrameTree) => c.get("id") === targetId,
        );
        if (targetIdx >= 0) {
          const insertIdx = insertFirst ? targetIdx : targetIdx + 1;
          const newChildren = children.insert(insertIdx, sourceNode);
          // Preserve existing sizes: borrow half the target's slot for
          // the new sibling instead of resetting all sizes to 1/n.
          const oldSizes = parent.get("sizes");
          let newSizes;
          if (oldSizes && oldSizes.size === children.size) {
            const targetSize = oldSizes.get(targetIdx) / 2;
            newSizes = oldSizes
              .set(targetIdx, targetSize)
              .insert(insertIdx, targetSize);
          } else {
            const newSize = 1.0 / newChildren.size;
            newSizes = fromJS(Array(newChildren.size).fill(newSize));
          }
          const newParent = parent
            .set("children", newChildren)
            .set("sizes", newSizes);
          return replaceNode(result, parentId, newParent);
        }
      }
    }
  }

  // Otherwise wrap the target in a new split node
  let targetNode = get_node(result, targetId);
  let effectiveTargetId = targetId;
  if (!targetNode) {
    // Target was collapsed by delete_node (e.g., source was a sibling
    // in a 2-child tabs/node container that collapsed to its remaining
    // child).  Find the surviving child and split around it instead.
    const origTarget = get_node(tree, targetId);
    if (origTarget?.get("children")) {
      const remainingChild = origTarget
        .get("children")
        .find((c: ImmutableFrameTree) => c.get("id") !== sourceId);
      if (remainingChild) {
        const remainingId = remainingChild.get("id") as string;
        targetNode = get_node(result, remainingId);
        if (targetNode) {
          effectiveTargetId = remainingId;
        }
      }
    }
    if (!targetNode) return result;

    // After collapse, try inserting into the surviving child's parent
    // (same-direction optimization) to avoid an unnecessary nested split.
    const parentId2 = get_parent_id(result, effectiveTargetId);
    if (parentId2) {
      const parent2 = get_node(result, parentId2);
      if (
        parent2 &&
        parent2.get("direction") === direction &&
        parent2.get("type") === "node"
      ) {
        const children2 = parent2.get("children");
        if (children2) {
          const targetIdx2 = children2.findIndex(
            (c: ImmutableFrameTree) => c.get("id") === effectiveTargetId,
          );
          if (targetIdx2 >= 0) {
            const insertIdx2 = insertFirst ? targetIdx2 : targetIdx2 + 1;
            const newChildren2 = children2.insert(insertIdx2, sourceNode);
            const oldSizes2 = parent2.get("sizes");
            // Borrow size from the target's slot for the new sibling
            const targetSize = oldSizes2
              ? oldSizes2.get(targetIdx2) / 2
              : 1.0 / newChildren2.size;
            const newSizes2 = oldSizes2
              ? oldSizes2
                  .set(targetIdx2, targetSize)
                  .insert(insertIdx2, targetSize)
              : fromJS(Array(newChildren2.size).fill(1.0 / newChildren2.size));
            const newParent2 = parent2
              .set("children", newChildren2)
              .set("sizes", newSizes2);
            return replaceNode(result, parentId2, newParent2);
          }
        }
      }
    }
  }
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
  return replaceNode(result, effectiveTargetId, newSplit);
}

function merge_as_tabs(
  tree: ImmutableFrameTree,
  sourceId: string,
  targetId: string,
): ImmutableFrameTree {
  const sourceNode = get_node(tree, sourceId);
  if (!sourceNode) return tree;
  let result = delete_node(tree, sourceId);

  // If target is already inside a tabs container, just append
  const targetParentId = get_parent_id(result, targetId);
  if (targetParentId) {
    const parent = get_node(result, targetParentId);
    if (parent && parent.get("type") === "tabs") {
      const children = parent.get("children");
      const newChildren = children.push(sourceNode);
      const newParent = parent
        .set("children", newChildren)
        .set("activeTab", newChildren.size - 1);
      return replaceNode(result, targetParentId, newParent);
    }
  }

  // Otherwise create a new tabs container wrapping target and source
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

/**
 * Extract a frame from its tab container and split it out as a sibling.
 * Unlike move_node, this handles the case where delete_node collapses a
 * 2-child tab container (destroying the container ID) by building the
 * split directly from the tab container's children.
 */
export function extract_from_tabs(
  tree: ImmutableFrameTree,
  sourceId: string,
  position: DropPosition,
): ImmutableFrameTree {
  const parentId = get_parent_id(tree, sourceId);
  if (!parentId) return tree;
  const parent = get_node(tree, parentId);
  if (!parent || parent.get("type") !== "tabs") return tree;
  const sourceNode = get_node(tree, sourceId);
  if (!sourceNode) return tree;

  const children = parent.get("children");
  const idx = children.findIndex(
    (c: ImmutableFrameTree) => c.get("id") === sourceId,
  );
  if (idx < 0) return tree;

  // Build the remaining tabs content
  const newChildren = children.delete(idx);
  let remaining: ImmutableFrameTree;
  if (newChildren.size === 1) {
    // Only 1 child left — unwrap from tabs container
    remaining = newChildren.get(0);
  } else {
    // Multiple children remain — keep the tabs container
    remaining = parent.set("children", newChildren);
    // Adjust activeTab index
    const activeTab = parent.get("activeTab") ?? 0;
    if (idx < activeTab) {
      remaining = remaining.set("activeTab", activeTab - 1);
    } else if (idx === activeTab) {
      remaining = remaining.set(
        "activeTab",
        Math.min(activeTab, newChildren.size - 1),
      );
    }
  }

  // Create a split node
  const direction: FrameDirection =
    position === "left" || position === "right" ? "col" : "row";
  const insertFirst = position === "left" || position === "top";
  const ids = getAllIds(tree);
  const childrenArr = insertFirst
    ? [sourceNode, remaining]
    : [remaining, sourceNode];
  const newSplit = fromJS({
    id: generate_id(ids),
    type: "node",
    direction,
    children: childrenArr,
    sizes: [0.5, 0.5],
  }) as ImmutableFrameTree;

  // Replace the tab container with the new split
  return replaceNode(tree, parentId, newSplit);
}

/**
 * Add a new tab (leaf) to an existing tabs container.
 */
export function add_tab(
  tree: ImmutableFrameTree,
  tabsId: string,
  type: string,
  path?: string,
): ImmutableFrameTree {
  const ids = getAllIds(tree);
  let newLeaf: any = { id: generate_id(ids), type };
  if (path) newLeaf.path = path;

  function process(node: ImmutableFrameTree): ImmutableFrameTree {
    if (node.get("id") === tabsId && node.get("type") === "tabs") {
      const children = node.get("children");
      return node
        .set("children", children.push(fromJS(newLeaf)))
        .set("activeTab", children.size);
    }
    const ch = node.get("children");
    if (ch) {
      const newCh = ch.map((c: ImmutableFrameTree) => process(c));
      if (newCh !== ch) return node.set("children", newCh);
    }
    return node;
  }
  return process(tree);
}

/**
 * Reorder a tab within its tabs container.
 * Moves the child with sourceFrameId to the position before beforeFrameId.
 * If beforeFrameId is null, moves to the end.
 */
export function reorder_tab(
  tree: ImmutableFrameTree,
  tabsId: string,
  sourceFrameId: string,
  beforeFrameId: string | null,
): ImmutableFrameTree {
  function process(node: ImmutableFrameTree): ImmutableFrameTree {
    if (node.get("id") === tabsId && node.get("type") === "tabs") {
      let children = node.get("children");
      if (!children) return node;
      const srcIdx = children.findIndex(
        (c: ImmutableFrameTree) => c.get("id") === sourceFrameId,
      );
      if (srcIdx < 0) return node;
      const srcNode = children.get(srcIdx);
      children = children.delete(srcIdx);
      if (beforeFrameId == null) {
        children = children.push(srcNode);
      } else {
        const tgtIdx = children.findIndex(
          (c: ImmutableFrameTree) => c.get("id") === beforeFrameId,
        );
        if (tgtIdx < 0) {
          children = children.push(srcNode);
        } else {
          children = children.insert(tgtIdx, srcNode);
        }
      }
      // Keep activeTab pointing at the moved frame
      const newIdx = children.findIndex(
        (c: ImmutableFrameTree) => c.get("id") === sourceFrameId,
      );
      return node.set("children", children).set("activeTab", newIdx);
    }
    const ch = node.get("children");
    if (ch) {
      const newCh = ch.map((c: ImmutableFrameTree) => process(c));
      if (newCh !== ch) return node.set("children", newCh);
    }
    return node;
  }
  return process(tree);
}

/**
 * Collapse nodes that have only a single child — they serve no layout purpose.
 */
export function collapse_trivial(tree: ImmutableFrameTree): ImmutableFrameTree {
  if (tree == null) return tree;
  const children = tree.get("children");
  if (children) {
    const newChildren = children.map((child: ImmutableFrameTree) =>
      collapse_trivial(child),
    );
    const updated =
      newChildren !== children ? tree.set("children", newChildren) : tree;
    if (updated.get("children").size === 1)
      return updated.get("children").get(0);
    return updated;
  }
  for (const x of ["first", "second"]) {
    const sub0 = tree.get(x);
    if (sub0) {
      const sub1 = collapse_trivial(sub0);
      if (sub1 !== sub0) tree = tree.set(x, sub1);
    }
  }
  return tree;
}
