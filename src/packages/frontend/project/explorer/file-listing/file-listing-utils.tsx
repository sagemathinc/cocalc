/*
 *  This file is part of CoCalc: Copyright © 2020–2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import React from "react";

import { Icon, IconName, TimeAgo, Tip } from "@cocalc/frontend/components";
import { file_options } from "@cocalc/frontend/editor-tmp";
import * as misc from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";

import type { FileEntry } from "./types";

const DIMMED_STYLE = { color: "var(--cocalc-text-tertiary, #959595)" } as const;
const TIMESTAMP_STYLE = {
  color: "var(--cocalc-text-secondary, #333333)",
  whiteSpace: "nowrap",
} as const;

export function renderFileIcon(
  record: FileEntry,
  isExpanded?: boolean,
): React.ReactNode {
  const color = record.mask
    ? "var(--cocalc-text-tertiary, #5f5f5f)"
    : "var(--cocalc-primary, rgb(66, 139, 202))";
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

export function renderFileName(
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
    color: record.mask
      ? "var(--cocalc-text-tertiary, #5f5f5f)"
      : "var(--cocalc-text-primary, #333333)",
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

export function renderTimestamp(mtime?: number): React.ReactNode {
  if (mtime == null) return null;
  try {
    return (
      <TimeAgo
        date={new Date(mtime * 1000).toISOString()}
        style={TIMESTAMP_STYLE}
        live={false}
      />
    );
  } catch {
    return (
      <span
        style={{
          color: "var(--cocalc-text-secondary, #333333)",
          whiteSpace: "nowrap",
        }}
      >
        Invalid Date
      </span>
    );
  }
}

export function SortIndicator({
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
      style={{
        color: `var(--cocalc-primary, ${COLORS.ANTD_LINK_BLUE})`,
        marginLeft: 4,
      }}
    />
  );
}
