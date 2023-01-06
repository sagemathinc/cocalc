import { CSSProperties, ReactNode, useMemo, useState } from "react";
import { TableVirtuoso } from "react-virtuoso";
import { Divider, Modal } from "antd";
import type { ColumnsType } from "../fields";
import { ViewOnly } from "../fields/context";
import { Icon } from "@cocalc/frontend/components";
import { Data } from "./gallery";
import Json from "./json";
import { sortDirections, SortDirection } from "../syncdb/use-sort-fields";

interface Props {
  data: any[];
  columns: ColumnsType[];
  sortFields;
  setSortField;
  recordHeight?: number;
}

export default function Grid({
  data,
  columns,
  sortFields,
  setSortField,
  recordHeight,
}: Props) {
  return (
    <TableVirtuoso
      overscan={500}
      style={{ height: "100%", overflow: "auto" }}
      data={data}
      fixedHeaderContent={() => (
        <Header
          columns={columns}
          sortFields={sortFields}
          setSortField={setSortField}
        />
      )}
      itemContent={(index) => (
        <GridRow
          data={data[index]}
          columns={columns}
          recordHeight={recordHeight}
        />
      )}
    />
  );
}

function GridRow({ data, columns, recordHeight }) {
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
        <div
          style={{
            width,
            overflow: "auto",
            margin: "0 5px",
            maxHeight: recordHeight,
          }}
        >
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

function nextSortState(direction?: SortDirection | null) {
  if (direction == "descending" || direction == null) {
    return "ascending";
  } else {
    return "descending";
  }
}

function Header({ columns, sortFields, setSortField }) {
  const directions = useMemo(() => {
    if (sortFields == null) return {};
    return sortDirections(sortFields);
  }, [sortFields]);

  return (
    <tr>
      {columns.map((column) => (
        <Column
          {...column}
          direction={directions[column.dataIndex]}
          onSortClick={(_event) => {
            // change sort direction and move to top priority field for sort.
            const newDirection = nextSortState(directions[column.dataIndex]);
            setSortField(column.dataIndex, column.dataIndex, newDirection, 0);
          }}
        />
      ))}
    </tr>
  );
}

const DIRECTION_STYLE = {
  float: "right",
  marginTop: "2.5px",
  cursor: "pointer",
} as CSSProperties;

function Column({
  width,
  title,
  direction,
  onSortClick,
}: {
  width?: number | string;
  title: ReactNode;
  direction?: SortDirection;
  onSortClick?: () => void;
}) {
  return (
    <th
      style={{
        cursor: "pointer",
        width: width ?? 150,
        color: "#428bca",
        background: "rgb(250, 250, 250)",
        padding: "10px 5px",
        border: "1px solid #eee",
      }}
      onClick={onSortClick}
    >
      {title}
      {direction && (
        <Icon
          style={DIRECTION_STYLE}
          name={direction == "ascending" ? "caret-down" : "caret-up"}
        />
      )}
    </th>
  );
}
