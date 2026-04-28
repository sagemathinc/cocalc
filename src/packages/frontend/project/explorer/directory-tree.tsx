/*
 *  This file is part of CoCalc: Copyright © 2020–2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Input, Tree } from "antd";
import type { TreeDataNode, TreeProps } from "antd";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import * as LS from "@cocalc/frontend/misc/local-storage-typed";
import { FLYOUT_PADDING } from "@cocalc/frontend/project/page/flyouts/consts";
import { useStarredFilesManager } from "@cocalc/frontend/project/page/flyouts/store";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import * as misc from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";

import { useFileDrag, useFolderDrop } from "./dnd/file-dnd-provider";

const TREE_HOME_KEY = "__home__";
export const DIRECTORY_TREE_DEFAULT_WIDTH_PX = 280;
export const DIRECTORY_TREE_MIN_WIDTH_PX = 180;
export const DIRECTORY_TREE_MAX_WIDTH_PX = 520;

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && !isNaN(value) && value > 0;
}

// -- Consolidated localStorage state for the explorer panel ---------------
// One key per project: `${project_id}::explorer` → LSExplorer JSON.

interface LSExplorerTree {
  visible?: boolean;
  width?: number;
  expanded_keys?: string[];
  scroll_top?: number;
}

export interface LSExplorer {
  directory?: string;
  tree?: LSExplorerTree;
}

function explorerLsKey(project_id: string): string {
  return `${project_id}::explorer`;
}

function getExplorerState(project_id: string): LSExplorer {
  return LS.get<LSExplorer>(explorerLsKey(project_id)) ?? {};
}

function updateExplorerTree(
  project_id: string,
  update: Partial<LSExplorerTree>,
): void {
  const state = getExplorerState(project_id);
  LS.set(explorerLsKey(project_id), {
    ...state,
    tree: { ...state.tree, ...update },
  });
}

export function getExplorerDirectory(project_id: string): string {
  return getExplorerState(project_id).directory ?? "";
}

export function setExplorerDirectory(
  project_id: string,
  path: string,
): void {
  const state = getExplorerState(project_id);
  LS.set(explorerLsKey(project_id), { ...state, directory: path });
}

// -- Tree getters/setters (same public API, backed by the JSON blob) ------

export function getDirectoryTreeWidth(project_id: string): number {
  const width = getExplorerState(project_id).tree?.width;
  if (!isPositiveNumber(width)) return DIRECTORY_TREE_DEFAULT_WIDTH_PX;
  return Math.max(
    DIRECTORY_TREE_MIN_WIDTH_PX,
    Math.min(width, DIRECTORY_TREE_MAX_WIDTH_PX),
  );
}

export function setDirectoryTreeWidth(project_id: string, width: number): void {
  updateExplorerTree(project_id, { width });
}

const MAX_TREE_EXPANDED = 20;

function getDirectoryTreeExpandedKeys(project_id: string): string[] {
  const keys = getExplorerState(project_id).tree?.expanded_keys;
  if (!Array.isArray(keys)) return [];
  return keys.filter((k) => k !== TREE_HOME_KEY);
}

function saveDirectoryTreeExpandedKeys(
  project_id: string,
  keys: string[],
): void {
  updateExplorerTree(project_id, {
    expanded_keys: keys.slice(0, MAX_TREE_EXPANDED),
  });
}

const TREE_PANEL_STYLE: React.CSSProperties = {
  overflowY: "auto",
  overflowX: "hidden",
  padding: "0 4px 0 0",
} as const;

function pathToTreeKey(path: string): string {
  return path === "" ? TREE_HOME_KEY : path;
}

function treeKeyToPath(key: React.Key): string {
  const value = String(key);
  return value === TREE_HOME_KEY ? "" : value;
}

function getAncestorPaths(path: string): string[] {
  if (path === "") return [""];
  const parts = path.split("/");
  const ancestors: string[] = [""];
  let current = "";
  for (const part of parts) {
    current = current === "" ? part : `${current}/${part}`;
    ancestors.push(current);
  }
  return ancestors;
}

const DirectoryTreeNodeTitle = React.memo(function DirectoryTreeNodeTitle({
  project_id,
  path,
  label,
  isStarred,
  onToggleStar,
}: {
  project_id: string;
  path: string;
  label: string;
  isStarred: boolean;
  onToggleStar: (starPath: string, starred: boolean) => void;
}) {
  const id = `explorer-dir-tree-${project_id}-${path || TREE_HOME_KEY}`;
  const { dropRef, isOver, isInvalidDrop } = useFolderDrop(id, path);
  const canDrag = path !== "";
  const { dragRef, dragListeners, dragAttributes, isDragging } = useFileDrag(
    `drag-dir-tree-${project_id}-${path || TREE_HOME_KEY}`,
    canDrag ? [path] : [],
    project_id,
  );
  // Use the explorer's own browsing path (falls back to current_path if not
  // yet set).  Reading directly from Redux so the treeData memo doesn't need
  // to depend on it — only the 2 affected nodes re-render on navigation.
  const explorerBrowsingPath = useTypedRedux(
    { project_id },
    "explorer_browsing_path",
  );
  const reduxCurrentPath = useTypedRedux({ project_id }, "current_path") ?? "";
  const currentPath = explorerBrowsingPath ?? reduxCurrentPath;
  const isSelected = currentPath === path;
  const starPath = path === "" ? "" : `${path}/`;

  // Merge drag + drop refs onto the same element
  const combinedRef = React.useCallback(
    (node: HTMLSpanElement | null) => {
      dropRef(node);
      dragRef(node);
    },
    [dropRef, dragRef],
  );

  return (
    <span
      ref={combinedRef}
      {...(canDrag ? { ...dragListeners, ...dragAttributes } : {})}
      data-folder-drop-path={path}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        borderRadius: "4px",
        padding: "2px 4px",
        whiteSpace: "nowrap",
        opacity: isDragging ? 0.4 : 1,
        background: isOver
          ? COLORS.BLUE_LL
          : isInvalidDrop
            ? "var(--cocalc-error, #f5222d)"
            : isSelected
              ? COLORS.BLUE_LLL
              : "transparent",
      }}
    >
      {path === "" ? (
        <Icon name="home" style={{ color: "var(--cocalc-primary, rgb(66, 139, 202))" }} />
      ) : (
        <Icon
          name={isStarred ? "star-filled" : "star"}
          onClick={(e) => {
            e?.preventDefault();
            e?.stopPropagation();
            onToggleStar(starPath, !isStarred);
          }}
          style={{
            cursor: "pointer",
            color: isStarred ? COLORS.STAR : COLORS.GRAY_L,
            flexShrink: 0,
          }}
        />
      )}
      <span
        title={label}
        style={{
          minWidth: 0,
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    </span>
  );
});

DirectoryTreeNodeTitle.displayName = "DirectoryTreeNodeTitle";

export function DirectoryTreeDragbar({
  onWidthChange,
  currentWidth,
  onReset,
}: {
  onWidthChange: (width: number) => void;
  currentWidth: number;
  onReset: () => void;
}) {
  const [dragging, setDragging] = useState(false);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = currentWidth;
      setDragging(true);

      function onMove(ev: PointerEvent) {
        const newWidth = startWidth + (ev.clientX - startX);
        onWidthChange(
          Math.max(
            DIRECTORY_TREE_MIN_WIDTH_PX,
            Math.min(newWidth, DIRECTORY_TREE_MAX_WIDTH_PX),
          ),
        );
      }
      function onUp() {
        setDragging(false);
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      }
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [currentWidth, onWidthChange],
  );

  return (
    <div
      className="cc-project-flyout-dragbar"
      style={{
        flex: "0 0 5px",
        width: "5px",
        height: "100%",
        cursor: "col-resize",
        ...(dragging ? { zIndex: 1000, backgroundColor: COLORS.GRAY } : {}),
      }}
      onPointerDown={handlePointerDown}
      onDoubleClick={onReset}
    />
  );
}

function StarredDirItem({
  starPath,
  current_path,
  on_open_directory,
  setStarredPath,
}: {
  starPath: string;
  current_path: string;
  on_open_directory: (path: string) => void;
  setStarredPath: (path: string, starred: boolean) => void;
}) {
  const path = starPath.slice(0, -1); // strip trailing "/"
  const isSelected = current_path === path;
  const { dropRef } = useFolderDrop(`explorer-starred-${starPath}`, path);
  return (
    <div
      ref={dropRef}
      className="cc-project-flyout-file-item"
      onClick={() => on_open_directory(path)}
      style={{
        width: "100%",
        cursor: "pointer",
        color: "var(--cocalc-text-primary-strong, #434343)",
        overflow: "hidden",
        backgroundColor: isSelected ? COLORS.BLUE_LLL : undefined,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          flex: "1",
          padding: FLYOUT_PADDING,
          overflow: "hidden",
          alignItems: "center",
        }}
      >
        <Icon
          name="star-filled"
          onClick={(e) => {
            e?.preventDefault();
            e?.stopPropagation();
            setStarredPath(starPath, false);
          }}
          style={{
            fontSize: "120%",
            marginRight: FLYOUT_PADDING,
            color: "var(--cocalc-star, #FFD700)",
            cursor: "pointer",
            flexShrink: 0,
          }}
        />
        <span
          title={path || "Home"}
          style={{
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: isSelected ? COLORS.ANTD_LINK_BLUE : undefined,
          }}
        >
          {path || "Home"}
        </span>
      </div>
    </div>
  );
}

export function DirectoryTreePanel({
  project_id,
  current_path,
  compute_server_id,
  show_hidden,
  on_open_directory,
}: {
  project_id: string;
  current_path: string;
  compute_server_id?: number;
  show_hidden: boolean;
  on_open_directory: (path: string) => void;
}) {
  const [childrenByPath, setChildrenByPath] = useState<
    Record<string, string[]>
  >({});
  const [treeVersion, setTreeVersion] = useState(0);
  const [expandedKeys, setExpandedKeys] = useState<string[]>(() =>
    getDirectoryTreeExpandedKeys(project_id),
  );
  const [error, setError] = useState<string>("");
  const [filter, setFilter] = useState("");
  const treeRef = useRef<any>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [treeHeight, setTreeHeight] = useState(300);
  const { starred, setStarredPath } = useStarredFilesManager(project_id);
  const { dropRef: homeDropRef } = useFolderDrop(
    "explorer-folder-home-root",
    "",
  );
  const showHiddenRef = useRef(show_hidden);
  const loadedPathsRef = useRef<Set<string>>(new Set());
  const loadingPathsRef = useRef<Set<string>>(new Set());
  // Incremented on context reset (project/compute-server change) so that
  // in-flight async responses from a previous context are discarded.
  const generationRef = useRef(0);

  const loadPath = useCallback(
    async (path: string, force = false) => {
      if (!force && loadedPathsRef.current.has(path)) return;
      if (loadingPathsRef.current.has(path)) return;
      loadingPathsRef.current.add(path);
      const gen = generationRef.current;
      try {
        const listing = await webapp_client.project_client.directory_listing({
          project_id,
          path,
          hidden: true,
          compute_server_id: compute_server_id ?? 0,
        });
        if (gen !== generationRef.current) return; // stale response
        const dirs = (listing?.files ?? [])
          .filter(
            (entry) =>
              entry.isdir &&
              entry.name !== "." &&
              entry.name !== ".." &&
              (showHiddenRef.current || !entry.name.startsWith(".")),
          )
          .map((entry) => misc.path_to_file(path, entry.name))
          .sort((a, b) => misc.cmp(a, b));
        setChildrenByPath((prev) => ({ ...prev, [path]: dirs }));
        if (!loadedPathsRef.current.has(path)) {
          setTreeVersion((v) => v + 1);
        }
        loadedPathsRef.current.add(path);
        setError("");
      } catch (err) {
        if (gen !== generationRef.current) return; // stale error
        // ENOENT is expected for stale saved expanded keys — silently prune them
        const isNotFound = `${err}`.includes("ENOENT");
        if (isNotFound) {
          // Remove the deleted directory from expanded keys
          const key = pathToTreeKey(path);
          setExpandedKeys((prev) => {
            const next = prev.filter((k) => k !== key);
            saveDirectoryTreeExpandedKeys(project_id, next);
            return next;
          });
        } else {
          setError(`${err}`);
        }
      } finally {
        if (gen === generationRef.current) {
          loadingPathsRef.current.delete(path);
        }
      }
    },
    [compute_server_id, project_id],
  );

  useEffect(() => {
    showHiddenRef.current = show_hidden;
  }, [show_hidden]);

  useEffect(() => {
    generationRef.current += 1;
    setChildrenByPath({});
    const savedKeys = getDirectoryTreeExpandedKeys(project_id);
    setExpandedKeys(savedKeys);
    setError("");
    loadedPathsRef.current = new Set();
    loadingPathsRef.current.clear();
    setTreeVersion((v) => v + 1);
    void loadPath("", true);
    // Pre-load all previously expanded paths so the tree restores its shape
    for (const key of savedKeys) {
      const path = treeKeyToPath(key);
      if (path !== "") void loadPath(path);
    }
  }, [project_id, compute_server_id, loadPath]);

  useEffect(() => {
    if (loadedPathsRef.current.size === 0) return;
    for (const path of loadedPathsRef.current) {
      void loadPath(path, true);
    }
  }, [show_hidden, loadPath]);

  // Watch expanded directories for changes, so the tree stays live.
  // Re-register interest periodically (every 15s) to prevent expiry.
  useEffect(() => {
    const listings = redux
      .getProjectStore(project_id)
      ?.get_listings(compute_server_id ?? 0);
    if (!listings) return;
    const refreshWatch = () => {
      for (const key of expandedKeys) {
        listings.watch(treeKeyToPath(key));
      }
    };
    refreshWatch();
    const interval = setInterval(refreshWatch, 15_000);
    return () => clearInterval(interval);
  }, [project_id, compute_server_id, expandedKeys]);

  // Listen for change events and reload any affected loaded tree paths.
  // This covers moves/copies into expanded subdirectories as well as any
  // external filesystem change detected by the conat listing service.
  useEffect(() => {
    const listings = redux
      .getProjectStore(project_id)
      ?.get_listings(compute_server_id ?? 0);
    if (!listings) return;
    const handleChange = (paths: string[]) => {
      for (const path of paths) {
        if (loadedPathsRef.current.has(path)) {
          void loadPath(path, true);
        }
      }
    };
    listings.on("change", handleChange);
    return () => {
      listings.removeListener("change", handleChange);
    };
  }, [project_id, compute_server_id, loadPath]);

  useEffect(() => {
    const ancestorPaths = getAncestorPaths(current_path);
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      for (const path of ancestorPaths) {
        next.add(pathToTreeKey(path));
      }
      return Array.from(next);
    });
    for (const path of ancestorPaths) {
      if (!loadedPathsRef.current.has(path)) {
        void loadPath(path);
      }
    }
  }, [current_path, loadPath]);

  // Persist expanded keys whenever they change (capped at MAX_TREE_EXPANDED)
  useEffect(() => {
    saveDirectoryTreeExpandedKeys(project_id, expandedKeys);
  }, [project_id, expandedKeys]);

  // Measure available height for the virtual-scrolling Tree.
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setTreeHeight(Math.floor(entry.contentRect.height));
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Scroll selected node into view when current_path changes.
  // Uses the Tree's virtual-scroll `scrollTo` API instead of DOM queries.
  useEffect(() => {
    if (current_path === "") return;
    const t = setTimeout(() => {
      treeRef.current?.scrollTo({ key: pathToTreeKey(current_path) });
    }, 200);
    return () => clearTimeout(t);
  }, [current_path]);

  const onExpand: TreeProps["onExpand"] = useCallback(
    (keys) => {
      const normalizedKeys = keys.map((key) => String(key));
      setExpandedKeys(normalizedKeys);
      for (const key of normalizedKeys) {
        const path = treeKeyToPath(key);
        if (!loadedPathsRef.current.has(path)) {
          void loadPath(path);
        }
      }
    },
    [loadPath],
  );

  const onSelect: TreeProps["onSelect"] = useCallback(
    (selectedKeys, info) => {
      const key = selectedKeys[0] ?? info.node.key;
      if (key == null) return;
      on_open_directory(treeKeyToPath(key));
    },
    [on_open_directory],
  );

  // Stable callback for star toggling — avoids new closures per tree node
  const handleToggleStar = useCallback(
    (starPath: string, starredValue: boolean) => {
      setStarredPath(starPath, starredValue);
    },
    [setStarredPath],
  );

  const starredSet = useMemo(() => new Set(starred), [starred]);

  // Note: loadedPathsRef is intentionally not a dependency. `treeVersion`
  // is incremented whenever loadedPathsRef gains new paths, which triggers
  // this memo to rebuild with the latest ref contents.
  //
  // `current_path` is NOT a dependency — DirectoryTreeNodeTitle receives it
  // as a prop and derives `isSelected` internally, so navigation does not
  // rebuild the entire tree.
  const treeData: TreeDataNode[] = useMemo(() => {
    const loadedPaths = loadedPathsRef.current;
    const buildChildren = (parentPath: string): TreeDataNode[] => {
      const children = childrenByPath[parentPath] ?? [];
      return children.map((childPath) => {
        const childChildren = loadedPaths.has(childPath)
          ? buildChildren(childPath)
          : undefined;
        const starPath = `${childPath}/`;
        return {
          key: pathToTreeKey(childPath),
          title: (
            <DirectoryTreeNodeTitle
              project_id={project_id}
              path={childPath}
              label={misc.path_split(childPath).tail || childPath}
              isStarred={starredSet.has(starPath)}
              onToggleStar={handleToggleStar}
            />
          ),
          children: childChildren,
          isLeaf:
            loadedPaths.has(childPath) &&
            (childrenByPath[childPath]?.length ?? 0) === 0,
        };
      });
    };

    return buildChildren("");
  }, [childrenByPath, project_id, treeVersion, starredSet, handleToggleStar]);

  // Filter treeData when the search box is active.  Keep nodes whose
  // folder name matches and retain all ancestor nodes so the tree
  // structure stays valid.  Auto-expand every surviving parent.
  const { filteredTreeData, filteredExpandedKeys } = useMemo(() => {
    const trimmed = filter.trim();
    if (!trimmed) {
      return { filteredTreeData: treeData, filteredExpandedKeys: null };
    }
    const searchTerms = misc.search_split(trimmed);
    const autoExpanded: string[] = [];

    function filterNodes(nodes: TreeDataNode[]): TreeDataNode[] {
      return nodes.flatMap((node) => {
        const filteredChildren = node.children
          ? filterNodes(node.children)
          : [];
        const path = treeKeyToPath(node.key);
        const label = misc.path_split(path).tail || path;
        const selfMatches = misc.search_match(label, searchTerms);
        if (selfMatches || filteredChildren.length > 0) {
          if (filteredChildren.length > 0) {
            autoExpanded.push(String(node.key));
          }
          return [{ ...node, children: filteredChildren }];
        }
        return [];
      });
    }

    return {
      filteredTreeData: filterNodes(treeData),
      filteredExpandedKeys: autoExpanded,
    };
  }, [treeData, filter]);

  // Starred directories: entries ending with "/" are directories
  const starredDirs = starred.filter((p) => p.endsWith("/"));
  const hasStarredDirs = starredDirs.length > 0;
  const isHomeSelected = current_path === "";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: "1 1 0",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      {/* Home — always on top, styled like starred-dirs items */}
      <div
        ref={homeDropRef}
        className="cc-project-flyout-file-item"
        onClick={() => on_open_directory("")}
        style={{
          width: "100%",
          cursor: "pointer",
          color: "var(--cocalc-text-primary-strong, #434343)",
          overflow: "hidden",
          flexShrink: 0,
          backgroundColor: isHomeSelected ? COLORS.BLUE_LLL : undefined,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            flex: "1",
            padding: FLYOUT_PADDING,
            overflow: "hidden",
            alignItems: "center",
          }}
        >
          <Icon
            name="home"
            style={{
              fontSize: "120%",
              marginRight: FLYOUT_PADDING,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: isHomeSelected ? COLORS.ANTD_LINK_BLUE : undefined,
            }}
          >
            Home
          </span>
        </div>
      </div>

      {/* Starred directories — no header, separated by GRAY_L bars */}
      {hasStarredDirs && (
        <div
          style={{
            maxHeight: "25%",
            overflowY: "auto",
            overflowX: "hidden",
            flexShrink: 0,
            borderTop: `2px solid ${COLORS.GRAY_L}`,
            borderBottom: `2px solid ${COLORS.GRAY_L}`,
          }}
        >
          {starredDirs.map((starPath) => (
            <StarredDirItem
              key={starPath}
              starPath={starPath}
              current_path={current_path}
              on_open_directory={on_open_directory}
              setStarredPath={setStarredPath}
            />
          ))}
        </div>
      )}

      {/* Filter input */}
      <Input
        placeholder="Filter folders..."
        allowClear
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{
          flexShrink: 0,
          margin: "4px 0",
          width: "calc(100% - 12px)",
          alignSelf: "center",
          ...(filter
            ? {
                borderColor: COLORS.COCALC_ORANGE,
                boxShadow: `0 0 3px ${COLORS.COCALC_ORANGE}`,
              }
            : {}),
        }}
        size="small"
      />

      {/* Main directory tree — shows root children directly, no extra indent */}
      <div
        ref={scrollContainerRef}
        style={{
          ...TREE_PANEL_STYLE,
          flex: "1 1 0",
          minHeight: 0,
        }}
      >
        <Tree
          ref={treeRef}
          blockNode
          showLine={{ showLeafIcon: false }}
          height={treeHeight}
          treeData={filteredTreeData}
          expandedKeys={filteredExpandedKeys ?? expandedKeys}
          selectedKeys={
            current_path !== "" ? [pathToTreeKey(current_path)] : []
          }
          onExpand={onExpand}
          onSelect={onSelect}
        />
        {!!error && (
          <div
            style={{ color: "var(--cocalc-error, #f5222d)", fontSize: "11px", padding: "4px" }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
