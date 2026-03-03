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
import { TableVirtuoso, type TableVirtuosoHandle } from "react-virtuoso";

import {
  AppRedux,
  TypedMap,
  usePrevious,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon, IconName, TimeAgo, Tip } from "@cocalc/frontend/components";
import { WATCH_THROTTLE_MS } from "@cocalc/frontend/conat/listings";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import { file_options } from "@cocalc/frontend/editor-tmp";
import { labels } from "@cocalc/frontend/i18n";
import { should_open_in_foreground } from "@cocalc/frontend/lib/should-open-in-foreground";
import { open_new_tab } from "@cocalc/frontend/misc";
import { buildFileActionItems } from "@cocalc/frontend/project/file-context-menu";
import { useStarredFilesManager } from "@cocalc/frontend/project/page/flyouts/store";
import { fileItemStyle } from "@cocalc/frontend/project/page/flyouts/utils";
import { url_href } from "@cocalc/frontend/project/utils";
import {
  type FileAction,
  ProjectActions,
} from "@cocalc/frontend/project_actions";
import { MainConfiguration } from "@cocalc/frontend/project_configuration";
import track from "@cocalc/frontend/user-tracking";
import * as misc from "@cocalc/util/misc";
import { server_time } from "@cocalc/util/relative-time";
import { COLORS } from "@cocalc/util/theme";

import {
  useFileDrag,
  useFolderDrop,
} from "@cocalc/frontend/project/explorer/dnd/file-dnd-provider";
import DirectoryPeek from "./directory-peek";

import EmptyPlaceholder from "./empty-placeholder";
import {
  TERM_MODE_CHAR,
  TypeFilterLabel,
  VIEWABLE_FILE_EXT,
  sortedTypeFilterOptions,
} from "./utils";

const DIMMED_STYLE = { color: COLORS.FILE_DIMMED } as const;

// ---------- Per-directory scroll position cache ----------

import type { StateSnapshot } from "react-virtuoso";

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

// ---------- Column widths ----------
const COL_W = {
  CHECKBOX: 40,
  TYPE: 60,
  STAR: 55,
  PUBLIC: 40,
  DATE: 170,
  SIZE: 130,
  ACTIONS: 40,
} as const;

// ---------- DnD Row ----------

/** Context for passing DnD data from FileListing to custom table rows */
interface DndRowContextType {
  currentPath: string;
  projectId: string;
  disableActions: boolean;
  getRecord: (name: string) => FileEntry | undefined;
  getDragPaths: (name: string) => string[];
  getVirtualEntry: (index: number) => VirtualEntry | undefined;
  onRow: (record: FileEntry) => {
    onClick: (e: React.MouseEvent) => void;
    onMouseDown: () => void;
    onContextMenu: (e: React.MouseEvent) => void;
    style: React.CSSProperties;
  };
  rowClassName: (record: FileEntry) => string;
}

const DndRowContext = React.createContext<DndRowContextType | null>(null);

/**
 * Stable component references for TableVirtuoso's `components` prop.
 * MUST be defined at module level (not inline in JSX) — Virtuoso uses
 * referential equality, and new references cause full unmount/remount,
 * which triggers infinite update loops with stateful children (e.g. antd Dropdown).
 */
const VirtuosoTable = ({
  style,
  ...props
}: React.HTMLAttributes<HTMLTableElement> & {
  style?: React.CSSProperties;
}) => (
  <table
    {...props}
    style={{ ...style, tableLayout: "fixed", width: "100%" }}
    className="ant-table-content"
  />
);

VirtuosoTable.displayName = "FileExplorerTable";

const VirtuosoTableHead = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>((props, ref) => <thead {...props} ref={ref} className="ant-table-thead" />);
VirtuosoTableHead.displayName = "FileExplorerHead";

/**
 * Custom <tr> for TableVirtuoso. Reads data-item-index to look up the
 * VirtualEntry; dispatches to DnD sub-components based on entry type.
 */
function VirtualTableRow(props: React.HTMLAttributes<HTMLTableRowElement>) {
  const ctx = React.useContext(DndRowContext);
  const index = (props as any)["data-item-index"] as number | undefined;

  if (!ctx || index == null) {
    return <tr {...props} />;
  }

  const entry = ctx.getVirtualEntry(index);
  if (!entry || isPeekEntry(entry) || isEmptyEntry(entry)) {
    // Peek and empty-placeholder rows are rendered as plain <tr> (no DnD)
    return <tr {...props} />;
  }

  if (ctx.disableActions) {
    const rowProps = ctx.onRow(entry);
    const cls = ctx.rowClassName(entry);
    return (
      <tr
        {...props}
        onClick={rowProps.onClick}
        onMouseDown={rowProps.onMouseDown}
        onContextMenu={rowProps.onContextMenu}
        style={{ ...props.style, ...rowProps.style }}
        className={`ant-table-row ${cls} ${props.className ?? ""}`}
      />
    );
  }

  if (entry.name === "..") {
    const rowProps = ctx.onRow(entry);
    return (
      <VirtualDropOnlyRow
        {...props}
        ctx={ctx}
        rowProps={rowProps}
        className={`ant-table-row ${props.className ?? ""}`}
      />
    );
  }

  return <VirtualDraggableRow {...props} ctx={ctx} record={entry} />;
}

/** Row for the ".." parent directory — drop target only */
function VirtualDropOnlyRow({
  ctx,
  rowProps,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & {
  ctx: DndRowContextType;
  rowProps: ReturnType<DndRowContextType["onRow"]>;
}) {
  const parentPath = ctx.currentPath.split("/").slice(0, -1).join("/");
  const { dropRef, isOver } = useFolderDrop(
    `explorer-folder-${parentPath}`,
    parentPath,
  );
  return (
    <tr
      {...props}
      ref={dropRef}
      onClick={rowProps.onClick}
      onMouseDown={rowProps.onMouseDown}
      onContextMenu={rowProps.onContextMenu}
      style={{ ...props.style, ...rowProps.style }}
      data-folder-drop-path={parentPath}
      className={`${props.className ?? ""}${isOver ? " cc-explorer-row-drop-target" : ""}`}
    />
  );
}

/** Regular file/folder row — draggable; folders are also droppable */
function VirtualDraggableRow({
  ctx,
  record,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & {
  ctx: DndRowContextType;
  record: FileEntry;
}) {
  const fullPath = misc.path_to_file(ctx.currentPath, record.name);
  const dragPaths = ctx.getDragPaths(record.name);
  const isFolder = !!record.isdir;

  const { dragRef, dragListeners, dragAttributes, isDragging } = useFileDrag(
    `explorer-row-${fullPath}`,
    dragPaths,
    ctx.projectId,
  );

  // Always call the hook (Rules of Hooks), but disable for non-folders
  const { dropRef, isOver, isInvalidDrop } = useFolderDrop(
    isFolder ? `explorer-folder-${fullPath}` : `noop-${fullPath}`,
    fullPath,
    isFolder,
  );

  // Merge drag ref + drop ref
  const mergedRef = React.useCallback(
    (node: HTMLTableRowElement | null) => {
      dragRef(node);
      if (isFolder) dropRef(node);
    },
    [dragRef, dropRef, isFolder],
  );

  const extraClass =
    isFolder && isOver
      ? " cc-explorer-row-drop-target"
      : isFolder && isInvalidDrop
        ? " cc-explorer-row-drop-invalid"
        : isDragging
          ? " cc-explorer-row-checked"
          : "";

  const rowProps = ctx.onRow(record);
  const cls = ctx.rowClassName(record);

  return (
    <tr
      {...props}
      {...dragListeners}
      {...dragAttributes}
      ref={mergedRef}
      onClick={rowProps.onClick}
      onMouseDown={rowProps.onMouseDown}
      onContextMenu={rowProps.onContextMenu}
      style={{ ...props.style, ...rowProps.style }}
      {...(isFolder ? { "data-folder-drop-path": fullPath } : {})}
      className={`ant-table-row ${cls} ${props.className ?? ""}${extraClass}`}
    />
  );
}

const VIRTUOSO_COMPONENTS = {
  Table: VirtuosoTable,
  TableHead: VirtuosoTableHead,
  TableRow: VirtualTableRow,
};

// ---------- Types ----------

/** Internal row data enriched with display info */
interface FileEntry {
  name: string;
  size?: number;
  mtime?: number;
  mask?: boolean;
  isdir?: boolean;
  display_name?: string;
  public?: any;
  issymlink?: boolean;
  link_target?: string;
  is_public?: boolean;
}

interface PeekEntry {
  _isPeek: true;
  _peekForName: string;
  name: string;
}
interface EmptyEntry {
  _isEmpty: true;
  name: string;
}
type VirtualEntry = FileEntry | PeekEntry | EmptyEntry;
function isPeekEntry(entry: VirtualEntry): entry is PeekEntry {
  return "_isPeek" in entry;
}
function isEmptyEntry(entry: VirtualEntry): entry is EmptyEntry {
  return "_isEmpty" in entry;
}

function listingMembershipKey(entry: FileEntry): string {
  return `${entry.name}:${entry.isdir ? 1 : 0}`;
}

function hasSameListingMembership(a: FileEntry[], b: FileEntry[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  const aKeys = new Set<string>();
  for (const entry of a) {
    aKeys.add(listingMembershipKey(entry));
  }
  if (aKeys.size !== a.length) {
    // Defensive: duplicate basenames should not happen in one directory.
    return false;
  }
  for (const entry of b) {
    if (!aKeys.has(listingMembershipKey(entry))) {
      return false;
    }
  }
  return true;
}

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

// ---------- Render helpers (extracted from FileRow) ----------

function renderFileIcon(
  record: FileEntry,
  isExpanded?: boolean,
): React.ReactNode {
  const color = record.mask ? COLORS.GRAY_M : COLORS.FILE_ICON;
  if (record.isdir) {
    return (
      <span style={{ color, verticalAlign: "sub", whiteSpace: "nowrap" }}>
        <Icon
          name={isExpanded ? "folder-open" : "folder"}
          style={{ fontSize: "14pt", verticalAlign: "sub" }}
        />
        <Icon
          name={isExpanded ? "caret-down" : "caret-right"}
          style={{
            marginLeft: "3px",
            fontSize: "14pt",
            verticalAlign: "sub",
          }}
        />
      </span>
    );
  }
  let iconName: IconName;
  const info = file_options(record.name);
  if (info != null) {
    iconName = info.icon;
  } else {
    iconName = "file";
  }
  return (
    <span style={{ color, verticalAlign: "sub", whiteSpace: "nowrap" }}>
      <Icon name={iconName} style={{ fontSize: "14pt" }} />
    </span>
  );
}

function renderFileName(
  record: FileEntry,
  dimExtensions: boolean,
): React.ReactNode {
  let displayName = record.display_name ?? record.name;
  let ext: string;
  if (record.isdir) {
    ext = "";
  } else {
    const parts = misc.separate_file_extension(displayName);
    displayName = parts.name;
    ext = parts.ext;
  }

  const showTip =
    (record.display_name != null && record.name !== record.display_name) ||
    displayName.length + ext.length > 40;

  const styles: React.CSSProperties = {
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    verticalAlign: "middle",
    color: record.mask ? COLORS.GRAY_M : COLORS.TAB,
  };

  const extStyle = dimExtensions ? DIMMED_STYLE : undefined;
  const linkTarget =
    record.link_target != null && record.link_target !== record.name ? (
      <>
        {" "}
        <Icon name="arrow-right" style={{ margin: "0 10px" }} />{" "}
        {record.link_target}{" "}
      </>
    ) : null;

  const nameLink = (
    <span style={styles} cocalc-test="file-line">
      {displayName}
      <span style={extStyle}>{ext === "" ? "" : `.${ext}`}</span>
      {linkTarget}
    </span>
  );

  if (showTip) {
    return (
      <Tip
        title={
          record.display_name
            ? "Displayed filename is an alias. The actual name is:"
            : "Full name"
        }
        tip={record.name}
      >
        {nameLink}
      </Tip>
    );
  }
  return nameLink;
}

function renderTimestamp(mtime?: number): React.ReactNode {
  if (mtime == null) return null;
  try {
    return (
      <TimeAgo
        date={new Date(mtime * 1000).toISOString()}
        style={{ color: COLORS.TAB, whiteSpace: "nowrap" }}
      />
    );
  } catch {
    return (
      <span style={{ color: COLORS.TAB, whiteSpace: "nowrap" }}>
        Invalid Date
      </span>
    );
  }
}

// TODO: When the screen is narrow, hide some columns (Type, Size, Public)
// similar to how the projects table removes columns below certain widths.

// ---------- Sort indicator ----------

function SortIndicator({
  columnKey,
  sortColumn,
  sortDescending,
}: {
  columnKey: string;
  sortColumn: string | undefined;
  sortDescending: boolean | undefined;
}) {
  if (sortColumn !== columnKey) return null;
  return (
    <Icon
      name={sortDescending ? "caret-down" : "caret-up"}
      style={{ color: COLORS.ANTD_LINK_BLUE, marginLeft: 4 }}
    />
  );
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
}: Props) => {
  const intl = useIntl();
  const [starting, setStarting] = useState(false);
  const { starred, setStarredPath } = useStarredFilesManager(project_id);
  const student_project_functionality =
    useStudentProjectFunctionality(project_id);
  const hasCheckedSelection = useMemo(
    () =>
      checked_files.some(
        (fp) => misc.path_split(fp as string).head === current_path,
      ),
    [checked_files, current_path],
  );
  const listingForRenderRef = useRef<FileEntry[]>(listing as FileEntry[]);
  const fileMapForRenderRef = useRef<object>(file_map);
  const listingPathRef = useRef<string>(current_path);

  // Intentional: while files are checked, freeze the sort order so
  // rows don't jump around under the user's selection.  Reordering
  // only takes effect once the selection is cleared (or directory changes).
  if (
    listingPathRef.current !== current_path ||
    !hasCheckedSelection ||
    !hasSameListingMembership(
      listingForRenderRef.current,
      listing as FileEntry[],
    )
  ) {
    listingPathRef.current = current_path;
    listingForRenderRef.current = listing as FileEntry[];
    fileMapForRenderRef.current = file_map;
  }
  const listingForRender = listingForRenderRef.current;
  const fileMapForRender = fileMapForRenderRef.current;

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

      if (record.isdir) {
        actions.open_directory(misc.path_to_file(current_path, record.name));
        actions.set_file_search("");
      } else {
        const foreground = should_open_in_foreground(e as any);
        const path = misc.path_to_file(current_path, record.name);
        track("open-file", {
          project_id: actions.project_id,
          path,
          how: "click-on-listing",
        });
        actions.open_file({ path, foreground, explicit: true });
        if (foreground) {
          actions.set_file_search("");
        }
      }
    },
    [current_path, actions],
  );

  // -- Context menu builder --
  const buildContextMenu = useCallback(
    (record: FileEntry): MenuProps["items"] => {
      if (
        record.name === ".." ||
        student_project_functionality.disableActions
      ) {
        return [];
      }

      const fp = misc.path_to_file(current_path, record.name);
      const alreadyChecked = checked_files.has(fp);
      // Effective selection count if the user triggers a file action:
      // the target file will be added to the checked set.
      const effectiveCount = alreadyChecked
        ? checked_files.size
        : checked_files.size + 1;
      const multiple = effectiveCount > 1;

      const nameStr = misc.trunc_middle(record.name, 30);
      const typeStr = intl.formatMessage(labels.file_or_folder, {
        isDir: String(!!record.isdir),
      });
      const sizeStr = record.size ? misc.human_readable_size(record.size) : "";

      const ctx: NonNullable<MenuProps["items"]> = [];

      // Header
      if (multiple) {
        ctx.push({
          key: "header",
          icon: <Icon name="files" />,
          label: `${effectiveCount} ${misc.plural(effectiveCount, "file")}`,
          disabled: true,
          style: { fontWeight: "bold", cursor: "default" },
        });
        // "Open All Files" — collect non-directory files from the
        // effective checked set and open each one.
        const filePaths: string[] = [];
        const effectiveSet = alreadyChecked
          ? checked_files
          : checked_files.add(fp);
        for (const p of effectiveSet) {
          const name = misc.path_split(p).tail;
          const entry = recordMap.get(name);
          if (entry && !entry.isdir) {
            filePaths.push(p);
          }
        }
        if (filePaths.length > 0) {
          ctx.push({
            key: "open-all",
            icon: <Icon name="edit-filled" />,
            label: `Open ${filePaths.length} ${misc.plural(filePaths.length, "file")}`,
            onClick: () => {
              for (let i = 0; i < filePaths.length; i++) {
                actions.open_file({
                  path: filePaths[i],
                  foreground: i === 0,
                });
              }
            },
          });
        }
      } else {
        ctx.push({
          key: "header",
          icon: <Icon name={record.isdir ? "folder-open" : "file"} />,
          label: `${typeStr} ${nameStr}${sizeStr ? ` (${sizeStr})` : ""}`,
          title: record.name,
          disabled: true,
          style: { fontWeight: "bold", cursor: "default" },
        });
        ctx.push({
          key: "open",
          icon: <Icon name="edit-filled" />,
          label: intl.formatMessage(labels.open_file_or_folder, {
            isDir: String(!!record.isdir),
          }),
          onClick: () => handleRowClick(record, {} as any),
        });
      }

      ctx.push({ key: "divider-header", type: "divider" });

      // File actions add the target file to the checked selection,
      // then trigger the action dialog on the full set.
      const triggerFileAction = (action: FileAction) => {
        actions.set_file_checked(fp, true);
        actions.set_file_action(action);
      };

      ctx.push(
        ...buildFileActionItems({
          isdir: !!record.isdir,
          intl,
          multiple,
          disableActions: student_project_functionality.disableActions,
          inSnapshots: current_path?.startsWith(".snapshots") ?? false,
          triggerFileAction,
          fullPath: fp,
        }),
      );

      // Publish/share
      if (!multiple && !student_project_functionality.disableActions) {
        ctx.push({
          key: "share",
          label: intl.formatMessage(labels.publish_status, {
            isPublished: String(!!record.is_public),
            isDir: String(!!record.isdir),
          }),
          icon: <Icon name="share-square" />,
          disabled: current_path?.startsWith(".snapshots") ?? false,
          onClick: () => triggerFileAction("share"),
        });
      }

      // Download/View — immediate actions, no selection changes
      const showDownload = !student_project_functionality.disableActions;
      if (!record.isdir && showDownload && !multiple) {
        const ext = (misc.filename_extension(record.name) ?? "").toLowerCase();
        const showView = VIEWABLE_FILE_EXT.includes(ext);
        const fileUrl = url_href(actions.project_id, fp, computeServerId);

        ctx.push({ key: "divider-download", type: "divider" });

        if (showView) {
          ctx.push({
            key: "view",
            icon: <Icon name="eye" />,
            label: intl.formatMessage(labels.view_file),
            onClick: () => open_new_tab(fileUrl),
          });
        }

        ctx.push({
          key: "download",
          label: intl.formatMessage(labels.download),
          icon: <Icon name="cloud-download" />,
          onClick: () => actions.download_file({ path: fp, log: true }),
        });
      }

      return ctx;
    },
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
      actions.download_file({
        path: misc.path_to_file(current_path, record.name),
        log: true,
      });
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
    if (!hasReal && file_search[0] !== TERM_MODE_CHAR) {
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
        file_search[0] !== TERM_MODE_CHAR;
      const isChecked = checked_files.has(fp);
      return [
        isSelected ? "cc-explorer-row-selected" : "",
        isChecked ? "cc-explorer-row-checked" : "",
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
    (record: FileEntry, checked: boolean, e?: React.MouseEvent) => {
      const fullPath = misc.path_to_file(current_path, record.name);
      if (e?.shiftKey) {
        actions.set_selected_file_range(fullPath, checked);
      } else {
        actions.set_file_checked(fullPath, checked);
      }
      actions.set_most_recent_file_click(fullPath);
    },
    [current_path, actions],
  );

  // Select-all checkbox state
  const selectableCount = dataSource.filter((d) => d.name !== "..").length;
  const allChecked =
    selectableCount > 0 && selectedRowKeys.length === selectableCount;
  const someChecked = selectedRowKeys.length > 0 && !allChecked;

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
            computeItemKey={(_index, entry) => entry.name}
            overscan={200}
            onScroll={handleVirtuosoScroll}
            {...(restoreSnapshot ? { restoreStateFrom: restoreSnapshot } : {})}
            components={VIRTUOSO_COMPONENTS}
            fixedHeaderContent={() => {
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
                    <th
                      style={{
                        ...thStyle,
                        width: COL_W.CHECKBOX,
                        cursor: "default",
                      }}
                    >
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
                              key === "__clear__" || key === typeFilter
                                ? undefined
                                : key;
                            actions.setState({
                              type_filter: newFilter,
                            } as any);
                          },
                          style: { maxHeight: "50vh", overflowY: "auto" },
                        }}
                        trigger={["click"]}
                      >
                        <span>
                          <FilterOutlined
                            style={{
                              color:
                                typeFilter != null
                                  ? COLORS.ANTD_ORANGE
                                  : undefined,
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
                        style={{
                          ...thStyle,
                          width: COL_W.SIZE,
                          textAlign: "right",
                        }}
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
                        style={{
                          ...thStyle,
                          width: COL_W.ACTIONS,
                          cursor: "default",
                        }}
                      />
                    </>
                  )}
                </tr>
              );
            }}
            itemContent={(_index, entry) => {
              // -- Peek row (expanded directory content) --
              if (isPeekEntry(entry)) {
                return (
                  <td
                    colSpan={numCols}
                    style={{ padding: 0, background: "white" }}
                  >
                    <DirectoryPeek
                      project_id={project_id}
                      dirPath={misc.path_to_file(
                        current_path,
                        entry._peekForName,
                      )}
                      onClose={() =>
                        setExpandedDirs((prev) =>
                          prev.filter((d) => d !== entry._peekForName),
                        )
                      }
                    />
                  </td>
                );
              }

              // -- Empty placeholder row (no files match filters) --
              if (isEmptyEntry(entry)) {
                return (
                  <td
                    colSpan={numCols}
                    style={{ padding: 0, background: "white" }}
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
              const isStarred = starred.includes(pathForStar);
              const isExpanded =
                record.isdir && expandedDirs.includes(record.name);

              const cellStyle: React.CSSProperties = {
                padding: "6px 8px",
                borderBottom: "none",
                background: "white",
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
                          handleCheckboxChange(
                            record,
                            e.target.checked,
                            e.nativeEvent as any,
                          )
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
                      className={
                        isExpanded ? "cc-explorer-cell-expanded" : undefined
                      }
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
                  <td style={{ ...cellStyle, width: COL_W.PUBLIC }}>
                    {record.is_public ? (
                      <Icon name="share-square" style={{ color: COLORS.TAB }} />
                    ) : null}
                  </td>
                  <td style={{ ...cellStyle }}>
                    {renderFileName(record, dimFileExtensions)}
                  </td>
                  {!IS_MOBILE && (
                    <td style={{ ...cellStyle, width: COL_W.DATE }}>
                      {renderTimestamp(record.mtime)}
                    </td>
                  )}
                  {!isNarrow && (
                    <>
                      <td
                        style={{
                          ...cellStyle,
                          width: COL_W.SIZE,
                          textAlign: "right",
                        }}
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
                              style={{
                                color: COLORS.TAB,
                                marginRight: 4,
                              }}
                            />
                            {record.isdir
                              ? `${record.size} ${misc.plural(record.size, "item")}`
                              : misc.human_readable_size(record.size)}
                          </Button>
                        ) : (
                          <span
                            style={{
                              color: COLORS.TAB,
                              whiteSpace: "nowrap",
                            }}
                          >
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
                                // Don't select the file here — the menu
                                // action's triggerFileAction will do it
                                // when the user actually picks an action.
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
            }}
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
