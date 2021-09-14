import { ReactNode } from "react";
import { Table } from "antd";
import Code from "components/landing/code";

interface Item {
  name: string;
  path: string;
  output: string;
}

export type DataSource = Item[];

const COLUMNS = [
  { title: "Name", key: "name", dataIndex: "name" },
  {
    title: "Path",
    key: "path",
    dataIndex: "path",
    render: (path) => <Code>{path}</Code>,
  },
  {
    title: "--version output",
    key: "output",
    dataIndex: "output",
    render: (output) => (
      <div
        style={{
          maxHeight: "8em",
          overflowY: "scroll",
          backgroundColor: "rgba(150, 150, 150, 0.1)",
          fontSize: "10px",
          border: "1px solid rgba(100, 100, 100, 0.2)",
          borderRadius: "3px",
        }}
      >
        <pre style={{ padding: "5px" }}>{output}</pre>
      </div>
    ),
  },
];

interface Props {
  dataSource: Item[];
}

export default function ExecutablesTable({ dataSource }: Props) {
  return (
    <Table
      columns={COLUMNS}
      bordered
      pagination={false}
      rowKey={"feature"}
      dataSource={dataSource}
    />
  );
}
