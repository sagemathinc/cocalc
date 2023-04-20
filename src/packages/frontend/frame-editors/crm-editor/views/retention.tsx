import { ReactNode, useMemo, useState } from "react";
import { TableVirtuoso } from "react-virtuoso";
import { Divider, Modal } from "antd";
import type { ColumnsType } from "../fields";
import { ViewOnly } from "../fields/context";
import { Icon } from "@cocalc/frontend/components";
import { Data } from "./gallery";
import Json from "./json";
import { sortDirections } from "../syncdb/use-sort-fields";
import useFieldWidths from "../syncdb/use-field-widths";
import useSelection from "./use-selection";
import SelectableIndex, { SelectAll } from "./selectable-index";
import { rowBackground } from "@cocalc/util/misc";
import {
  ColumnHeading,
  nextSortState,
} from "@cocalc/frontend/components/data-grid";
import { getTableDescription } from "../tables";
import RetentionConfig from "./retention/config";

const DEFAULT_WIDTH = 150;

export interface Retention {
  model: string;
  start: Date;
  stop: Date;
  period: string;
  dataEnd?: Date;
}

const oneMonthAgo = new Date();
oneMonthAgo.setUTCMonth(oneMonthAgo.getUTCMonth() - 1);
oneMonthAgo.setUTCHours(0, 0, 0, 0);

const oneMonthAgoPlusDay = new Date(oneMonthAgo);
oneMonthAgoPlusDay.setUTCDate(oneMonthAgo.getUTCDate() + 1);

export const DEFAULT_RETENTION = {
  model: getTableDescription("crm_retention").retention?.models[0] ?? "",
  start: oneMonthAgo,
  stop: oneMonthAgoPlusDay,
  period: "1 day",
} as Retention;

interface Props {
  data: any[];
  columns: ColumnsType[];
  sortFields;
  setSortField;
  recordHeight?: number;
  primaryKey?: string; // the primary key -- undefined if there is a compound primary key (TODO!?)
  id: string;
  retention: Retention;
  setRetention: (retention) => void;
  retentionDescription;
}

export default function RetentionView({
  data,
  columns,
  sortFields,
  setSortField,
  recordHeight,
  primaryKey,
  id,
  retention,
  retentionDescription,
  setRetention,
}: Props) {
  const selection = useSelection({
    id,
    size: data.length,
    getKey: (index) => data[index]?.[primaryKey ?? ""],
  });
  const [fieldWidths, setFieldWidths] = useFieldWidths({ id });
  return (
    <div>
      <RetentionConfig
        retention={retention}
        setRetention={setRetention}
        retentionDescription={retentionDescription}
      />
      <TableVirtuoso
        overscan={500}
        style={{ height: "100%", overflow: "auto" }}
        totalCount={data.length}
        fixedHeaderContent={() => (
          <Header
            columns={columns}
            sortFields={sortFields}
            setSortField={setSortField}
            fieldWidths={fieldWidths}
            setFieldWidths={setFieldWidths}
            selection={selection}
            primaryKey={primaryKey}
          />
        )}
        itemContent={(index) => (
          <GridRow
            index={index}
            primaryKey={primaryKey}
            data={data[index]}
            columns={columns}
            fieldWidths={fieldWidths}
            recordHeight={recordHeight}
            selection={selection}
          />
        )}
      />
    </div>
  );
}

function GridRow({
  index,
  data,
  columns,
  recordHeight,
  fieldWidths,
  primaryKey,
  selection,
}) {
  const background = rowBackground({
    index,
    checked: selection.has(data[primaryKey]),
  });
  const v: ReactNode[] = primaryKey
    ? [
        <td
          key="index"
          style={{
            cursor: "pointer",
            border: "1px solid #eee",
            padding: "0 5px",
            color: "#666",
            textAlign: "center",
            background,
          }}
        >
          <SelectableIndex
            index={index}
            primaryKey={data[primaryKey]}
            selection={selection}
          />
        </td>,
      ]
    : [];
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
          background,
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

function Header({
  columns,
  sortFields,
  setSortField,
  fieldWidths,
  setFieldWidths,
  selection,
  primaryKey,
}) {
  const directions = useMemo(() => {
    if (sortFields == null) return {};
    return sortDirections(sortFields);
  }, [sortFields]);

  return (
    <tr style={{ position: "relative" }}>
      {primaryKey && (
        <ColumnHeading width={30} title={<SelectAll selection={selection} />} />
      )}
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
