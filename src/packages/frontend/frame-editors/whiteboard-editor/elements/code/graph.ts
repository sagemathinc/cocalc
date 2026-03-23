/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
 * Graph-based code cell traversal for whiteboard/slides.
 *
 * Whiteboard code cells connected by directed edges form a tree.
 * This module validates that the reachable subgraph is a proper tree
 * (acyclic, single parent per node except root) and computes a
 * deterministic preorder traversal. Children are sorted by
 * page → y → x → id.
 */

import type { Element } from "../../types";

type ElementsById = Record<string, Element | undefined>;

interface CodeTreeOrder {
  order: string[];
}

interface CodeTreeError {
  error: string;
}

type CodeTreeResult = CodeTreeOrder | CodeTreeError;

function isVisibleCodeCell(element: Element | undefined): element is Element {
  return element?.type == "code" && element.hide == null;
}

function pageComparator(
  sortedPageIds: string[] | undefined,
  a?: string,
  b?: string,
) {
  if (a == b) return 0;
  const pageRanks = new Map<string, number>();
  sortedPageIds?.forEach((id, i) => pageRanks.set(id, i));
  // Elements with page == null belong to the default (first) page,
  // so use rank 0 instead of MAX to match visible page order.
  const aRank = a == null ? 0 : (pageRanks.get(a) ?? Number.MAX_SAFE_INTEGER);
  const bRank = b == null ? 0 : (pageRanks.get(b) ?? Number.MAX_SAFE_INTEGER);
  if (aRank != bRank) return aRank - bRank;
  return String(a ?? "").localeCompare(String(b ?? ""));
}

function compareCodeCells(
  a: Element,
  b: Element,
  sortedPageIds?: string[],
): number {
  const byPage = pageComparator(sortedPageIds, a.page, b.page);
  if (byPage != 0) return byPage;
  if (a.y != b.y) return a.y - b.y;
  if (a.x != b.x) return a.x - b.x;
  return a.id.localeCompare(b.id);
}

// Returns the set of visible elements directly reachable via edges from fromId.
function directEdgeTargets(
  elementsById: ElementsById,
  fromId: string,
): Set<string> {
  const targets = new Set<string>();
  for (const element of Object.values(elementsById)) {
    if (element?.type != "edge") continue;
    if (element.hide != null) continue;
    if (element.data?.from != fromId) continue;
    const to = element.data?.to;
    if (to == null) continue;
    const toElt = elementsById[to];
    if (toElt == null || toElt.hide != null) continue;
    targets.add(to);
  }
  return targets;
}

// Returns the set of code cells reachable from fromId, traversing
// transparently through non-code nodes (e.g., sticky notes).
// This allows chains like jupyter → sticky → jupyter to work.
function codeChildrenSet(
  elementsById: ElementsById,
  fromId: string,
): Set<string> {
  const children = new Set<string>();
  const visited = new Set<string>();
  const queue = [fromId];
  while (queue.length > 0) {
    const current = queue.pop()!;
    for (const targetId of directEdgeTargets(elementsById, current)) {
      if (visited.has(targetId)) continue;
      visited.add(targetId);
      if (isVisibleCodeCell(elementsById[targetId])) {
        children.add(targetId);
      } else {
        // Non-code node: traverse through it to find code cells beyond.
        queue.push(targetId);
      }
    }
  }
  return children;
}

export function getDirectCodeChildren(
  elementsById: ElementsById,
  fromId: string,
  sortedPageIds?: string[],
): string[] {
  return [...codeChildrenSet(elementsById, fromId)].sort((aId, bId) =>
    compareCodeCells(elementsById[aId]!, elementsById[bId]!, sortedPageIds),
  );
}

// Build a map from each code cell to the set of code cells that can
// reach it (possibly through transparent non-code nodes).
function getIncomingCodeParents(
  elementsById: ElementsById,
): Map<string, Set<string>> {
  const parents = new Map<string, Set<string>>();
  for (const element of Object.values(elementsById)) {
    if (!isVisibleCodeCell(element)) continue;
    parents.set(element.id, new Set());
  }
  // For each code cell, find which code cells it can reach via
  // codeChildrenSet (which traverses through non-code nodes).
  for (const element of Object.values(elementsById)) {
    if (!isVisibleCodeCell(element)) continue;
    for (const childId of codeChildrenSet(elementsById, element.id)) {
      parents.get(childId)?.add(element.id);
    }
  }
  return parents;
}

export function getCodeTreeOrder(
  elementsById: ElementsById,
  rootId: string,
  sortedPageIds?: string[],
): CodeTreeResult {
  if (!isVisibleCodeCell(elementsById[rootId])) {
    return { error: "Run Tree requires a visible code cell root." };
  }

  const reachable = new Set<string>();
  const path = new Set<string>();

  const visitReachable = (id: string): CodeTreeError | undefined => {
    if (path.has(id)) {
      return {
        error: "Run Tree requires the reachable code-cell graph to be acyclic.",
      };
    }
    if (reachable.has(id)) return;
    path.add(id);
    reachable.add(id);
    for (const childId of getDirectCodeChildren(
      elementsById,
      id,
      sortedPageIds,
    )) {
      const err = visitReachable(childId);
      if (err != null) return err;
    }
    path.delete(id);
  };

  const err = visitReachable(rootId);
  if (err != null) return err;

  // Validate tree structure using ALL incoming edges (not just from reachable
  // nodes). This catches cases like A→C, B→C where running from root B would
  // otherwise miss that C also depends on A outside the subtree.
  const allParents = getIncomingCodeParents(elementsById);

  for (const id of reachable) {
    if (id == rootId) {
      // Root must not have parents within the reachable set (but external
      // parents are fine — the user explicitly chose this cell as root).
      const parentsInTree = [...(allParents.get(id) ?? [])].filter((p) =>
        reachable.has(p),
      );
      if (parentsInTree.length != 0) {
        return {
          error:
            "Run Tree requires the reachable code-cell graph to have the selected cell as its unique root.",
        };
      }
      continue;
    }
    const parents = allParents.get(id) ?? new Set();
    if (parents.size != 1) {
      return {
        error:
          "Run Tree requires every reachable code cell after the root to have exactly one incoming code edge.",
      };
    }
    if (!reachable.has([...parents][0])) {
      return {
        error:
          "Run Tree requires every reachable code cell to receive its incoming edge from within the tree.",
      };
    }
  }

  const order: string[] = [];
  const visited = new Set<string>();
  const preorder = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    order.push(id);
    for (const childId of getDirectCodeChildren(
      elementsById,
      id,
      sortedPageIds,
    )) {
      if (reachable.has(childId)) {
        preorder(childId);
      }
    }
  };
  preorder(rootId);
  return { order };
}

export function getNextCodeTreeSuccessor(
  elementsById: ElementsById,
  currentId: string,
  sortedPageIds?: string[],
): string | undefined {
  const tree = getCurrentCodeTree(elementsById, currentId, sortedPageIds);
  if (tree == null) return;
  const index = tree.order.indexOf(currentId);
  if (index == -1 || index >= tree.order.length - 1) return;
  return tree.order[index + 1];
}

export function getPreviousCodeTreePredecessor(
  elementsById: ElementsById,
  currentId: string,
  sortedPageIds?: string[],
): string | undefined {
  const tree = getCurrentCodeTree(elementsById, currentId, sortedPageIds);
  if (tree == null) return;
  const index = tree.order.indexOf(currentId);
  if (index <= 0) return;
  return tree.order[index - 1];
}

function getCurrentCodeTree(
  elementsById: ElementsById,
  currentId: string,
  sortedPageIds?: string[],
): CodeTreeOrder | undefined {
  if (!isVisibleCodeCell(elementsById[currentId])) return;
  const parents = getIncomingCodeParents(elementsById);
  let rootId = currentId;
  const seen = new Set<string>();
  while (true) {
    if (seen.has(rootId)) return;
    seen.add(rootId);
    const parentIds = [...(parents.get(rootId) ?? new Set())];
    if (parentIds.length == 0) break;
    if (parentIds.length != 1) return;
    rootId = parentIds[0];
  }
  const tree = getCodeTreeOrder(elementsById, rootId, sortedPageIds);
  if ("error" in tree) return;
  return tree;
}
