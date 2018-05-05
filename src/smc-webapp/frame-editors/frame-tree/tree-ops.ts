/*
Binary tree operations
*/

import { Map, fromJS } from "immutable";
const misc = require("smc-util/misc");

export interface IFrameTree {
  id: string;
  type: string;
  direction?: string;
  first?: FrameTree;
  second?: FrameTree;
  font_size?: number;
  path?: string;
  deletable?: boolean;
}

type Keys =
  | "id"
  | "type"
  | "direction"
  | "first"
  | "second"
  | "font_size"
  | "path"
  | "deletable";

type FrameTree = Map<Keys, any>;

type WalkFunction = (tree: FrameTree) => void | boolean;

// Call f on each node of tree.
// Does not return anything.
// Stops walking tree if f returns false.
function walk(tree: FrameTree, f: WalkFunction): void {
  let done: boolean = false;
  function process(node: FrameTree) {
    if (done) return;
    if (f(node) === false) {
      done = true;
      return; // stop walking
    }
    if (node.has("first")) process(node.get("first"));
    if (node.has("second")) process(node.get("second"));
  }
  process(tree);
}

/*
// Return new tree got from existing tree by modifying nodes as given by the function f.
// If returns false, stop the map.
export function map(tree: FrameTree, f: FrameTreeFunction): FrameTree {
  let done: boolean = false;
  function process(node: FrameTree): FrameTree {
    if (done) return;
    let node1: FrameTree = f(node);
    if (node1 === false) {
      done = true;
      return;
    }
    if (node.equals(node1)) node1 = node;

    const id = node.get("id");
    if (ids[id]) {
      dupe = true;
      return node.set("id", generate_id());
    }
    for (let x of ["first", "second"]) {
      if (node.has(x)) {
        const sub0 = node.get(x);
        const sub1 = process(sub0);
        if (sub0 !== sub1) {
          // changed
          node = node.set(x, sub1);
        }
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
*/

export function set(tree: FrameTree, obj: any): FrameTree {
  const { id } = obj;
  if (id == null) {
    // id must be set
    return tree;
  }
  if (misc.len(obj) < 2) {
    // nothing to do
    return tree;
  }
  let done = false;
  var process = function(node) {
    if (node == null || done) {
      return node;
    }
    if (node.get("id") === id) {
      // it's the one -- change it
      for (let k in obj) {
        const v = obj[k];
        if (k !== "id") {
          node = node.set(k, fromJS(v));
        }
      }
      done = true;
      return node;
    }
    for (let x of ["first", "second"]) {
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

export function set_leafs(tree: FrameTree, obj: object): FrameTree {
  if (misc.len(obj) < 1) {
    // nothing to do
    return tree;
  }
  var process = function(node) {
    if (node == null) {
      return node;
    }
    if (is_leaf(node)) {
      // change it
      for (let k in obj) {
        const v = obj[k];
        node = node.set(k, fromJS(v));
      }
      return node;
    }
    // walk further
    for (let x of ["first", "second"]) {
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

function generate_id(): string {
  return misc.uuid().slice(0, 8);
}

// Ensure every node of the tree has an id set.
export function assign_ids(tree : FrameTree) : FrameTree {
  var process = function(node) {
    if (node == null) {
      return node;
    }
    if (!node.has("id") || !misc.is_string(node.get("id"))) {
      node = node.set("id", generate_id());
    }
    for (let x of ["first", "second"]) {
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

// Return Javascript map from leaf ids to true
export function get_leaf_ids(tree: FrameTree): any {
  const ids: any = {};
  walk(tree, function(node) {
    if (is_leaf(node)) {
      ids[node.get("id")] = true;
    }
  });
  return ids;
}

// Ensure ids are unique, returning new tree with all changes made.
// We assume every node has an id, and that they are all strings.
export function ensure_ids_are_unique(tree: FrameTree): FrameTree {
  const ids = {};
  let dupe: boolean = false;
  function process(node: FrameTree): FrameTree {
    const id = node.get("id");
    if (ids[id]) {
      dupe = true;
      return node.set("id", generate_id());
    }
    if (node.has("first")) {
      const sub0 = node.get("first");
      const sub1 = process(sub0);
      if (sub0 !== sub1) {
        // changed
        node = node.set("first", sub1);
      }
    }
    if (node.has("second")) {
      const sub0 = node.get("second");
      const sub1 = process(sub0);
      if (sub0 !== sub1) {
        // changed
        node = node.set("second", sub1);
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

// otherwise, sets dupe = false again and runs through it again, generating
// new random ids when there is a conflict.

export function has_id(tree: FrameTree, id: string): boolean {
  let has: boolean = false;
  walk(tree, function(node) {
    if (node.get("id") == id) {
      has = true;
      return false;
    }
  });
  return has;
}

export function is_leaf(node: FrameTree): boolean {
  return !node.get("first") && !node.get("second");
}

/*
// Get node in the tree with given id
export function get_node(tree, id) {
  if (tree == null) {
    return;
  }
  let the_node = undefined;
  var process = function(node) {
    if (the_node != null || node == null) {
      return;
    }
    if (node.get("id") === id) {
      the_node = node;
      return;
    }
    return (() => {
      const result = [];
      for (let x of ["first", "second"]) {
        if (the_node != null) {
          break;
        }
        result.push(process(node.get(x)));
      }
      return result;
    })();
  };
  process(tree);
  return the_node;
}

export function delete_node(tree, id) {
  if (tree == null) {
    return;
  }
  if (tree.get("id") === id) {
    // we never delete the root of the tree
    return tree;
  }
  let done = false;
  var process = function(node) {
    if (node == null || done) {
      return node;
    }
    for (let x of ["first", "second"]) {
      const t = node.get(x);
      if ((t != null ? t.get("id") : undefined) === id) {
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
  };
  return process(tree);
}

const split_the_leaf = function(leaf, direction, type) {
  // split this leaf node
  // 1. Make another leaf that is identical, except with a new id.
  let leaf2 = leaf.set("id", generate_id());
  if (type != null) {
    leaf2 = leaf2.set("type", type);
  }
  // 2. Make node with these two leafs
  let node = fromJS({ direction, id: generate_id(), type: "node" });
  node = node.set("first", leaf);
  node = node.set("second", leaf2);
  return node;
};

export function split_leaf(tree, id, direction, type) {
  let done = false;
  var process = function(node) {
    if (node == null || done) {
      return node;
    }
    if (node.get("id") === id) {
      done = true;
      return split_the_leaf(node, direction, type);
    }
    for (let x of ["first", "second"]) {
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
  let t1 = process(tree);
  if (t1 !== tree) {
    // some change -- make sure any newly generated id's are unique...
    t1 = exports.ensure_ids_are_unique(t1);
  }
  return t1;
}

export function is_leaf_id(tree: FrameTree, id: string): boolean {
  return is_leaf(get_node(tree, id));
}

// Get id of some leaf node.  Assumes all ids are set.
export function get_some_leaf_id(tree) {
  let done = false;
  let id = undefined;
  var process = function(node) {
    if (node == null || done) {
      return;
    }
    // must be leaf
    if (is_leaf(node)) {
      id = node.get("id");
      done = true;
      return;
    }
    return (() => {
      const result = [];
      for (let x of ["first", "second"]) {
        if (!done) {
          result.push(process(node.get(x)));
        } else {
          result.push(undefined);
        }
      }
      return result;
    })();
  };
  process(tree);
  return id;
}

*/
