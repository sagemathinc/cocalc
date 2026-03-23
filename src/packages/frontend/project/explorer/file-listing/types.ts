/*
 *  This file is part of CoCalc: Copyright © 2020–2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import React from "react";

/** Internal row data enriched with display info */
export interface FileEntry {
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

export interface PeekEntry {
  _isPeek: true;
  _peekForName: string;
  name: string;
}

export interface EmptyEntry {
  _isEmpty: true;
  name: string;
}

export type VirtualEntry = FileEntry | PeekEntry | EmptyEntry;

export function isPeekEntry(entry: VirtualEntry): entry is PeekEntry {
  return "_isPeek" in entry;
}

export function isEmptyEntry(entry: VirtualEntry): entry is EmptyEntry {
  return "_isEmpty" in entry;
}

/** Context for passing DnD data from FileListing to custom table rows */
export interface DndRowContextType {
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
