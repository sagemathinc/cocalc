/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
A table of a list of public paths.
*/

import Link from "next/link";
import { Table } from "antd";
import { PublicPath } from "lib/types";

const COLUMNS = [
  {
    title: "Path",
    dataIndex: "path",
    key: "path",
    render: (title, record) => (
      <Link href={`/public_paths/${record.id}`}>
        <a>{title}</a>
      </Link>
    ),
  },
  {
    title: "Description",
    dataIndex: "description",
    key: "description",
    render: (description) => (
      <div style={{ maxWidth: "50ex", maxHeight: "5em", overflow: "auto" }}>
        {description}
      </div>
    ),
  },
  {
    title: "Last Edited",
    dataIndex: "last_edited",
    key: "last_edited",
    render: (last_edited) => `${new Date(last_edited).toLocaleString()}`,
  },
];

interface Props {
  publicPaths?: PublicPath[];
}

export default function PublicPaths({ publicPaths }: Props): JSX.Element {
  return (
    <Table
      pagination={false}
      rowKey={"id"}
      loading={publicPaths == null}
      dataSource={publicPaths}
      columns={COLUMNS}
    />
  );
}
