import { CSSProperties, ReactNode, useMemo, useRef, useState } from "react";
import { TableVirtuoso } from "react-virtuoso";
import { Divider, Modal } from "antd";
import type { ColumnsType } from "../fields";
import { ViewOnly } from "../fields/context";
import { Icon } from "@cocalc/frontend/components";
import { Data } from "./gallery";
import Json from "./json";
import { sortDirections, SortDirection } from "../syncdb/use-sort-fields";
import useFieldWidths from "../syncdb/use-field-widths";
import Draggable from "react-draggable";

const DEFAULT_WIDTH = 150;

interface Props {
  data: any[];
  columns: ColumnsType[];
  sortFields;
  setSortField;
  recordHeight?: number;
  id: string;
}

export default function Grid({
  data,
  columns,
  sortFields,
  setSortField,
  recordHeight,
  id,
}: Props) {
  const [fieldWidths, setFieldWidths] = useFieldWidths({ id });

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
          fieldWidths={fieldWidths}
          setFieldWidths={setFieldWidths}
        />
      )}
      itemContent={(index) => (
        <GridRow
          index={index}
          data={data[index]}
          columns={columns}
          fieldWidths={fieldWidths}
          recordHeight={recordHeight}
        />
      )}
    />
  );
}

function GridRow({ index, data, columns, recordHeight, fieldWidths }) {
  const v: ReactNode[] = [
    <td
      style={{
        cursor: "pointer",
        border: "1px solid #eee",
        padding: "0 5px",
        color: "#666",
        textAlign: "center",
      }}
    >
      {index + 1}
    </td>,
  ];
  const [open, setOpen] = useState<boolean>(false);
  for (const column of columns) {
    const text = data?.[column.dataIndex];
    const content = column.render != null ? column.render(text, data) : text;
    const width =
      fieldWidths[column.dataIndex] ?? column.width ?? DEFAULT_WIDTH;
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
  if (direction == "descending") {
    return "ascending";
  } else if (direction == "ascending") {
    return null;
  } else {
    return "descending";
  }
}

function Header({
  columns,
  sortFields,
  setSortField,
  fieldWidths,
  setFieldWidths,
}) {
  const directions = useMemo(() => {
    if (sortFields == null) return {};
    return sortDirections(sortFields);
  }, [sortFields]);

  return (
    <tr style={{ position: "relative" }}>
      <ColumnHeading width={30} />
      {columns.map((column) => (
        <ColumnHeading
          {...column}
          width={fieldWidths[column.dataIndex] ?? column.width ?? DEFAULT_WIDTH}
          setWidth={(newWidth) => {
            if (newWidth < 20) return;
            setFieldWidths({ ...fieldWidths, [column.dataIndex]: newWidth });
          }}
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

function ColumnHeading({
  width,
  title,
  direction,
  onSortClick,
  setWidth,
}: {
  width: number;
  title?: ReactNode;
  direction?: SortDirection;
  onSortClick?: () => void;
  setWidth?: (number) => void;
}) {
  const ignoreClickRef = useRef<boolean>(false);
  return (
    <th
      style={{
        cursor: "pointer",
        width: width ?? 150,
        color: "#428bca",
        background: "rgb(250, 250, 250)",
        padding: "10px 5px",
        border: "1px solid #eee",
        position: "relative",
      }}
      onClick={
        onSortClick
          ? () => {
              if (ignoreClickRef.current) {
                ignoreClickRef.current = false;
                return;
              }
              onSortClick();
            }
          : undefined
      }
    >
      {title}
      {direction && (
        <Icon
          style={DIRECTION_STYLE}
          name={direction == "ascending" ? "caret-down" : "caret-up"}
        />
      )}
      {setWidth && (
        <ResizeHandle
          setWidth={setWidth}
          width={width}
          ignoreClick={() => {
            ignoreClickRef.current = true;
          }}
        />
      )}
    </th>
  );
}

function ResizeHandle({ setWidth, width, ignoreClick }) {
  const [pos, setPos] = useState<any>(undefined);
  return (
    <Draggable
      onMouseDown={ignoreClick}
      position={pos}
      axis="x"
      onStop={() => {
        setPos({ x: 0, y: 0 });
      }}
      onDrag={(_, data) => {
        setPos({ x: 0, y: 0 });
        ignoreClick();
        setWidth(width + data.deltaX);
      }}
    >
      <span className="cocalc-crm-grid-column-resizer"></span>
    </Draggable>
  );
}
