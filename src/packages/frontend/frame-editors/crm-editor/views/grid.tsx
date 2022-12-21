import { CSSProperties, ReactNode } from "react";
import { Table } from "antd";

interface Props {
  rowKey: string;
  data: any[];
  columns: any[];
  title: ReactNode;
  cardStyle?;
  height?;
  style?: CSSProperties;
}

export default function Grid({
  rowKey,
  data,
  columns,
  title,
  height,
  style,
}: Props) {
  let x = 0;
  for (const c of columns) {
    x += c.width ?? 0;
  }
  return (
    <Table
      size="middle"
      rowKey={rowKey}
      style={{ overflow: "auto", ...style }}
      dataSource={data}
      columns={columns}
      title={() => title}
      scroll={{ x, ...(height ? { y: height } : undefined) }}
      pagination={false}
    />
  );
}
