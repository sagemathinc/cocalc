/*
Component for viewing csv data.
*/

import { CSSProperties, ReactNode, useMemo, useState } from "react";
import { Alert } from "antd";
import { parse } from "csv-parse/sync";
import { TableVirtuoso } from "react-virtuoso";
import { ColumnHeading } from "./headings";
import { rowBackground } from "@cocalc/util/misc";
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

function cellBoxShadow({
  isSelectedRow,
  isSelectedCell,
  isFirstColumn,
  isLastColumn,
}: {
  isSelectedRow: boolean;
  isSelectedCell: boolean;
  isFirstColumn: boolean;
  isLastColumn: boolean;
}): string | undefined {
  const shadows: string[] = [];
  if (isSelectedRow) {
    shadows.push(`inset 0 2px 0 ${COLORS.BLUE_LL}`);
    shadows.push(`inset 0 -2px 0 ${COLORS.BLUE_LL}`);
    if (isFirstColumn) {
      shadows.push(`inset 2px 0 0 ${COLORS.BLUE_LL}`);
    }
    if (isLastColumn) {
      shadows.push(`inset -2px 0 0 ${COLORS.BLUE_LL}`);
    }
  }
  if (isSelectedCell) {
    shadows.push(`inset 0 0 0 2px ${COLORS.BLUE_D}`);
  }
  return shadows.length > 0 ? shadows.join(", ") : undefined;
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
  const totalColumns = data[0]?.length ?? 0;
  const selectedRow = selectedCell?.row;
  const selectedColumn = selectedCell?.column;

  function backgroundColor(row: number, column: number): string {
    if (selectedRow === row && selectedColumn === column) {
      return COLORS.BLUE_LLL;
    }
    if (selectedRow === row || hoveredRow === row) {
      return COLORS.BLUE_LLLL;
    }
    return rowBackground({ index: row });
  }

  function cellStyle(row: number, column: number): CSSProperties {
    const isSelectedRow = selectedRow === row;
    const isSelectedCell = selectedRow === row && selectedColumn === column;
    return {
      border: `1px solid ${COLORS.GRAY_LL}`,
      padding: "0 5px",
      height: "30px",
      background: backgroundColor(row, column),
      cursor: "pointer",
      boxShadow: cellBoxShadow({
        isSelectedRow,
        isSelectedCell,
        isFirstColumn: column === 0,
        isLastColumn: column === totalColumns - 1,
      }),
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
                  ? {
                      background: COLORS.BLUE_LLLL,
                      boxShadow: `inset 0 -2px 0 ${COLORS.BLUE_D}`,
                    }
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
