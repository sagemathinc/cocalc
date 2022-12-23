import { CSSProperties, ReactNode, useState } from "react";
import { TableVirtuoso } from "react-virtuoso";
import { Card, Divider, Modal } from "antd";
import { ViewOnly } from "../fields/context";
import { Icon } from "@cocalc/frontend/components";
import { Data } from "./gallery";
import Json from "./json";

interface Props {
  data: any[];
  columns: any[];
  title: ReactNode;
  cardStyle?;
  height?;
  style?: CSSProperties;
}

export default function Grid({ data, columns, title, height, style }: Props) {
  return (
    <Card style={style} title={title}>
      <TableVirtuoso
        overscan={500}
        style={{ height: height ?? 600, overflow: "auto" }}
        data={data}
        fixedHeaderContent={() => <Header columns={columns} />}
        itemContent={(index) => (
          <GridRow data={data[index]} columns={columns} />
        )}
      />
    </Card>
  );
}

function GridRow({ data, columns }) {
  const v: any[] = [];
  const [open, setOpen] = useState<boolean>(false);
  for (const column of columns) {
    const text = data?.[column.dataIndex];
    const content = column.render != null ? column.render(text, data) : text;
    const width = column.width ?? 150;
    const col = (
      <td
        key={column.key}
        onClick={() => setOpen(true)}
        style={{
          cursor: "pointer",
          width,
          border: "1px solid #eee",
        }}
      >
        <div style={{ width, overflow: "auto", margin: "0 5px" }}>
          {content}
        </div>
      </td>
    );
    v.push(col);
  }
  return (
    <>
      <ViewOnly>{v}</ViewOnly>
      <Modal
        transitionName=""
        maskTransitionName=""
        style={{
          maxHeight: "90vh",
          maxWidth: "90vw",
          minWidth: "800px",
          padding: "10px 0",
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
        <div style={{ overflow: "auto" }}>
          <Data elt={data} columns={columns} />
          <Divider>Raw Data</Divider>
          <Json obj={data} />
        </div>
      </Modal>
    </>
  );
}

function Header({ columns }) {
  return (
    <tr>
      {columns.map((column) => (
        <Column {...column} />
      ))}
    </tr>
  );
}
function Column({ width, title }) {
  return (
    <th
      style={{
        width: width ?? 150,
        background: "#FAFAFA",
        padding: "10px 5px",
        border: "1px solid #eee",
      }}
    >
      {title}
    </th>
  );
}
