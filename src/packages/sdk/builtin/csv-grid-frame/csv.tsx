/*
Component for viewing csv data.
*/

import { CSSProperties, ReactNode, useMemo, useState } from "react";
import { Alert } from "antd";
import { parse } from "csv-parse/sync";
import { TableVirtuoso } from "react-virtuoso";
import { ColumnHeading } from "@cocalc/frontend/components/data-grid/headings";
import { COLORS } from "@cocalc/util/theme";

function trim(x) {
  if (x == null) return "";
  let s = x.trim();
  if (s[0] == '"') {
    s = s.slice(1);
  }
  if (s.endsWith('"')) {
    s = s.slice(0, -1);
  }
  return s;
}

interface Props {
  value?: string;
  overscan?: number;
  errHint?: ReactNode;
}

interface SelectedCell {
  row: number;
  column: number;
}

export default function CSV({
  overscan = 500,
  value = "",
  errHint = null,
}: Props) {
  const [error, setError] = useState<string>("");
  const [hoveredRow, setHoveredRow] = useState<number | undefined>();
  const [selectedCell, setSelectedCell] = useState<SelectedCell | undefined>();
  const data = useMemo(() => {
    setError("");
    try {
      return parse(value, {
        relax_quotes: true,
        skip_empty_lines: true,
      });
    } catch (err) {
      setError(`Unable to parse csv file: ${err}`);
      return [];
    }
  }, [value]);
  const selectedRow = selectedCell?.row;
  const selectedColumn = selectedCell?.column;

  function backgroundColor(row: number, column: number): string {
    const isSelectedRow = selectedRow === row;
    const isSelectedColumn = selectedColumn === column;
    if (isSelectedRow && isSelectedColumn) {
      return COLORS.BLUE_LLL;
    }
    if (isSelectedRow || isSelectedColumn || hoveredRow === row) {
      return COLORS.BLUE_LLLL;
    }
    return "white";
  }

  function cellStyle(row: number, column: number): CSSProperties {
    const isSelectedCell = selectedRow === row && selectedColumn === column;
    return {
      border: `1px solid ${COLORS.GRAY_LL}`,
      padding: "0 5px",
      height: "30px",
      background: backgroundColor(row, column),
      cursor: "pointer",
      boxShadow: isSelectedCell
        ? `inset 0 0 0 2px ${COLORS.BLUE_D}`
        : undefined,
    };
  }

  if (error) {
    return (
      <Alert
        style={{ margin: "15px 0" }}
        message={
          <div>
            {error}
            <br />
            {errHint}
          </div>
        }
        type="error"
      />
    );
  }

  return (
    <TableVirtuoso
      overscan={overscan}
      style={{ height: "100%", overflow: "auto" }}
      totalCount={Math.max(0, data.length - 1)}
      fixedHeaderContent={() => (
        <tr>
          {data[0]?.map((field, column) => (
            <ColumnHeading
              key={`${field}-${column}`}
              title={trim(field)}
              width={200}
              style={
                selectedColumn === column
                  ? { background: COLORS.BLUE_LLLL }
                  : undefined
              }
            />
          ))}
        </tr>
      )}
      itemContent={(index) => {
        return (
          <>
            {data[index + 1]?.map((val, k) => (
              <td
                style={cellStyle(index, k)}
                key={k}
                onMouseEnter={() => {
                  setHoveredRow(index);
                }}
                onMouseLeave={() => {
                  setHoveredRow((current) =>
                    current === index ? undefined : current,
                  );
                }}
                onClick={() => {
                  setSelectedCell((current) =>
                    current?.row === index && current?.column === k
                      ? undefined
                      : { row: index, column: k },
                  );
                }}
              >
                {val}
              </td>
            ))}
          </>
        );
      }}
    />
  );
}
