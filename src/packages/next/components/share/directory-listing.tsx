/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import Link from "next/link";
import { Table } from "antd";
import { FileInfo } from "lib/share/get-contents";
import { join } from "path";
import {
  human_readable_size as humanReadableSize,
  plural,
} from "@cocalc/util/misc";
import { field_cmp } from "@cocalc/util/misc";

import type { JSX } from "react";

interface Props {
  id?: string;
  relativePath?: string;
  listing: FileInfo[];
  showHidden?: boolean;
}

export default function DirectoryListing({
  id,
  listing,
  relativePath,
  showHidden,
}: Props): JSX.Element {
  return (
    <Table
      rowKey={"name"}
      dataSource={filter(listing, showHidden)}
      columns={columns(id, relativePath)}
      pagination={{
        hideOnSinglePage: true,
        defaultPageSize: 50,
        showSizeChanger: true,
        pageSizeOptions: ["50", "100", "200", "500"],
      }}
    />
  );
}

function filter(listing, showHidden): FileInfo[] {
  if (showHidden) {
    return listing;
  }
  const v: FileInfo[] = [];
  for (const x of listing) {
    if (!x.name?.startsWith(".")) {
      v.push(x);
    }
  }
  return v;
}

function columns(id, relativePath) {
  return [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      // for style below, see comment in public-paths.tsx.
      render: (name, record) => {
        return (
          <Link
            style={{ width: "100%", display: "inline-block" }}
            href={
              record.url ??
              `/share/public_paths/${id}/${encodeURIComponent(
                join(relativePath, name)
              )}`
            }
          >
            {record.isdir ? <b>{name}/</b> : name}
          </Link>
        );
      },
      sorter: field_cmp("name"),
    },
    {
      title: "Size",
      dataIndex: "size",
      key: "size",
      render: (size, record) => renderSize(size, record.isdir),
      align: "right" as any,
      sorter: field_cmp("size"),
    },
    {
      title: "Last Modified",
      dataIndex: "mtime",
      key: "mtime",
      align: "right" as any,
      render: (mtime) => (mtime ? `${new Date(mtime).toLocaleString()}` : ""),
      sorter: field_cmp("mtime"),
    },
  ];
}

function renderSize(size?: number, isdir?: boolean) {
  if (size == null) return "-";
  if (isdir) return `${size} ${plural(size, "item")}`;
  return humanReadableSize(size);
}
