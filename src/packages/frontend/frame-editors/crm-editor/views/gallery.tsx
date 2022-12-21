// TODO: the antd Descriptions component is perhaps better for this?
//   https://ant.design/components/descriptions

import { CSSProperties, ReactNode, useState } from "react";
import { Button, Card, Popover } from "antd";
import { VirtuosoGrid } from "react-virtuoso";
import { Icon } from "@cocalc/frontend/components";

interface Props {
  rowKey: string;
  data: any[];
  columns: any[];
  title: ReactNode;
  cardStyle?;
  height?;
}

function ItemContainer({ children }: { children?: ReactNode }) {
  return <div style={{ display: "inline-block" }}>{children}</div>;
}

export default function Cards({
  rowKey,
  data,
  columns,
  title,
  cardStyle = {
    width: "300px",
    height: "300px",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  height,
}: Props) {
  return (
    <Card title={title}>
      <VirtuosoGrid
        overscan={300}
        style={{ height: height ?? "600px", background: "#ececec" }}
        totalCount={data.length}
        components={{
          Item: ItemContainer,
        }}
        itemContent={(index) => (
          <OneCard
            key={data[index][rowKey]}
            elt={data[index]}
            rowKey={rowKey}
            columns={columns}
            style={cardStyle}
          />
        )}
      />
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
  const [open, setOpen] = useState<boolean>(false);
  const title = (
    <div>
      {" "}
      <Button
        onClick={() => setOpen(!open)}
        type="link"
        style={{
          position: "absolute",
          right: "-12px",
          top: "-5px",
          fontSize: "16pt",
        }}
      >
        <Icon name={!open ? "expand" : "times"} />
      </Button>
      <Data noTitle elt={elt} columns={[columns[0]]} />
    </div>
  );
  const data = <Data elt={elt} columns={columns.slice(1)} />;
  const card = (
    <Card
      hoverable
      key={elt[rowKey]}
      title={title}
      style={{
        display: "inline-block",
        margin: "10px",
        verticalAlign: "top",
        ...style,
      }}
    >
      {data}
    </Card>
  );
  return (
    <Popover
      open={open}
      title={title}
      content={() => {
        return (
          <div
            style={{
              maxHeight: "90vh",
              maxWidth: "90vw",
              minWidth: "400px",
              overflow: "auto",
              padding: "10px 0",
            }}
          >
            {data}
          </div>
        );
      }}
    >
      {card}
    </Popover>
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
      <div key={column.key} style={{ maxWidth: "800px" }}>
        {!noTitle && <span style={{ color: "#888" }}>{column.title}: </span>}
        {content}
      </div>
    );
  }
  return <>{v}</>;
}
