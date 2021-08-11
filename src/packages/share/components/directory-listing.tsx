/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import Link from "next/link";
import { Table } from "antd";
import { FileInfo } from "lib/get-contents";
import { join } from "path";

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
      render: (name, record) => {
        return (
          <Link
            href={`/public_paths/${id}/${encodeURIComponent(
              join(relativePath, name)
            )}`}
          >
            <a>{record.isdir ? <b>{name}</b> : name}</a>
          </Link>
        );
      },
    },
    { title: "Size", dataIndex: "size", key: "size" },
    {
      title: "Last modified",
      dataIndex: "mtime",
      key: "mtime",
      render: (mtime) => `${new Date(mtime).toLocaleString()}`,
    },
  ];
}
