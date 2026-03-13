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
  const aRank =
    a == null
      ? Number.MAX_SAFE_INTEGER
      : (pageRanks.get(a) ?? Number.MAX_SAFE_INTEGER);
  const bRank =
    b == null
      ? Number.MAX_SAFE_INTEGER
      : (pageRanks.get(b) ?? Number.MAX_SAFE_INTEGER);
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

function codeChildrenSet(
  elementsById: ElementsById,
  fromId: string,
): Set<string> {
  const children = new Set<string>();
  for (const element of Object.values(elementsById)) {
    if (element?.type != "edge") continue;
    if (element.data?.from != fromId) continue;
    const to = element.data?.to;
    if (to == null) continue;
    if (!isVisibleCodeCell(elementsById[to])) continue;
    children.add(to);
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

function getIncomingCodeParents(
  elementsById: ElementsById,
): Map<string, Set<string>> {
  const parents = new Map<string, Set<string>>();
  for (const element of Object.values(elementsById)) {
    if (!isVisibleCodeCell(element)) continue;
    parents.set(element.id, new Set());
  }
  for (const element of Object.values(elementsById)) {
    if (element?.type != "edge") continue;
    const from = element.data?.from;
    const to = element.data?.to;
    if (from == null || to == null) continue;
    if (
      !isVisibleCodeCell(elementsById[from]) ||
      !isVisibleCodeCell(elementsById[to])
    ) {
      continue;
    }
    parents.get(to)?.add(from);
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

  const reachableParents = new Map<string, Set<string>>();
  for (const id of reachable) {
    reachableParents.set(id, new Set());
  }
  for (const id of reachable) {
    for (const childId of getDirectCodeChildren(
      elementsById,
      id,
      sortedPageIds,
    )) {
      if (reachable.has(childId)) {
        reachableParents.get(childId)?.add(id);
      }
    }
  }

  for (const [id, parents] of reachableParents) {
    if (id == rootId) {
      if (parents.size != 0) {
        return {
          error:
            "Run Tree requires the reachable code-cell graph to have the selected cell as its unique root.",
        };
      }
      continue;
    }
    if (parents.size != 1) {
      return {
        error:
          "Run Tree requires every reachable code cell after the root to have exactly one incoming code edge.",
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
