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
  get_leaf_ids,
  get_parent_id,
  extract_from_tabs,
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
    expect(twice).toBe(migrated); // reference equality
  });

  it("leaves leaf nodes unchanged", () => {
    const tree = makeTree({ type: "cm" });
    const result = migrateToNary(tree);
    expect(result.get("type")).toBe("cm");
    expect(result.has("children")).toBe(false);
  });
});

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
    const result = move_node(tree, cmId, terminalId, "right");
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
    const result = move_node(tree, cmId, termId, "bottom");
    expect(result.get("type")).toBe("node");
    expect(result.get("direction")).toBe("row");
    expect(result.get("children").size).toBe(2);
  });
});

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
    expect(get_parent_id(tree, "a")).toBe("root");
    expect(get_parent_id(tree, "c")).toBe("root");
    expect(get_parent_id(tree, "root")).toBeUndefined();
  });
});

describe("failure and edge cases", () => {
  it("move_node into own descendant returns tree unchanged", () => {
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
    const result = move_node(tree, "parent", "childA", "right");
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
    expect(result.get("children").get(0).get("font_size")).toBe(14);
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
    expect(result.get("activeTab")).toBe(1);
  });
});

describe("extract_from_tabs", () => {
  it("extracts a tab from a 3-tab container (bottom split)", () => {
    const tree = fromJS({
      id: "tabs1",
      type: "tabs",
      children: [
        { id: "a", type: "cm" },
        { id: "b", type: "terminal" },
        { id: "c", type: "jupyter" },
      ],
      activeTab: 0,
    }) as ImmutableFrameTree;
    const result = extract_from_tabs(tree, "a", "bottom");
    // Result should be a split node with remaining tabs + extracted frame
    expect(result.get("type")).toBe("node");
    expect(result.get("direction")).toBe("row");
    expect(result.get("children").size).toBe(2);
    // First child: remaining tabs (b, c)
    const remaining = result.get("children").get(0);
    expect(remaining.get("type")).toBe("tabs");
    expect(remaining.get("children").size).toBe(2);
    expect(remaining.get("children").get(0).get("id")).toBe("b");
    expect(remaining.get("children").get(1).get("id")).toBe("c");
    // Second child: extracted frame
    const extracted = result.get("children").get(1);
    expect(extracted.get("type")).toBe("cm");
    expect(extracted.get("id")).toBe("a");
  });

  it("extracts a tab from a 2-tab container (unwraps remaining)", () => {
    const tree = fromJS({
      id: "tabs1",
      type: "tabs",
      children: [
        { id: "a", type: "cm" },
        { id: "b", type: "terminal" },
      ],
      activeTab: 0,
    }) as ImmutableFrameTree;
    const result = extract_from_tabs(tree, "a", "left");
    // Result should be a split node with 2 plain leaf children
    expect(result.get("type")).toBe("node");
    expect(result.get("direction")).toBe("col");
    expect(result.get("children").size).toBe(2);
    // "left" means extracted frame is first
    expect(result.get("children").get(0).get("id")).toBe("a");
    expect(result.get("children").get(0).get("type")).toBe("cm");
    // Remaining child (unwrapped from tabs)
    expect(result.get("children").get(1).get("id")).toBe("b");
    expect(result.get("children").get(1).get("type")).toBe("terminal");
  });

  it("respects position: left puts extracted frame first", () => {
    const tree = fromJS({
      id: "tabs1",
      type: "tabs",
      children: [
        { id: "a", type: "cm" },
        { id: "b", type: "terminal" },
      ],
      activeTab: 0,
    }) as ImmutableFrameTree;
    const result = extract_from_tabs(tree, "b", "left");
    expect(result.get("direction")).toBe("col");
    expect(result.get("children").get(0).get("id")).toBe("b");
    expect(result.get("children").get(1).get("id")).toBe("a");
  });

  it("respects position: right puts extracted frame second", () => {
    const tree = fromJS({
      id: "tabs1",
      type: "tabs",
      children: [
        { id: "a", type: "cm" },
        { id: "b", type: "terminal" },
      ],
      activeTab: 0,
    }) as ImmutableFrameTree;
    const result = extract_from_tabs(tree, "b", "right");
    expect(result.get("direction")).toBe("col");
    expect(result.get("children").get(0).get("id")).toBe("a");
    expect(result.get("children").get(1).get("id")).toBe("b");
  });

  it("respects position: top puts extracted frame first with row direction", () => {
    const tree = fromJS({
      id: "tabs1",
      type: "tabs",
      children: [
        { id: "a", type: "cm" },
        { id: "b", type: "terminal" },
        { id: "c", type: "jupyter" },
      ],
      activeTab: 1,
    }) as ImmutableFrameTree;
    const result = extract_from_tabs(tree, "b", "top");
    expect(result.get("direction")).toBe("row");
    expect(result.get("children").get(0).get("id")).toBe("b");
    // Remaining tabs with a, c
    const remaining = result.get("children").get(1);
    expect(remaining.get("type")).toBe("tabs");
    expect(remaining.get("children").size).toBe(2);
  });

  it("adjusts activeTab when extracting before the active tab", () => {
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
    const result = extract_from_tabs(tree, "a", "bottom");
    const remaining = result.get("children").get(0);
    expect(remaining.get("activeTab")).toBe(1);
  });

  it("adjusts activeTab when extracting the active tab itself", () => {
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
    const result = extract_from_tabs(tree, "c", "bottom");
    const remaining = result.get("children").get(0);
    // activeTab was 2, now there are only 2 children (0, 1), so clamped to 1
    expect(remaining.get("activeTab")).toBe(1);
  });

  it("is a no-op when source is not in a tab container", () => {
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
    const result = extract_from_tabs(tree, "a", "bottom");
    expect(result).toBe(tree);
  });

  it("is a no-op when source is the root", () => {
    const tree = fromJS({
      id: "a",
      type: "cm",
    }) as ImmutableFrameTree;
    const result = extract_from_tabs(tree, "a", "bottom");
    expect(result).toBe(tree);
  });

  it("works when tab container is nested inside a split", () => {
    const tree = fromJS({
      id: "root",
      type: "node",
      direction: "col",
      children: [
        { id: "other", type: "jupyter" },
        {
          id: "tabs1",
          type: "tabs",
          children: [
            { id: "a", type: "cm" },
            { id: "b", type: "terminal" },
          ],
          activeTab: 0,
        },
      ],
      sizes: [0.5, 0.5],
    }) as ImmutableFrameTree;
    const result = extract_from_tabs(tree, "a", "right");
    // The tab container should be replaced by a split node
    expect(result.get("type")).toBe("node");
    expect(result.get("children").size).toBe(2);
    // First child: other (unchanged)
    expect(result.get("children").get(0).get("id")).toBe("other");
    // Second child: new split containing b and a
    const newSplit = result.get("children").get(1);
    expect(newSplit.get("type")).toBe("node");
    expect(newSplit.get("direction")).toBe("col");
    expect(newSplit.get("children").get(0).get("id")).toBe("b");
    expect(newSplit.get("children").get(1).get("id")).toBe("a");
  });

  it("produces equal-sized children", () => {
    const tree = fromJS({
      id: "tabs1",
      type: "tabs",
      children: [
        { id: "a", type: "cm" },
        { id: "b", type: "terminal" },
      ],
      activeTab: 0,
    }) as ImmutableFrameTree;
    const result = extract_from_tabs(tree, "a", "bottom");
    expect(result.get("sizes").toJS()).toEqual([0.5, 0.5]);
  });
});
