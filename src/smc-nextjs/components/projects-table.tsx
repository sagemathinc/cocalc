/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
A table of a list of public paths.
*/

import { Table } from "antd";

export interface Row {
  id: string;
  path?: string;
  description?: string;
  last_edited?: number;
}

const COLUMNS = [
  {
    title: "Path",
    dataIndex: "path",
    key: "path",
  },
  {
    title: "Description",
    dataIndex: "description",
    key: "description",
    render: (description) => (
      <div style={{ width: "50ex", maxHeight: "5em", overflow: "auto" }}>
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

export default function projectsTable({ rows }: { rows: Row[] }): JSX.Element {
  return (
    <Table
      pagination={false}
      rowKey={"id"}
      dataSource={rows}
      columns={COLUMNS}
    />
  );
}
