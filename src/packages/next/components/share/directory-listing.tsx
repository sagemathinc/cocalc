/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import Link from "next/link";
import { Table } from "antd";
import { FileInfo } from "lib/share/get-contents";
import { join } from "path";
import {
  human_readable_size as humanReadableSize,
  plural,
} from "@cocalc/util/misc";

interface Props {
  id: string;
  relativePath: string;
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
            href={`/share/public_paths/${id}/${encodeURIComponent(
              join(relativePath, name)
            )}`}
          >
            <a style={{ width: "100%", display: "inline-block" }}>
              {record.isdir ? <b>{name}</b> : name}
            </a>
          </Link>
        );
      },
    },
    {
      title: "Last modified",
      dataIndex: "mtime",
      key: "mtime",
      render: (mtime) => `${new Date(mtime).toLocaleString()}`,
    },
    {
      title: "Size",
      dataIndex: "size",
      key: "size",
      render: (size, record) => renderSize(size, record.isdir),
      align: "right" as any,
    },
  ];
}

function renderSize(size?: number, isdir?: boolean) {
  if (size == null) return "-";
  if (isdir) return `${size} ${plural(size, "item")}`;
  return humanReadableSize(size);
}
