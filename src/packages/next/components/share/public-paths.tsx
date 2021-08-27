/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
A table of a list of public paths.
*/

import Link from "next/link";
import { Table } from "antd";
import { PublicPath } from "lib/share/types";

const COLUMNS = [
  {
    title: "Path",
    dataIndex: "path",
    key: "path",
    // We use width 100% and display inline-block so that user can click anywhere
    // in the title *column* and open the path.  It's more user friendly.
    render: (title, record) => (
      <Link href={`/share/public_paths/${record.id}`}>
        <a style={{ width: "100%", display: "inline-block" }}>{title}</a>
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
