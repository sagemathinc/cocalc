/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
A table of a list of public paths.
*/

import { Table } from "antd";
import { PublicPath } from "lib/share/types";
import A from "components/misc/A";

function Description({ description }: { description: string }) {
  return (
    <div style={{ maxWidth: "50ex", maxHeight: "5em", overflow: "auto" }}>
      {`${description}`}
    </div>
  );
}

function LastEdited({ last_edited }: { last_edited: Date }) {
  return <>{`${new Date(parseFloat(last_edited)).toLocaleString()}`}</>;
}

function Title({ id, title }: { id: string; title: string }) {
  return <A href={`/share/public_paths/${id}`}>{title}</A>;
}
const COLUMNS = [
  {
    title: "Path",
    dataIndex: "path",
    key: "path",
    render: (title, record) => <Title id={record.id} title={title} />,
    responsive: ["sm"] as any,
  },
  {
    title: "Description",
    dataIndex: "description",
    key: "description",
    render: (description) => <Description description={description} />,
    responsive: ["sm"] as any,
  },
  {
    title: "Date Modified",
    dataIndex: "last_edited",
    key: "last_edited",
    render: (last_edited) => <LastEdited last_edited={last_edited} />,
    responsive: ["sm"] as any,
  },
  {
    title: "Documents",
    responsive: ["xs"] as any,
    key: "path",
    render: (_, record) => {
      const { path, last_edited, id, description } = record;
      return (
        <div>
          <Title title={path} id={id} />
          <Description description={description} />
          <LastEdited last_edited={last_edited} />
        </div>
      );
    },
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
      style={{ overflowX: "auto" }}
    />
  );
}
