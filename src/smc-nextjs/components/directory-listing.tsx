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
}

export default function DirectoryListing({
  id,
  listing,
  relativePath,
}: Props): JSX.Element {
  return (
    <Table
      rowKey={"name"}
      dataSource={listing}
      columns={columns(id, relativePath)}
    />
  );
}

function columns(id, relativePath) {
  return [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      render: (name) => {
        return (
          <Link href={`/public_paths/${id}/${encodeURIComponent(join(relativePath, name))}`}>
            <a>{name}</a>
          </Link>
        );
      },
    },
  ];
}
