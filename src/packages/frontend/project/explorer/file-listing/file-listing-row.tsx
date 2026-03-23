/*
 *  This file is part of CoCalc: Copyright © 2020–2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import React from "react";

import { useFileDrag } from "@cocalc/frontend/project/explorer/dnd/file-dnd-provider";
import * as misc from "@cocalc/util/misc";

import {
  type DndRowContextType,
  type FileEntry,
  isPeekEntry,
  isEmptyEntry,
} from "./types";

export const DndRowContext = React.createContext<DndRowContextType | null>(null);

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

/** Row for the ".." parent directory — drop target via DOM hit-testing */
function VirtualDropOnlyRow({
  ctx,
  rowProps,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement> & {
  ctx: DndRowContextType;
  rowProps: ReturnType<DndRowContextType["onRow"]>;
}) {
  const parentPath = ctx.currentPath.split("/").slice(0, -1).join("/");
  return (
    <tr
      {...props}
      onClick={rowProps.onClick}
      onMouseDown={rowProps.onMouseDown}
      onContextMenu={rowProps.onContextMenu}
      style={{ ...props.style, ...rowProps.style }}
      data-folder-drop-path={parentPath}
      className={props.className ?? ""}
    />
  );
}

/** Regular file/folder row — draggable; folder drop highlighting is handled
 *  by the DndProvider via DOM hit-testing on data-folder-drop-path. */
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

  const rowProps = ctx.onRow(record);
  const cls = ctx.rowClassName(record);
  const onDragMouseDown = (dragListeners as any)?.onMouseDown as
    | ((event: React.MouseEvent<HTMLTableRowElement>) => void)
    | undefined;
  const onVirtuosoMouseDown = props.onMouseDown;

  return (
    <tr
      {...props}
      {...dragListeners}
      {...dragAttributes}
      ref={dragRef}
      onClick={rowProps.onClick}
      onMouseDown={(e) => {
        // Suppress drag initiation when modifier keys are held (user is
        // shift/ctrl-selecting files, not starting a drag operation).
        if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
          onDragMouseDown?.(e);
        }
        onVirtuosoMouseDown?.(e);
        rowProps.onMouseDown();
      }}
      onContextMenu={rowProps.onContextMenu}
      style={{ ...props.style, ...rowProps.style }}
      {...(isFolder ? { "data-folder-drop-path": fullPath } : {})}
      className={`ant-table-row ${cls} ${props.className ?? ""}${isDragging ? " cc-explorer-row-checked" : ""}`}
    />
  );
}

export const VIRTUOSO_COMPONENTS = {
  Table: VirtuosoTable,
  TableHead: VirtuosoTableHead,
  TableRow: VirtualTableRow,
};
