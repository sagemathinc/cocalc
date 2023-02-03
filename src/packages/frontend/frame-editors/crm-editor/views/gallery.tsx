// TODO: the antd Descriptions component is perhaps better for this?
//   https://ant.design/components/descriptions

import { CSSProperties, ReactNode, useMemo, useState } from "react";
import { Card, Divider, Modal } from "antd";
import { VirtuosoGrid } from "react-virtuoso";
import type { GridItemProps } from "react-virtuoso";
import { ViewOnly } from "../fields/context";
import { Icon } from "@cocalc/frontend/components";
import Json from "./json";
import type { ColumnsType } from "../fields";

interface Props {
  rowKey: string;
  data: object[];
  columns: ColumnsType[];
  recordHeight?: number;
}

const ItemContainer: React.FC<GridItemProps & { children?: ReactNode }> = ({
  children,
}) => <div style={{ display: "inline-block" }}>{children}</div>;

const cardStyle = {
  width: "300px",
  height: "300px",
  overflow: "hidden",
  textOverflow: "ellipsis",
} as CSSProperties;

export default function Gallery({
  rowKey,
  data,
  columns,
  recordHeight,
}: Props) {
  const itemStyle = useMemo(() => {
    return { ...cardStyle, height: recordHeight };
  }, [cardStyle, recordHeight]);
  return (
    <VirtuosoGrid
      overscan={500}
      style={{ height: "100%", background: "#ececec" }}
      totalCount={data.length}
      components={{
        Item: ItemContainer,
      }}
      itemContent={(index) => (
        <OneCard
          index={index}
          key={data[index][rowKey]}
          elt={data[index]}
          rowKey={rowKey}
          columns={columns}
          style={itemStyle}
        />
      )}
    />
  );
}

export function OneCard({
  index,
  elt,
  rowKey,
  columns,
  style,
  Title,
}: {
  index?;
  elt;
  rowKey: string;
  columns: object[];
  style?: CSSProperties;
  Title?;
}) {
  const [open, setOpen] = useState<boolean>(false);
  const title = (
    <Data
      noTitle
      elt={elt}
      columns={[columns[0]]}
      style={{ overflow: "hidden", textOverflow: "ellipsis", fontSize: "10pt" }}
    />
  );
  const data = <Data elt={elt} columns={columns.slice(1)} />;
  const head = Title != null ? <Title>{title}</Title> : title;
  const card = (
    <Card
      onClick={() => setOpen(true)}
      hoverable
      key={elt[rowKey]}
      title={
        index != null ? (
          <div>
            <div
              style={{
                paddingLeft: "5px",
                float: "right",
                color: "#666",
                fontWeight: 200,
                fontSize: "10pt",
              }}
            >
              {index + 1}
            </div>
            {head}
          </div>
        ) : (
          head
        )
      }
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
    <div>
      <Modal
        transitionName=""
        maskTransitionName=""
        style={{ minWidth: "800px" }}
        bodyStyle={{
          maxHeight: "80vh",
          maxWidth: "90vw",
          overflow: "auto",
          padding: "10px",
        }}
        open={open}
        title={
          <>
            <Icon name="pencil" style={{ marginRight: "15px" }} /> Edit
          </>
        }
        onOk={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      >
        <Data elt={elt} columns={columns} />
        <Divider>Raw Data</Divider>
        <Json obj={elt} />
      </Modal>
      <ViewOnly>{card}</ViewOnly>
    </div>
  );
}

export function Data({
  elt,
  columns,
  noTitle,
  style,
}: {
  elt: object;
  columns;
  noTitle?;
  style?;
}) {
  const v: ReactNode[] = [];
  for (const column of columns) {
    if (column == null) continue;
    const text = elt[column.dataIndex];
    const content = column.render != null ? column.render(text, elt) : text;
    v.push(
      <div
        key={column.key}
        style={{
          margin: "5px 0",
          ...style,
        }}
      >
        {!noTitle && <span style={{ color: "#888" }}>{column.title}: </span>}
        {content}
      </div>
    );
  }
  return <>{v}</>;
}
