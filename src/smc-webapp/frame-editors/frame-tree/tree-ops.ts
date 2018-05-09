/*
Binary tree operations
*/

import { fromJS, Map } from "immutable";
import { ImmutableFrameTree, SetMap } from "./types";
const misc = require("smc-util/misc");

export function set(tree, obj) {
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

export function set_leafs(tree, obj) {
  if (misc.len(obj) < 1) {
    // nothing to do
    return tree;
  }
  var process = function(node) {
    if (node == null) {
      return node;
    }
    if (exports.is_leaf(node)) {
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

const generate_id = () => misc.uuid().slice(0, 8);

// Ensure every node of the tree has an id set.
export function assign_ids(tree) {
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

// Call f on each node of tree.
// Does not return anything.
// Stops walking tree if f returns false.
function walk(tree, f): void {
  let done: boolean = false;
  function process(node) {
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

// Return map from leaf ids to true
export function get_leaf_ids(tree): SetMap {
  const ids = {};
  walk(tree, function(node) {
    if (exports.is_leaf(node)) {
      return (ids[node.get("id")] = true);
    }
  });
  return ids;
}

/*
* not used...
exports.num_leaves = (tree) ->
    n = 0
    walk tree, (node) ->
        if exports.is_leaf(node)
            n += 1
    return n
*/

// Ensure ids are unique (changing tree if necessary).
// We assume every node has an id, and that they are all strings.
export function ensure_ids_are_unique(tree) {
  const ids = {};
  let dupe = false;
  var process = function(node) {
    if (node == null) {
      return node;
    }
    const id = node.get("id");
    if (ids[id] != null) {
      dupe = true;
      return node.set("id", generate_id());
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

export function has_id(tree, id) {
  let has = false;
  var process = function(node) {
    if (node == null || has) {
      return;
    }
    if (node.get("id") === id) {
      has = true;
      return;
    }
    return (() => {
      const result: any[] = [];
      for (let x of ["first", "second"]) {
        if (has) {
          break;
        }
        result.push(process(node.get(x)));
      }
      return result;
    })();
  };
  process(tree);
  return has;
}

export function is_leaf(node) {
  return node != null && !node.get("first") && !node.get("second");
}

// Get node in the tree with given id, or returned undefined if there is no such node.
export function get_node(
  tree: ImmutableFrameTree,
  id: string
): Map<string, any> | undefined {
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
      const result: any[] = [];
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

export function split_leaf(tree, id:string, direction:string, type?:string) {
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

export function is_leaf_id(tree, id) {
  return exports.is_leaf(exports.get_node(tree, id));
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
    if (exports.is_leaf(node)) {
      id = node.get("id");
      done = true;
      return;
    }
    return (() => {
      const result: any[] = [];
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
