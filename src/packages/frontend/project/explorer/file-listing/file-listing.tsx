/*
 *  This file is part of CoCalc: Copyright © 2020–2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// File listing using react-virtuoso TableVirtuoso for efficient virtual scrolling.

import { Alert, Button, Checkbox, Dropdown, Menu, Spin } from "antd";
import type { MenuProps } from "antd";
import type { ColumnFilterItem } from "antd/es/table/interface";
import { FilterOutlined } from "@ant-design/icons";
import * as immutable from "immutable";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useInterval } from "react-interval-hook";
import { FormattedMessage, useIntl } from "react-intl";
import {
  TableVirtuoso,
  type TableVirtuosoHandle,
  type StateSnapshot,
} from "react-virtuoso";

import {
  AppRedux,
  TypedMap,
  usePrevious,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { WATCH_THROTTLE_MS } from "@cocalc/frontend/conat/listings";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import { labels } from "@cocalc/frontend/i18n";
import { should_open_in_foreground } from "@cocalc/frontend/lib/should-open-in-foreground";
import { useStarredFilesManager } from "@cocalc/frontend/project/page/flyouts/store";
import { fileItemStyle } from "@cocalc/frontend/project/page/flyouts/utils";
import { ProjectActions } from "@cocalc/frontend/project_actions";
import { MainConfiguration } from "@cocalc/frontend/project_configuration";
import track from "@cocalc/frontend/user-tracking";
import * as misc from "@cocalc/util/misc";
import { server_time } from "@cocalc/util/relative-time";
import { COLORS } from "@cocalc/util/theme";

import { useClipboardMode, useClipboardPathSet, useHasClipboard } from "@cocalc/frontend/file-clipboard/hook";
import { QuickActionButtons } from "@cocalc/frontend/file-clipboard/quick-actions";
import { useFolderDrop } from "@cocalc/frontend/project/explorer/dnd/file-dnd-provider";
import DirectoryPeek from "./directory-peek";
import EmptyPlaceholder from "./empty-placeholder";
import {
  isTerminalMode,
  TypeFilterLabel,
  sortedTypeFilterOptions,
} from "./utils";
import {
  renderFileIcon,
  renderFileName,
  renderTimestamp,
  SortIndicator,
} from "./file-listing-utils";
import { makeContextMenu } from "./file-listing-ctx";
import { DndRowContext, VIRTUOSO_COMPONENTS } from "./file-listing-row";
import { COL_W } from "./consts";
import {
  type DndRowContextType,
  type FileEntry,
  type VirtualEntry,
  isPeekEntry,
  isEmptyEntry,
} from "./types";

// ---------- Per-directory scroll position cache ----------

const SCROLL_CACHE_MAX = 100;
const scrollCache = new Map<string, StateSnapshot>();

function scrollCacheKey(projectId: string, path: string): string {
  return `${projectId}::${path}`;
}

function saveScrollState(
  key: string,
  ref: React.RefObject<TableVirtuosoHandle | null>,
) {
  ref.current?.getState((state) => {
    if (state.scrollTop > 0) {
      // Move to end (most-recently-used) by deleting and re-inserting
      scrollCache.delete(key);
      scrollCache.set(key, state);
      // Evict oldest if over limit
      if (scrollCache.size > SCROLL_CACHE_MAX) {
        const oldest = scrollCache.keys().next().value;
        if (oldest != null) scrollCache.delete(oldest);
      }
    } else {
      // User is at the top — remove any stale cached position so we
      // don't restore an outdated scroll offset on next visit.
      scrollCache.delete(key);
    }
  });
}

// ---------- Types ----------
// See ./types.ts for FileEntry, PeekEntry, EmptyEntry, VirtualEntry

interface Props {
  actions: ProjectActions;
  redux: AppRedux;
  name: string;
  active_file_sort: TypedMap<{ column_name: string; is_descending: boolean }>;
  listing: any[];
  file_map: object;
  file_search: string;
  checked_files: immutable.Set<string>;
  current_path: string;
  create_folder: (switch_over?: boolean) => void;
  create_file: (ext?: string, switch_over?: boolean) => void;
  selected_file_index?: number;
  project_id: string;
  shift_is_down: boolean;
  sort_by: (heading: string) => void;
  other_settings?: immutable.Map<any, any>;
  configuration_main?: MainConfiguration;
  isRunning?: boolean;
  type_counts?: Record<string, number>;
  search_focused?: boolean;
  hide_masked_files?: boolean;
  /** Called when navigating to a directory (double-click folder, ".." row).
   *  If provided, used instead of actions.open_directory. */
  onNavigateDirectory?: (path: string) => void;
}

// ---------- Helper: watch directory ----------

export function watchFiles({ actions, current_path }): void {
  const store = actions.get_store();
  if (store == null) return;
  try {
    store.get_listings().watch(current_path);
  } catch (err) {
    console.warn("ERROR watching directory", err);
  }
}

// ---------- Helper: responsive container width ----------

/** Width below which we hide optional columns (Size, View) */
const NARROW_WIDTH_PX = 700;

/**
 * Track the container width via ResizeObserver.  Safe to use here because
 * width changes don't cause content-height feedback loops (unlike height).
 */
function useContainerWidth(el: HTMLDivElement | null) {
  const [width, setWidth] = useState(1200);

  useEffect(() => {
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);

  return width;
}

// ---------- Helper: type filter items ----------

function computeTypeFilters(
  typeCounts: Record<string, number> | undefined,
  listing: FileEntry[],
): ColumnFilterItem[] {
  // Use pre-computed type_counts from Redux (unfiltered) when available;
  // fall back to computing from the (possibly already filtered) listing.
  let extensions: Set<string>;
  if (typeCounts && Object.keys(typeCounts).length > 0) {
    extensions = new Set(Object.keys(typeCounts));
  } else {
    extensions = new Set<string>();
    for (const item of listing) {
      if (item.isdir) {
        extensions.add("folder");
      } else {
        const ext =
          misc.filename_extension(item.name)?.toLowerCase() || "(none)";
        extensions.add(ext);
      }
    }
  }
  return sortedTypeFilterOptions(extensions).map((ext) => ({
    text: <TypeFilterLabel ext={ext} />,
    value: ext,
  }));
}

// ---------- Main component ----------

export const FileListing: React.FC<Props> = ({
  actions,
  redux,
  name: _name,
  active_file_sort,
  listing,
  file_map,
  checked_files,
  current_path,
  create_folder,
  create_file,
  selected_file_index,
  project_id,
  shift_is_down,
  sort_by,
  configuration_main,
  file_search = "",
  isRunning,
  other_settings,
  type_counts,
  search_focused,
  hide_masked_files,
  onNavigateDirectory,
}: Props) => {
  const intl = useIntl();
  const [starting, setStarting] = useState(false);
  const { starred, setStarredPath } = useStarredFilesManager(project_id);
  const starredSet = useMemo(() => new Set(starred), [starred]);
  const student_project_functionality =
    useStudentProjectFunctionality(project_id);
  const clipboardPathSet = useClipboardPathSet(project_id);
  const hasClipboard = useHasClipboard();
  const clipboardMode = useClipboardMode();
  // Listing buffering (freeze during selection / deferred updates) is now
  // handled by `useDeferredListing` in the parent Explorer component.
  // The `listing` and `file_map` props are already the committed snapshot.
  const listingForRender = listing as FileEntry[];
  const fileMapForRender = file_map;

  // -- Directory watching --
  const prev_current_path = usePrevious(current_path);

  function watch() {
    watchFiles({ actions, current_path });
  }

  useEffect(() => {
    watch();
  }, []);

  useEffect(() => {
    if (current_path != prev_current_path) watch();
  }, [current_path, prev_current_path]);

  useInterval(watch, WATCH_THROTTLE_MS);

  // -- Missing files for stale listing --
  const [missing, setMissing] = useState(0);

  useEffect(() => {
    if (isRunning || listingForRender.length === 0) return;
    let cancelled = false;
    (async () => {
      const m = await redux
        .getProjectStore(project_id)
        .get_listings()
        .getMissingUsingDatabase(current_path);
      if (!cancelled) setMissing(m ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [current_path, isRunning, listingForRender.length]);

  const computeServerId = useTypedRedux({ project_id }, "compute_server_id");
  const openFilesOrder = useTypedRedux({ project_id }, "open_files_order");
  const openFilesSet = useMemo(
    () => new Set(openFilesOrder?.toArray?.() ?? []),
    [openFilesOrder],
  );
  const dimFileExtensions = !!other_settings?.get?.("dim_file_extensions");
  const typeFilter = useTypedRedux({ project_id }, "type_filter") ?? null;

  // -- Container refs --
  // Use callback ref (useState) so hooks re-run when the DOM node appears
  // after early-return renders (empty directory, project-not-running, etc.)
  const [containerEl, containerRef] = useState<HTMLDivElement | null>(null);
  const containerWidth = useContainerWidth(containerEl);
  const isNarrow = IS_MOBILE || containerWidth < NARROW_WIDTH_PX;

  // -- Background drop target: dropping anywhere on the table background moves
  // files to the current directory. No highlight (user expectation: silent drop).
  const { dropRef: backgroundDropRef } = useFolderDrop(
    `explorer-background-${current_path}`,
    current_path,
  );
  // Merge the height-measurement ref (containerRef, a useState setter) with
  // dnd-kit's setNodeRef so both attach to the same DOM node.
  const containerAndDropRef = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef(node);
      backgroundDropRef(node);
    },
    [containerRef, backgroundDropRef],
  );

  // -- Expandable directory peek --
  const [expandedDirs, setExpandedDirs] = useState<string[]>([]);

  // Reset expanded dirs when navigating to a different directory
  useEffect(() => {
    setExpandedDirs([]);
  }, [current_path]);

  const toggleExpandDir = useCallback((name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedDirs((prev) =>
      prev.includes(name) ? prev.filter((d) => d !== name) : [...prev, name],
    );
  }, []);

  // -- Context menu state --
  const [contextMenu, setContextMenu] = useState<{
    items: MenuProps["items"];
    x: number;
    y: number;
  } | null>(null);

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [contextMenu]);

  // -- Text selection trick (prevent opening file when selecting text) --
  const selectionRef = useRef("");

  // Updated every render; read inside useCallback via ref to avoid adding as dep.
  const nowMsRef = useRef(server_time().getTime());
  nowMsRef.current = server_time().getTime();

  // -- Enriched data source --
  const dataSource: FileEntry[] = useMemo(() => {
    const entries = listingForRender.map((item) => ({
      ...item,
      is_public: (fileMapForRender as any)?.[item.name]?.is_public ?? false,
    }));
    return hide_masked_files ? entries.filter((e) => !e.mask) : entries;
  }, [listingForRender, fileMapForRender, hide_masked_files]);

  // Full paths in display order — used for shift-click range selection in clipboard
  const listingPaths = useMemo(
    () => dataSource.map((item) => misc.path_to_file(current_path, item.name)),
    [dataSource, current_path],
  );

  // -- Selection keys (full paths in checked_files → file names for Table) --
  // Use dataSource (not listing) so hidden masked files are excluded from selection.
  const selectedRowKeys = useMemo(() => {
    const keys: string[] = [];
    for (const item of dataSource) {
      if (checked_files.has(misc.path_to_file(current_path, item.name))) {
        keys.push(item.name);
      }
    }
    return keys;
  }, [dataSource, checked_files, current_path]);

  // -- DnD row context --
  const recordMap = useMemo(() => {
    const map = new Map<string, FileEntry>();
    for (const item of dataSource) {
      map.set(item.name, item);
    }
    return map;
  }, [dataSource]);

  // -- Row click handler --
  const handleRowClick = useCallback(
    (record: FileEntry, e: React.MouseEvent) => {
      // Text selection trick: don't open if user was selecting text
      const currentSel = window.getSelection()?.toString() ?? "";
      if (currentSel !== selectionRef.current) return;

      // ".." always navigates regardless of modifiers
      if (record.name === "..") {
        const dirPath = misc.path_to_file(current_path, record.name);
        if (onNavigateDirectory) {
          onNavigateDirectory(dirPath);
        } else {
          actions.open_directory(dirPath);
        }
        actions.set_file_search("");
        return;
      }

      const fp = misc.path_to_file(current_path, record.name);

      // Shift-click: range selection from last clicked to current.
      // Pass current_path and dataSource so range computation uses the
      // actually-displayed listing (not store.current_path which may differ
      // when the explorer uses a decoupled browsing path).
      if (e.shiftKey) {
        actions.set_selected_file_range(fp, true, current_path, dataSource);
        actions.set_most_recent_file_click(fp);
        return;
      }

      // Ctrl/Cmd-click: toggle selection when files are already selected
      if ((e.ctrlKey || e.metaKey) && checked_files.size > 0) {
        const isChecked = checked_files.has(fp);
        actions.set_file_checked(fp, !isChecked);
        actions.set_most_recent_file_click(fp);
        return;
      }

      // Normal click (or ctrl-click with nothing selected → opens in background)
      actions.set_most_recent_file_click(fp);
      if (record.isdir) {
        const dirPath = misc.path_to_file(current_path, record.name);
        if (onNavigateDirectory) {
          onNavigateDirectory(dirPath);
        } else {
          actions.open_directory(dirPath);
        }
        actions.set_file_search("");
      } else {
        const foreground = should_open_in_foreground(e as any);
        track("open-file", {
          project_id: actions.project_id,
          path: fp,
          how: "click-on-listing",
        });
        actions.open_file({ path: fp, foreground, explicit: true });
        if (foreground) {
          actions.set_file_search("");
        }
      }
    },
    [current_path, actions, onNavigateDirectory, checked_files, dataSource],
  );

  // -- Context menu builder --
  const buildContextMenu = useCallback(
    (record: FileEntry): MenuProps["items"] =>
      makeContextMenu({
        record,
        current_path,
        checked_files,
        recordMap,
        computeServerId,
        disableActions: !!student_project_functionality.disableActions,
        intl,
        actions,
        handleRowClick,
      }),
    [
      current_path,
      checked_files,
      recordMap,
      computeServerId,
      student_project_functionality,
      intl,
      actions,
      handleRowClick,
    ],
  );

  // -- Star toggle --
  const handleToggleStar = useCallback(
    (record: FileEntry, starred: boolean) => {
      const fp = misc.path_to_file(current_path, record.name);
      const normalizedPath = record.isdir && !fp.endsWith("/") ? `${fp}/` : fp;
      setStarredPath(normalizedPath, starred);
    },
    [current_path, setStarredPath],
  );

  // -- Download/View helpers --
  const handleDownloadClick = useCallback(
    (e: React.MouseEvent, record: FileEntry) => {
      e.preventDefault();
      e.stopPropagation();
      const fp = misc.path_to_file(current_path, record.name);
      if (record.isdir) {
        // Directories can't be downloaded directly — open the download dialog
        // which automatically enters archive mode (zip + download) for dirs.
        actions.set_all_files_unchecked();
        actions.set_file_list_checked([fp]);
        actions.set_file_action("download");
      } else {
        actions.download_file({ path: fp, log: true });
      }
    },
    [current_path, actions],
  );

  // -- Sort state mapping --
  const sortColumn = active_file_sort?.get("column_name");
  const sortDescending = active_file_sort?.get("is_descending");

  // -- Type filters (for Dropdown menu in header) --
  const typeFilters = useMemo(
    () => computeTypeFilters(type_counts, listingForRender),
    [type_counts, listingForRender],
  );

  const typeFilterMenuItems = useMemo(
    () => [
      ...(typeFilter != null
        ? [
            {
              key: "__clear__",
              icon: <Icon name="times" />,
              label: "Clear filter",
              style: { background: COLORS.ANTD_ORANGE },
            },
            { type: "divider" as const, key: "__divider__" },
          ]
        : []),
      ...typeFilters.map((f) => ({
        key: String(f.value),
        label: f.text,
      })),
    ],
    [typeFilters, typeFilter],
  );

  // -- Virtual data: insert PeekEntry rows after expanded directories,
  //    and an EmptyEntry when no real files are visible --
  const virtualData: VirtualEntry[] = useMemo(() => {
    const result: VirtualEntry[] = [];
    let hasReal = false;
    for (const entry of dataSource) {
      result.push(entry);
      if (entry.name !== "..") hasReal = true;
      if (entry.isdir && expandedDirs.includes(entry.name)) {
        result.push({
          _isPeek: true,
          _peekForName: entry.name,
          name: `__peek__${entry.name}`,
        });
      }
    }
    // When no real files exist (only ".." or nothing), append an empty marker
    // that the itemContent renderer turns into the EmptyPlaceholder UI.
    if (!hasReal && !isTerminalMode(file_search)) {
      result.push({ _isEmpty: true, name: "__empty__" });
    }
    return result;
  }, [dataSource, expandedDirs, file_search]);

  // -- Count visible columns for peek row colSpan --
  const numCols = useMemo(() => {
    let n = 3; // checkbox + star + name (always visible)
    if (!student_project_functionality.disableActions) {
      // checkbox column is present
    } else {
      n--; // no checkbox
    }
    if (!IS_MOBILE) n += 2; // type + date
    n += 1; // public
    if (!isNarrow) n += 2; // size + actions
    return n;
  }, [isNarrow, student_project_functionality.disableActions]);

  // -- Virtuoso ref for scrollToIndex --
  const virtuosoRef = useRef<TableVirtuosoHandle>(null);

  // Track latest scrollTop synchronously so directory-switch saves
  // don't race with Virtuoso's async getState() callback.
  const lastScrollTopRef = useRef<number>(0);
  const handleVirtuosoScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      lastScrollTopRef.current = (e.target as HTMLDivElement).scrollTop;
    },
    [],
  );

  // -- Save scroll position when navigating away from a directory --
  // Uses the synchronous lastScrollTopRef to avoid the race where
  // getState() fires after Virtuoso already renders the new directory.
  useEffect(() => {
    if (prev_current_path != null && prev_current_path !== current_path) {
      const key = scrollCacheKey(project_id, prev_current_path);
      const scrollTop = lastScrollTopRef.current;
      if (scrollTop > 0) {
        scrollCache.delete(key);
        scrollCache.set(key, { scrollTop, ranges: [] });
        if (scrollCache.size > SCROLL_CACHE_MAX) {
          const oldest = scrollCache.keys().next().value;
          if (oldest != null) scrollCache.delete(oldest);
        }
      } else {
        scrollCache.delete(key);
      }
      // Reset for new directory
      lastScrollTopRef.current = 0;
    }
  }, [current_path, prev_current_path, project_id]);

  // Also save on unmount (e.g. switching tabs) — getState is fine here
  // since the directory hasn't changed yet.
  useEffect(() => {
    return () => {
      saveScrollState(scrollCacheKey(project_id, current_path), virtuosoRef);
    };
  }, [project_id, current_path]);

  // -- Restore scroll position for current directory --
  const restoreSnapshot = useMemo(
    () => scrollCache.get(scrollCacheKey(project_id, current_path)) ?? null,
    [project_id, current_path],
  );

  // -- Row event handlers (memoized to avoid re-render churn) --
  const onRow = useCallback(
    (record: FileEntry) => ({
      onClick: (e: React.MouseEvent) => handleRowClick(record, e),
      onMouseDown: () => {
        selectionRef.current = window.getSelection()?.toString() ?? "";
      },
      onContextMenu: (e: React.MouseEvent) => {
        e.preventDefault();
        if (student_project_functionality.disableActions) return;
        // The ".." parent-directory row has no valid actions — skip it
        if (record.name === "..") return;
        // Don't select the file here — the menu action's
        // triggerFileAction will do it when the user picks an action.
        const items = buildContextMenu(record);
        if (items && items.length > 0) {
          setContextMenu({ items, x: e.clientX, y: e.clientY });
        }
      },
      style: {
        cursor: "pointer" as const,
        opacity: record.mask ? 0.65 : 1,
        ...fileItemStyle(
          typeof record.mtime === "number" ? record.mtime * 1000 : 0,
          !!record.mask,
          nowMsRef.current,
        ),
      },
    }),
    [
      handleRowClick,
      buildContextMenu,
      current_path,
      checked_files,
      actions,
      student_project_functionality.disableActions,
    ],
  );

  const rowClassName = useCallback(
    (record: FileEntry) => {
      const fp = misc.path_to_file(current_path, record.name);
      const isSelected =
        search_focused &&
        selected_file_index != null &&
        selected_file_index >= 0 &&
        selected_file_index < dataSource.length &&
        dataSource[selected_file_index]?.name === record.name &&
        !isTerminalMode(file_search);
      const isChecked = checked_files.has(fp);
      const isOpen = openFilesSet.has(fp);
      return [
        isSelected ? "cc-explorer-row-selected" : "",
        isChecked ? "cc-explorer-row-checked" : "",
        isOpen ? "cc-explorer-row-open" : "",
      ]
        .filter(Boolean)
        .join(" ");
    },
    [
      current_path,
      selected_file_index,
      dataSource,
      file_search,
      checked_files,
      openFilesSet,
      search_focused,
    ],
  );

  // -- DnD row context (includes virtual entry lookup, onRow, rowClassName) --
  const dndRowCtx: DndRowContextType = useMemo(
    () => ({
      currentPath: current_path,
      projectId: project_id,
      disableActions: !!student_project_functionality.disableActions,
      getRecord: (name: string) => recordMap.get(name),
      getDragPaths: (name: string) => {
        const fp = misc.path_to_file(current_path, name);
        if (checked_files.has(fp)) {
          // Dragging a checked file — drag all checked files together
          return checked_files.toArray();
        }
        if (checked_files.size > 0) {
          // Dragging an unchecked file while others are checked —
          // add it to selection and drag all together
          return [...checked_files.toArray(), fp];
        }
        // Dragging an unchecked file with nothing else checked
        return [fp];
      },
      getVirtualEntry: (index: number) => virtualData[index],
      onRow,
      rowClassName,
    }),
    [
      current_path,
      project_id,
      recordMap,
      checked_files,
      student_project_functionality.disableActions,
      virtualData,
      onRow,
      rowClassName,
    ],
  );

  // -- Scroll to selected file when keyboard-navigating --
  useEffect(() => {
    if (selected_file_index == null || selected_file_index < 0) return;
    const targetName = dataSource[selected_file_index]?.name;
    if (!targetName) return;
    const virtualIndex = virtualData.findIndex(
      (e) => !isPeekEntry(e) && (e as FileEntry).name === targetName,
    );
    if (virtualIndex >= 0) {
      virtuosoRef.current?.scrollToIndex({
        index: virtualIndex,
        align: "center",
      });
    }
  }, [selected_file_index, dataSource, virtualData]);

  // -- Checkbox handlers --
  const handleSelectAll = useCallback(
    (e: { target: { checked: boolean } }) => {
      actions.set_all_files_unchecked();
      if (e.target.checked) {
        actions.set_file_list_checked(
          dataSource
            .filter((item) => item.name !== "..")
            .map((item) => misc.path_to_file(current_path, item.name)),
        );
      }
    },
    [dataSource, current_path, actions],
  );

  const handleCheckboxChange = useCallback(
    (record: FileEntry, checked: boolean, e?: { shiftKey?: boolean }) => {
      const fullPath = misc.path_to_file(current_path, record.name);
      if (e?.shiftKey) {
        actions.set_selected_file_range(
          fullPath,
          checked,
          current_path,
          dataSource,
        );
      } else {
        actions.set_file_checked(fullPath, checked);
      }
      actions.set_most_recent_file_click(fullPath);
    },
    [current_path, actions, dataSource],
  );

  // Select-all checkbox state
  const selectableCount = dataSource.filter((d) => d.name !== "..").length;
  const allChecked =
    selectableCount > 0 && selectedRowKeys.length === selectableCount;
  const someChecked = selectedRowKeys.length > 0 && !allChecked;

  // -- Stable header renderer for TableVirtuoso --
  const fixedHeaderContent = useCallback(() => {
    const thStyle: React.CSSProperties = {
      padding: "8px 8px",
      textAlign: "left",
      position: "sticky",
      top: 0,
      background: COLORS.GRAY_LL,
      borderBottom: `1px solid ${COLORS.GRAY_L0}`,
      fontWeight: 600,
      fontSize: undefined,
      zIndex: 1,
      cursor: "pointer",
    };
    return (
      <tr>
        {!student_project_functionality.disableActions && (
          <th style={{ ...thStyle, width: COL_W.CHECKBOX, cursor: "default" }}>
            <Checkbox
              checked={allChecked}
              indeterminate={someChecked}
              onChange={handleSelectAll}
            />
          </th>
        )}
        {!IS_MOBILE && (
          <th style={{ ...thStyle, width: COL_W.TYPE }}>
            <Dropdown
              menu={{
                items: typeFilterMenuItems,
                selectable: true,
                selectedKeys: typeFilter != null ? [typeFilter] : [],
                onClick: ({ key }) => {
                  const newFilter =
                    key === "__clear__" || key === typeFilter ? undefined : key;
                  actions.setState({ type_filter: newFilter } as any);
                },
                style: { maxHeight: "50vh", overflowY: "auto" },
              }}
              trigger={["click"]}
            >
              <span>
                <FilterOutlined
                  style={{
                    color: typeFilter != null ? COLORS.ANTD_ORANGE : undefined,
                  }}
                />
              </span>
            </Dropdown>
          </th>
        )}
        <th
          style={{ ...thStyle, width: COL_W.STAR }}
          onClick={() => sort_by("starred")}
        >
          <Icon
            name="star"
            style={{ fontSize: "14pt", verticalAlign: "sub" }}
          />
          <SortIndicator
            columnKey="starred"
            sortColumn={sortColumn}
            sortDescending={sortDescending}
          />
        </th>
        <th
          style={{ ...thStyle, width: COL_W.PUBLIC }}
          onClick={() => sort_by("public")}
        >
          <SortIndicator
            columnKey="public"
            sortColumn={sortColumn}
            sortDescending={sortDescending}
          />
        </th>
        <th style={{ ...thStyle }} onClick={() => sort_by("name")}>
          {intl.formatMessage(labels.name)}
          <SortIndicator
            columnKey="name"
            sortColumn={sortColumn}
            sortDescending={sortDescending}
          />
        </th>
        {!IS_MOBILE && (
          <th
            style={{ ...thStyle, width: COL_W.DATE }}
            onClick={() => sort_by("time")}
          >
            {intl.formatMessage({
              id: "project.explorer.file-listing.column.date",
              defaultMessage: "Date Modified",
            })}
            <SortIndicator
              columnKey="time"
              sortColumn={sortColumn}
              sortDescending={sortDescending}
            />
          </th>
        )}
        {!isNarrow && (
          <>
            <th
              style={{ ...thStyle, width: COL_W.SIZE, textAlign: "right" }}
              onClick={() => sort_by("size")}
            >
              {intl.formatMessage(labels.size)}
              <SortIndicator
                columnKey="size"
                sortColumn={sortColumn}
                sortDescending={sortDescending}
              />
            </th>
            <th
              style={{ ...thStyle, width: COL_W.ACTIONS, cursor: "default" }}
            />
          </>
        )}
      </tr>
    );
  }, [
    student_project_functionality.disableActions,
    allChecked,
    someChecked,
    handleSelectAll,
    typeFilterMenuItems,
    typeFilter,
    actions,
    sort_by,
    sortColumn,
    sortDescending,
    isNarrow,
    intl,
  ]);

  // -- Stable row renderer for TableVirtuoso --
  const itemContent = useCallback(
    (_index: number, entry: VirtualEntry) => {
      // -- Peek row (expanded directory content) --
      if (isPeekEntry(entry)) {
        return (
          <td
            colSpan={numCols}
            style={{ padding: 0, background: COLORS.WHITE }}
          >
            <DirectoryPeek
              project_id={project_id}
              dirPath={misc.path_to_file(current_path, entry._peekForName)}
              onClose={() =>
                setExpandedDirs((prev) =>
                  prev.filter((d) => d !== entry._peekForName),
                )
              }
              onNavigateDirectory={onNavigateDirectory}
            />
          </td>
        );
      }

      // -- Empty placeholder row (no files match filters) --
      if (isEmptyEntry(entry)) {
        return (
          <td
            colSpan={numCols}
            style={{ padding: 0, background: COLORS.WHITE }}
          >
            <EmptyPlaceholder
              project_id={project_id}
              actions={actions}
              file_search={file_search}
              type_filter={typeFilter}
              create_file={create_file}
              create_folder={create_folder}
              configuration_main={configuration_main}
            />
          </td>
        );
      }

      // -- Regular file/folder row cells --
      const record = entry as FileEntry;
      const fp = misc.path_to_file(current_path, record.name);
      const isChecked = checked_files.has(fp);
      const pathForStar = record.isdir ? `${fp}/` : fp;
      const isStarred = starredSet.has(pathForStar);
      const isExpanded = record.isdir && expandedDirs.includes(record.name);

      const cellStyle: React.CSSProperties = {
        padding: "6px 8px",
        borderBottom: "none",
        background: COLORS.WHITE,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      };

      return (
        <>
          {!student_project_functionality.disableActions && (
            <td style={{ ...cellStyle, width: COL_W.CHECKBOX }}>
              <Checkbox
                checked={isChecked}
                disabled={record.name === ".."}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) =>
                  handleCheckboxChange(record, e.target.checked, e.nativeEvent)
                }
              />
            </td>
          )}
          {!IS_MOBILE && (
            <td
              style={{
                ...cellStyle,
                width: COL_W.TYPE,
                cursor: record.isdir ? "pointer" : undefined,
              }}
              className={isExpanded ? "cc-explorer-cell-expanded" : undefined}
              onClick={
                record.isdir
                  ? (e) => toggleExpandDir(record.name, e)
                  : undefined
              }
            >
              {renderFileIcon(record, isExpanded)}
            </td>
          )}
          <td style={{ ...cellStyle, width: COL_W.STAR }}>
            <Icon
              name={isStarred ? "star-filled" : "star"}
              onClick={(e) => {
                e?.preventDefault();
                e?.stopPropagation();
                handleToggleStar(record, !isStarred);
              }}
              style={{
                cursor: "pointer",
                fontSize: "14pt",
                color: isStarred ? COLORS.STAR : COLORS.GRAY_L,
              }}
            />
          </td>
          <td
            style={{
              ...cellStyle,
              width: COL_W.PUBLIC,
              cursor: record.is_public ? "pointer" : undefined,
            }}
            onClick={
              record.is_public
                ? (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    actions.set_all_files_unchecked();
                    actions.set_file_checked(fp, true);
                    actions.set_file_action("share");
                  }
                : undefined
            }
          >
            {record.is_public ? (
              <Icon name="share-square" style={{ color: COLORS.TAB }} />
            ) : null}
          </td>
          <td style={{ ...cellStyle, position: "relative" }}>
            {renderFileName(record, dimFileExtensions)}
            {!student_project_functionality.disableActions &&
              record.name !== ".." && (
                <QuickActionButtons
                  project_id={project_id}
                  path={fp}
                  isdir={record.isdir}
                  current_path={current_path}
                  hasClipboard={hasClipboard}
                  isInClipboard={clipboardPathSet.has(fp)}
                  clipboardMode={clipboardMode}
                  btnSize="middle"
                  listingPaths={listingPaths}
                  className="cc-explorer-hover-icon"
                  compute_server_id={computeServerId}
                  style={{ background: isChecked ? COLORS.BLUE_LLL : COLORS.BLUE_LLLL }}
                />
              )}
          </td>
          {!IS_MOBILE && (
            <td style={{ ...cellStyle, width: COL_W.DATE }}>
              {renderTimestamp(record.mtime)}
            </td>
          )}
          {!isNarrow && (
            <>
              <td
                style={{ ...cellStyle, width: COL_W.SIZE, textAlign: "right" }}
              >
                {!student_project_functionality.disableActions &&
                (record.isdir ? record.size != null : true) ? (
                  <Button
                    type="text"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownloadClick(e, record);
                    }}
                    style={{
                      color: COLORS.TAB,
                      whiteSpace: "nowrap",
                      padding: "0 4px",
                      height: "auto",
                    }}
                  >
                    <Icon
                      name="cloud-download"
                      className="cc-explorer-hover-icon"
                      style={{ color: COLORS.TAB, marginRight: 4 }}
                    />
                    {record.isdir
                      ? `${record.size} ${misc.plural(record.size, "item")}`
                      : misc.human_readable_size(record.size)}
                  </Button>
                ) : (
                  <span style={{ color: COLORS.TAB, whiteSpace: "nowrap" }}>
                    {record.isdir
                      ? record.size != null
                        ? `${record.size} ${misc.plural(record.size, "item")}`
                        : null
                      : misc.human_readable_size(record.size)}
                  </span>
                )}
              </td>
              <td
                style={{
                  ...cellStyle,
                  width: COL_W.ACTIONS,
                  textAlign: "center",
                }}
              >
                {record.name !== ".." &&
                  !student_project_functionality.disableActions && (
                    <Button
                      type="text"
                      size="small"
                      className="cc-explorer-hover-icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        const items = buildContextMenu(record);
                        if (items && items.length > 0) {
                          setContextMenu({
                            items,
                            x: e.clientX,
                            y: e.clientY,
                          });
                        }
                      }}
                      style={{ color: COLORS.TAB }}
                    >
                      <Icon name="ellipsis" rotate="90" />
                    </Button>
                  )}
              </td>
            </>
          )}
        </>
      );
    },
    [
      numCols,
      project_id,
      current_path,
      checked_files,
      starredSet,
      expandedDirs,
      student_project_functionality.disableActions,
      isNarrow,
      dimFileExtensions,
      handleCheckboxChange,
      handleToggleStar,
      handleDownloadClick,
      toggleExpandDir,
      buildContextMenu,
      actions,
      file_search,
      typeFilter,
      create_file,
      create_folder,
      configuration_main,
    ],
  );

  // -- Early returns for special states --
  if (!isRunning && listingForRender.length === 0) {
    return (
      <Alert
        style={{
          textAlign: "center",
          margin: "15px auto",
          maxWidth: "400px",
        }}
        showIcon
        type="warning"
        message={
          <div style={{ padding: "30px", fontSize: "14pt" }}>
            <a
              onClick={async () => {
                if (starting) return;
                try {
                  setStarting(true);
                  await actions.fetch_directory_listing_directly(
                    current_path,
                    true,
                  );
                } finally {
                  setStarting(false);
                }
              }}
            >
              Start this project to see your files.
              {starting && <Spin />}
            </a>
          </div>
        }
      />
    );
  }

  return (
    <>
      {!isRunning && listingForRender.length > 0 && (
        <div
          style={{
            textAlign: "center",
            marginBottom: "5px",
            fontSize: "12pt",
          }}
        >
          <FormattedMessage
            id="project.explorer.file-listing.stale-warning"
            defaultMessage={`Showing stale directory listing{is_missing, select, true {<b> missing {missing} files</b>} other {}}.
              To update the directory listing <a>start this project</a>.`}
            values={{
              is_missing: missing > 0,
              missing,
              a: (c) => (
                <a
                  onClick={() => {
                    redux.getActions("projects").start_project(project_id);
                  }}
                >
                  {c}
                </a>
              ),
            }}
          />
        </div>
      )}
      <DndRowContext.Provider value={dndRowCtx}>
        <div
          ref={containerAndDropRef}
          className={`smc-vfill cc-explorer-table${IS_MOBILE ? " cc-explorer-table-mobile" : ""}${shift_is_down ? " noselect" : ""}`}
          style={{ minHeight: 0, position: "relative" }}
        >
          <TableVirtuoso
            ref={virtuosoRef}
            style={{
              flex: 1,
              minHeight: 0,
            }}
            data={virtualData}
            computeItemKey={(_index, entry) =>
              isPeekEntry(entry)
                ? `\0peek\0${entry._peekForName}`
                : isEmptyEntry(entry)
                  ? "\0empty\0"
                  : entry.name
            }
            overscan={200}
            onScroll={handleVirtuosoScroll}
            {...(restoreSnapshot ? { restoreStateFrom: restoreSnapshot } : {})}
            components={VIRTUOSO_COMPONENTS}
            fixedHeaderContent={fixedHeaderContent}
            itemContent={itemContent}
          />
        </div>
      </DndRowContext.Provider>
      {/* Floating context menu — nudge into viewport when near edges */}
      {contextMenu && (
        <div
          ref={(el) => {
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            if (rect.right > vw) {
              el.style.left = `${Math.max(0, vw - rect.width)}px`;
            }
            if (rect.bottom > vh) {
              el.style.top = `${Math.max(0, vh - rect.height)}px`;
            }
          }}
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 1050,
          }}
        >
          <Menu
            items={contextMenu.items}
            onClick={() => setContextMenu(null)}
            className="cc-explorer-context-menu"
            style={{
              minWidth: 180,
              borderRadius: 8,
              boxShadow: "0 6px 16px 0 rgba(0,0,0,0.12)",
            }}
          />
        </div>
      )}
    </>
  );
};
