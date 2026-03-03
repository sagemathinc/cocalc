/*
 *  This file is part of CoCalc: Copyright © 2020–2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Tree } from "antd";
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

function directoryTreeWidthKey(project_id: string): string {
  return `${project_id}::explorer-directory-tree-width`;
}

export function getDirectoryTreeWidth(project_id: string): number {
  const width = LS.get<number>(directoryTreeWidthKey(project_id));
  if (!isPositiveNumber(width)) return DIRECTORY_TREE_DEFAULT_WIDTH_PX;
  return Math.max(
    DIRECTORY_TREE_MIN_WIDTH_PX,
    Math.min(width, DIRECTORY_TREE_MAX_WIDTH_PX),
  );
}

export function setDirectoryTreeWidth(project_id: string, width: number): void {
  LS.set(directoryTreeWidthKey(project_id), width);
}

const MAX_TREE_EXPANDED = 20;

function directoryTreeExpandedKeysKey(project_id: string): string {
  return `${project_id}::explorer-directory-tree-expanded-keys`;
}

function getDirectoryTreeExpandedKeys(project_id: string): string[] {
  const keys = LS.get<string[]>(directoryTreeExpandedKeysKey(project_id));
  if (!Array.isArray(keys)) return [];
  return keys.filter((k) => k !== TREE_HOME_KEY);
}

function saveDirectoryTreeExpandedKeys(
  project_id: string,
  keys: string[],
): void {
  LS.set(
    directoryTreeExpandedKeysKey(project_id),
    keys.slice(0, MAX_TREE_EXPANDED),
  );
}

function directoryTreeScrollTopKey(project_id: string): string {
  return `${project_id}::explorer-directory-tree-scroll-top`;
}

function getDirectoryTreeScrollTop(project_id: string): number {
  const val = LS.get<number>(directoryTreeScrollTopKey(project_id));
  return typeof val === "number" && val >= 0 ? val : 0;
}

function saveDirectoryTreeScrollTop(
  project_id: string,
  scrollTop: number,
): void {
  LS.set(directoryTreeScrollTopKey(project_id), scrollTop);
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
            ? COLORS.ANTD_RED_WARN
            : isSelected
              ? COLORS.BLUE_LLL
              : "transparent",
      }}
    >
      {path === "" ? (
        <Icon name="home" style={{ color: COLORS.FILE_ICON }} />
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
        color: COLORS.GRAY_D,
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
            color: COLORS.STAR,
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
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

  // Scroll selected node into view when current_path changes.
  // We manipulate scrollTop directly on the container rather than using
  // scrollIntoView, which can scroll wrong ancestor containers (window, etc.).
  // Two passes: 100ms (after React paint) and 400ms (after expand animations).
  useEffect(() => {
    function scrollSelected() {
      const container = scrollContainerRef.current;
      if (!container) return;
      const selected = container.querySelector(
        ".ant-tree-node-selected",
      ) as HTMLElement | null;
      if (!selected) return;
      const containerTop = container.getBoundingClientRect().top;
      const selectedTop = selected.getBoundingClientRect().top;
      const relativeTop = selectedTop - containerTop + container.scrollTop;
      // Center the selected node in the visible area
      const target =
        relativeTop - container.clientHeight / 2 + selected.offsetHeight / 2;
      container.scrollTo({ top: target, behavior: "smooth" });
    }
    const t = setTimeout(scrollSelected, 200);
    return () => clearTimeout(t);
  }, [current_path]);

  // Restore scroll position after initial data loads on mount / project change
  useEffect(() => {
    const savedScrollTop = getDirectoryTreeScrollTop(project_id);
    if (savedScrollTop <= 0) return;
    const timer = setTimeout(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = savedScrollTop;
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [project_id, compute_server_id]);

  const handleTreeScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      // Prevent horizontal drift — overflow-x:hidden clips visually but
      // scrollLeft can still be set programmatically (scrollIntoView,
      // antd Tree, dnd-kit). Force it back to 0.
      if (el.scrollLeft !== 0) {
        el.scrollLeft = 0;
      }
      saveDirectoryTreeScrollTop(project_id, el.scrollTop);
    },
    [project_id],
  );

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
          color: COLORS.GRAY_D,
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

      {/* Main directory tree — shows root children directly, no extra indent */}
      <div
        ref={scrollContainerRef}
        onScroll={handleTreeScroll}
        style={{
          ...TREE_PANEL_STYLE,
          flex: "1 1 0",
          minHeight: 0,
        }}
      >
        <Tree
          blockNode
          showLine={{ showLeafIcon: false }}
          virtual={false}
          treeData={treeData}
          expandedKeys={expandedKeys}
          selectedKeys={
            current_path !== "" ? [pathToTreeKey(current_path)] : []
          }
          onExpand={onExpand}
          onSelect={onSelect}
        />
        {!!error && (
          <div
            style={{ color: COLORS.ANTD_RED, fontSize: "11px", padding: "4px" }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
