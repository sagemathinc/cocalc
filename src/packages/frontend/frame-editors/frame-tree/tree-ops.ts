/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Binary tree operations
*/

import { fromJS } from "immutable";
import { FrameDirection, ImmutableFrameTree, SetMap } from "./types";
import { len, uuid } from "@cocalc/util/misc";

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
  obj: object
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
    // walk further
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
  tree: ImmutableFrameTree
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
  return node != null && !node.get("first") && !node.get("second");
}

// Get node in the tree with given id, or returned undefined if there is no such node.
export function get_node(
  tree: ImmutableFrameTree,
  id: string
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
  id: string
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
  ids?: Set<string>
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
  // 2. Make node with these two leafs
  let node = fromJS({ direction, id: generate_id(ids), type: "node" }) as ImmutableFrameTree;
  if (first) {
    node = node.set("first", leaf2);
    node = node.set("second", leaf);
  } else {
    node = node.set("first", leaf);
    node = node.set("second", leaf2);
  }
  return node;
}

export function split_leaf(
  tree: ImmutableFrameTree,
  id: string,
  direction: FrameDirection,
  type?: string,
  extra?: object,
  first?: boolean // if true, new leaf is left or top instead of right or bottom.
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
        getAllIds(tree)
      );
    }
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
  first: boolean // if true, new leaf is left or top instead of right or bottom.
): ImmutableFrameTree {
  const ids = getAllIds(tree);
  const newTree = fromJS({
    id: generate_id(ids),
    direction,
    type: "node",
    [first ? "first" : "second"]: { type, id: generate_id(ids) },
  }) as ImmutableFrameTree;
  return newTree.set(first ? "second" : "first", tree) as ImmutableFrameTree;
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
    for (const limb of ["first", "second"]) {
      if (!done && node.has(limb)) {
        process(node.get(limb));
      }
    }
  }
  process(tree);
  if (!id) {
    throw Error(
      "BUG -- get_some_leaf_id could not find any leaves! -- tree corrupt"
    );
  }
  return id;
}

export function get_parent_id(
  tree: ImmutableFrameTree,
  id: string
): string | undefined {
  let done: boolean = false;
  let parent_id: string | undefined = undefined;
  function process(node: ImmutableFrameTree): void {
    if (done || node == null) {
      return;
    }
    if (is_leaf(node)) return;
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
