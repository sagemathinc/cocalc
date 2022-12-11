import { ReactNode } from "react";
import { Card, Tooltip } from "antd";

interface Props {
  rowKey: string;
  data: any[];
  columns: any[];
  title: ReactNode;
  cardStyle?;
  height?;
}

export default function Cards({
  rowKey,
  data,
  columns,
  title,
  cardStyle = { width: "300px" },
  height,
}: Props) {
  const v: ReactNode[] = [];
  for (const elt of data) {
    v.push(
      <Card
        key={elt[rowKey]}
        title={<Data elt={elt} columns={[columns[0]]} />}
        style={{
          display: "inline-block",
          margin: "10px",
          verticalAlign: "top",
          ...cardStyle,
        }}
      >
        <Data elt={elt} columns={columns.slice(1)} />
      </Card>
    );
  }
  return (
    <Card title={title} style={{ margin: "15px" }}>
      <div style={{ height, overflow: "auto", background: "#eee" }}>{v}</div>
    </Card>
  );
}

function Data({ elt, columns }: { elt: object; columns }) {
  const v: ReactNode[] = [];
  for (const column of columns) {
    const text = elt[column.dataIndex];
    v.push(
      <Tooltip placement="left" title={column.title} mouseEnterDelay={0.4}>
        <div>{column.render != null ? column.render(text, elt) : text}</div>
      </Tooltip>
    );
  }
  return <>{v}</>;
}
