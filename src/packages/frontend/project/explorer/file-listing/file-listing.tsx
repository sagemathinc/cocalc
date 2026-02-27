/*
 *  This file is part of CoCalc: Copyright © 2020–2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// File listing using antd Table with virtual scrolling.

import { Alert, Menu, Spin, Table } from "antd";
import type { ColumnsType, TableProps } from "antd/es/table";
import type { ColumnFilterItem } from "antd/es/table/interface";
import type { MenuProps } from "antd";
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
  AppRedux,
  TypedMap,
  usePrevious,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon, IconName, TimeAgo, Tip } from "@cocalc/frontend/components";
import { WATCH_THROTTLE_MS } from "@cocalc/frontend/conat/listings";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
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
import { COLORS } from "@cocalc/util/theme";

import {
  useFileDrag,
  useFolderDrop,
} from "@cocalc/frontend/project/explorer/dnd/file-dnd-provider";
import DirectoryPeek from "./directory-peek";

import NoFiles from "./no-files";
import {
  TERM_MODE_CHAR,
  VIEWABLE_FILE_EXT,
  renderTypeFilterLabel,
  sortedTypeFilterOptions,
} from "./utils";

const DIMMED_STYLE = { color: COLORS.FILE_DIMMED } as const;

// ---------- DnD Row ----------

/** Context for passing DnD data from FileListing to custom table rows */
interface DndRowContextType {
  currentPath: string;
  projectId: string;
  disableActions: boolean;
  getRecord: (name: string) => FileEntry | undefined;
  getDragPaths: (name: string) => string[];
}

const DndRowContext = React.createContext<DndRowContextType | null>(null);

/**
 * Custom <tr> for the antd Table.  Each row is a drag source (except "..");
 * folder rows are also drop targets.
 */
function DndRow(props: React.HTMLAttributes<HTMLTableRowElement>) {
  const ctx = React.useContext(DndRowContext);
  const rowKey = (props as any)["data-row-key"] as string | undefined;

  if (!ctx || !rowKey || ctx.disableActions) {
    // Fallback: header row, missing context, or actions disabled (student project)
    return <tr {...props} />;
  }

  const record = ctx.getRecord(rowKey);
  if (!record || record.name === "..") {
    // ".." is droppable (parent dir) but not draggable
    if (record?.name === "..") {
      return <DndDropOnlyRow {...props} ctx={ctx} />;
    }
    return <tr {...props} />;
  }

  return <DndDraggableRow {...props} ctx={ctx} record={record} />;
}

/** Row for the ".." parent directory — drop target only */
function DndDropOnlyRow({
  ctx,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & { ctx: DndRowContextType }) {
  const parentPath = ctx.currentPath.split("/").slice(0, -1).join("/");
  const { dropRef, isOver } = useFolderDrop(
    `explorer-folder-${parentPath}`,
    parentPath,
  );
  return (
    <tr
      {...props}
      ref={dropRef}
      data-folder-drop-path={parentPath}
      className={`${props.className ?? ""}${isOver ? " cc-explorer-row-drop-target" : ""}`}
    />
  );
}

/** Regular file/folder row — draggable; folders are also droppable */
function DndDraggableRow({
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

  return (
    <tr
      {...props}
      {...dragListeners}
      {...dragAttributes}
      ref={mergedRef}
      {...(isFolder ? { "data-folder-drop-path": fullPath } : {})}
      className={`${props.className ?? ""}${extraClass}`}
    />
  );
}

const TABLE_COMPONENTS = { body: { row: DndRow } };

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

// ---------- Helper: available scroll height for the table body ----------

/**
 * Compute the pixel height available for the scrollable table body.
 * Measures the container top + the table header height and returns
 * `window.innerHeight - top - theadHeight` so the table fills the
 * remaining viewport.  Uses requestAnimationFrame + delay so the DOM
 * has settled.  Only re-measures on resize — not on content — to avoid
 * feedback loops.
 */
function useAvailableHeight(el: HTMLDivElement | null) {
  const [height, setHeight] = useState(400);

  useEffect(() => {
    if (!el) return;

    function recalc() {
      const rect = el!.getBoundingClientRect();
      const thead = el!.querySelector<HTMLElement>(".ant-table-thead");
      const theadH = thead?.offsetHeight ?? 40;
      // Leave 4px breathing room at the bottom
      const available = window.innerHeight - rect.top - theadH - 4;
      setHeight(Math.max(200, available));
    }

    const rafId = requestAnimationFrame(() => {
      recalc();
      setTimeout(recalc, 150);
    });
    window.addEventListener("resize", recalc);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", recalc);
    };
  }, [el]);

  return height;
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
    text: renderTypeFilterLabel(ext),
    value: ext,
  }));
}

// ---------- Render helpers (extracted from FileRow) ----------

function renderFileIcon(
  record: FileEntry,
  isExpanded?: boolean,
  onToggleExpand?: (e: React.MouseEvent) => void,
): React.ReactNode {
  const style: React.CSSProperties = {
    color: record.mask ? COLORS.GRAY_M : COLORS.FILE_ICON,
    verticalAlign: "sub",
    whiteSpace: "nowrap",
  };
  if (record.isdir) {
    return (
      <span style={style}>
        <Icon
          name="folder-open"
          style={{ fontSize: "14pt", verticalAlign: "sub" }}
        />
        <Icon
          name={isExpanded ? "caret-down" : "caret-right"}
          onClick={onToggleExpand}
          style={{
            marginLeft: "3px",
            fontSize: "14pt",
            verticalAlign: "sub",
            cursor: onToggleExpand ? "pointer" : undefined,
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
    <span style={style}>
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
    <a style={styles} cocalc-test="file-line">
      {displayName}
      <span style={extStyle}>{ext === "" ? "" : `.${ext}`}</span>
      {linkTarget}
    </a>
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

// ---------- Main component ----------

export const FileListing: React.FC<Props> = ({
  actions,
  redux,
  name,
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
}: Props) => {
  const intl = useIntl();
  const [starting, setStarting] = useState(false);
  const { starred, setStarredPath } = useStarredFilesManager(project_id);
  const student_project_functionality =
    useStudentProjectFunctionality(project_id);

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
    if (isRunning || listing.length === 0) return;
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
  }, [current_path, isRunning, listing.length]);

  const computeServerId = useTypedRedux({ project_id }, "compute_server_id");
  const dimFileExtensions = !!other_settings?.get?.("dim_file_extensions");
  const typeFilter = useTypedRedux({ project_id }, "type_filter") ?? null;

  // -- Scrollable table: compute available height for table body --
  // Use callback ref (useState) so hooks re-run when the DOM node appears
  // after early-return renders (empty directory, project-not-running, etc.)
  const [containerEl, containerRef] = useState<HTMLDivElement | null>(null);
  const scrollHeight = useAvailableHeight(containerEl);
  const containerWidth = useContainerWidth(containerEl);
  const isNarrow = containerWidth < NARROW_WIDTH_PX;

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

  // -- Enriched data source --
  const dataSource: FileEntry[] = useMemo(() => {
    return listing.map((item) => ({
      ...item,
      is_public: (file_map as any)?.[item.name]?.is_public ?? false,
    }));
  }, [listing, file_map]);

  // -- Selection keys (full paths in checked_files → file names for Table) --
  const selectedRowKeys = useMemo(() => {
    const keys: string[] = [];
    for (const item of listing) {
      if (checked_files.has(misc.path_to_file(current_path, item.name))) {
        keys.push(item.name);
      }
    }
    return keys;
  }, [listing, checked_files, current_path]);

  // -- DnD row context --
  const recordMap = useMemo(() => {
    const map = new Map<string, FileEntry>();
    for (const item of dataSource) {
      map.set(item.name, item);
    }
    return map;
  }, [dataSource]);

  const dndRowCtx: DndRowContextType = useMemo(
    () => ({
      currentPath: current_path,
      projectId: project_id,
      disableActions: !!student_project_functionality.disableActions,
      getRecord: (name: string) => recordMap.get(name),
      getDragPaths: (name: string) => {
        // If this file is already in checked_files, drag all checked.
        // Otherwise, add it and drag all.
        const fp = misc.path_to_file(current_path, name);
        if (checked_files.has(fp)) {
          return checked_files.toArray();
        }
        // Select this file too for the drag
        return [...checked_files.toArray(), fp];
      },
    }),
    [
      current_path,
      project_id,
      recordMap,
      checked_files,
      student_project_functionality.disableActions,
    ],
  );

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

      const multiple = checked_files.size > 1;
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
          label: `${checked_files.size} ${misc.plural(checked_files.size, "file")}`,
          disabled: true,
          style: { fontWeight: "bold", cursor: "default" },
        });
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

      const fp = misc.path_to_file(current_path, record.name);
      const triggerFileAction = (action: FileAction) => {
        if (!multiple) {
          actions.set_all_files_unchecked();
          actions.set_file_list_checked([fp]);
        }
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

      // Download/View
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

  const handleViewClick = useCallback(
    (e: React.MouseEvent, record: FileEntry) => {
      e.preventDefault();
      e.stopPropagation();
      const fp = misc.path_to_file(current_path, record.name);
      open_new_tab(url_href(actions.project_id, fp, computeServerId));
    },
    [current_path, actions, computeServerId],
  );

  // -- Sort state mapping --
  const sortColumn = active_file_sort?.get("column_name");
  const sortDescending = active_file_sort?.get("is_descending");

  function getSortOrder(columnKey: string): "ascend" | "descend" | undefined {
    if (sortColumn === columnKey) {
      return sortDescending ? "descend" : "ascend";
    }
    return undefined;
  }

  // -- Type filters --
  const typeFilters = useMemo(
    () => computeTypeFilters(type_counts, listing),
    [type_counts, listing],
  );

  // -- Columns --
  const columns: ColumnsType<FileEntry> = useMemo(() => {
    const cols: ColumnsType<FileEntry> = [
      {
        key: "type",
        width: 50,
        render: (_, record) =>
          renderFileIcon(
            record,
            record.isdir ? expandedDirs.includes(record.name) : false,
            record.isdir
              ? (e: React.MouseEvent) => toggleExpandDir(record.name, e)
              : undefined,
          ),
        filters: typeFilters,
        filterMultiple: false,
        filteredValue: typeFilter != null ? [typeFilter] : null,
      },
      {
        key: "starred",
        width: 40,
        sorter: true,
        sortOrder: getSortOrder("starred"),
        showSorterTooltip: false,
        render: (_, record) => {
          const fp = misc.path_to_file(current_path, record.name);
          const pathForStar = record.isdir ? `${fp}/` : fp;
          const isStarred = starred.includes(pathForStar);
          return (
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
          );
        },
      },
      {
        key: "public",
        width: 40,
        sorter: true,
        sortOrder: getSortOrder("public"),
        showSorterTooltip: false,
        render: (_, record) =>
          record.is_public ? (
            <Icon name="share-square" style={{ color: COLORS.TAB }} />
          ) : null,
      },
      {
        title: intl.formatMessage(labels.name),
        key: "name",
        dataIndex: "name",
        sorter: true,
        sortOrder: getSortOrder("name"),
        showSorterTooltip: false,
        ellipsis: true,
        render: (_, record) => renderFileName(record, dimFileExtensions),
      },
      {
        title: intl.formatMessage({
          id: "project.explorer.file-listing.column.date",
          defaultMessage: "Date Modified",
        }),
        key: "time",
        dataIndex: "mtime",
        width: 170,
        sorter: true,
        sortOrder: getSortOrder("time"),
        showSorterTooltip: false,
        ellipsis: true,
        render: (mtime) => renderTimestamp(mtime),
      },
      // Size and View columns hidden when container is narrow
      ...(isNarrow
        ? []
        : [
            {
              title: intl.formatMessage(labels.size),
              key: "size",
              dataIndex: "size",
              width: 130,
              sorter: true,
              sortOrder: getSortOrder("size"),
              showSorterTooltip: false,
              ellipsis: true,
              align: "right" as const,
              render: (_: any, record: FileEntry) => {
                if (record.isdir) {
                  if (record.size == null) return null;
                  return (
                    <span style={{ color: COLORS.TAB, whiteSpace: "nowrap" }}>
                      {record.size} {misc.plural(record.size, "item")}
                    </span>
                  );
                }
                const sizeStr = misc.human_readable_size(record.size);
                if (student_project_functionality.disableActions) {
                  return (
                    <span style={{ color: COLORS.TAB, whiteSpace: "nowrap" }}>
                      {sizeStr}
                    </span>
                  );
                }
                const fp = misc.path_to_file(current_path, record.name);
                const fileUrl = url_href(
                  actions.project_id,
                  fp,
                  computeServerId,
                );
                return (
                  <a
                    href={fileUrl}
                    onClick={(e) => handleDownloadClick(e, record)}
                    style={{
                      color: COLORS.TAB,
                      padding: 0,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {sizeStr}{" "}
                    <Icon name="cloud-download" style={{ color: COLORS.TAB }} />
                  </a>
                );
              },
            },
            {
              // Quick view column (eye icon for viewable files)
              key: "view",
              width: 40,
              render: (_: any, record: FileEntry) => {
                if (record.isdir) return null;
                if (student_project_functionality.disableActions) return null;
                const ext = (
                  misc.filename_extension(record.name) ?? ""
                ).toLowerCase();
                if (!VIEWABLE_FILE_EXT.includes(ext)) return null;
                return (
                  <a
                    href={url_href(
                      actions.project_id,
                      misc.path_to_file(current_path, record.name),
                      computeServerId,
                    )}
                    onClick={(e) => handleViewClick(e, record)}
                    style={{ color: COLORS.TAB, padding: 0 }}
                  >
                    <Icon name="eye" />
                  </a>
                );
              },
            },
          ]),
    ];

    return cols;
  }, [
    current_path,
    starred,
    dimFileExtensions,
    typeFilters,
    typeFilter,
    sortColumn,
    sortDescending,
    computeServerId,
    student_project_functionality.disableActions,
    isNarrow,
    intl,
    expandedDirs,
    toggleExpandDir,
  ]);

  // -- Row selection (checkboxes) --
  const rowSelection: TableProps<FileEntry>["rowSelection"] = useMemo(
    () => ({
      selectedRowKeys,
      onChange: (newSelectedKeys: React.Key[]) => {
        actions.set_all_files_unchecked();
        if (newSelectedKeys.length > 0) {
          actions.set_file_list_checked(
            newSelectedKeys.map((k) =>
              misc.path_to_file(current_path, k as string),
            ),
          );
        }
      },
      onSelect: (record: FileEntry, selected: boolean, _rows, nativeEvent) => {
        const fullPath = misc.path_to_file(current_path, record.name);
        if ((nativeEvent as MouseEvent)?.shiftKey) {
          actions.set_selected_file_range(fullPath, selected);
        }
        actions.set_most_recent_file_click(fullPath);
      },
      getCheckboxProps: (record: FileEntry) => ({
        disabled: record.name === "..",
      }),
      columnWidth: 40,
    }),
    [selectedRowKeys, current_path, actions],
  );

  // -- Table onChange (sorting + filtering) --
  const handleTableChange: TableProps<FileEntry>["onChange"] = useCallback(
    (_pagination, filters, sorter: any, extra) => {
      // Only update sort when the user actually clicked a column header
      if (extra.action === "sort") {
        const activeSorter = Array.isArray(sorter) ? sorter[0] : sorter;
        if (activeSorter?.columnKey) {
          sort_by(activeSorter.columnKey as string);
        }
      }
      // Sync type filter to Redux (shared with flyout)
      const typeValues = filters?.type as string[] | null;
      const newFilter = typeValues?.[0] ?? undefined;
      actions.setState({ type_filter: newFilter } as any);
    },
    [sort_by, actions],
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
        const fp = misc.path_to_file(current_path, record.name);
        if (checked_files.size <= 1) {
          actions.set_all_files_unchecked();
          actions.set_file_list_checked([fp]);
        }
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

  // -- Early returns for special states --
  if (!isRunning && listing.length === 0) {
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

  // -- No files --
  if (listing.length === 0 && file_search[0] !== TERM_MODE_CHAR) {
    return (
      <NoFiles
        name={name}
        current_path={current_path}
        actions={actions}
        file_search={file_search}
        create_folder={create_folder}
        create_file={create_file}
        project_id={project_id}
        configuration_main={configuration_main}
      />
    );
  }

  return (
    <>
      {!isRunning && listing.length > 0 && (
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
          ref={containerRef}
          className={`smc-vfill cc-explorer-table${shift_is_down ? " noselect" : ""}`}
          style={{ minHeight: 0, position: "relative" }}
        >
          <Table<FileEntry>
            size="small"
            columns={columns}
            dataSource={dataSource}
            rowKey="name"
            components={TABLE_COMPONENTS}
            rowSelection={
              student_project_functionality.disableActions
                ? undefined
                : rowSelection
            }
            pagination={false}
            scroll={{ y: scrollHeight }}
            showSorterTooltip={false}
            sortDirections={["ascend", "descend", "ascend"]}
            onChange={handleTableChange}
            onRow={onRow}
            rowClassName={rowClassName}
            expandable={{
              expandedRowRender: (record) => (
                <DirectoryPeek
                  project_id={project_id}
                  dirPath={misc.path_to_file(current_path, record.name)}
                  onClose={() =>
                    setExpandedDirs((prev) =>
                      prev.filter((d) => d !== record.name),
                    )
                  }
                />
              ),
              expandedRowKeys: expandedDirs,
              rowExpandable: (record) => !!record.isdir,
              showExpandColumn: false,
              expandedRowClassName: () => "cc-explorer-expanded-row",
            }}
          />
        </div>
      </DndRowContext.Provider>
      {/* Floating context menu */}
      {contextMenu && (
        <div
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
              borderRadius: 8,
              boxShadow: "0 6px 16px 0 rgba(0,0,0,0.12)",
            }}
          />
        </div>
      )}
    </>
  );
};
