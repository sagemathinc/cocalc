// TODO: the antd Descriptions component is perhaps better for this?
//   https://ant.design/components/descriptions

import { CSSProperties, ReactNode } from "react";
import { Card } from "antd";

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
      <OneCard
        key={elt[rowKey]}
        elt={elt}
        rowKey={rowKey}
        columns={columns}
        style={cardStyle}
      />
    );
  }
  return (
    <Card title={title} style={{ margin: "15px" }}>
      <div style={{ height, overflow: "auto", background: "#eee" }}>{v}</div>
    </Card>
  );
}

export function OneCard({
  elt,
  rowKey,
  columns,
  style,
}: {
  elt;
  rowKey: string;
  columns: object[];
  style?: CSSProperties;
}) {
  return (
    <Card
      key={elt[rowKey]}
      title={<Data noTitle elt={elt} columns={[columns[0]]} />}
      style={{
        display: "inline-block",
        margin: "10px",
        verticalAlign: "top",
        ...style,
      }}
    >
      <div>
        <Data elt={elt} columns={columns.slice(1)} />
      </div>
    </Card>
  );
}

export function Data({
  elt,
  columns,
  noTitle,
}: {
  elt: object;
  columns;
  noTitle?;
}) {
  const v: ReactNode[] = [];
  for (const column of columns) {
    const text = elt[column.dataIndex];
    const content = column.render != null ? column.render(text, elt) : text;
    v.push(
      <div key={column.key}>
        {!noTitle && <span style={{ color: "#888" }}>{column.title}: </span>}
        {content}
      </div>
    );
  }
  return <>{v}</>;
}
