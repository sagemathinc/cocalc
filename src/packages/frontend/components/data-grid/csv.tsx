/*
Component for viewing csv data.
*/

import { ReactNode, useMemo, useState } from "react";
import { Alert } from "antd";
import { parse } from "csv-parse/sync";
import { TableVirtuoso } from "react-virtuoso";
import { ColumnHeading } from "./headings";
import { rowBackground } from "@cocalc/util/misc";

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

export default function CSV({
  overscan = 500,
  value = "",
  errHint = null,
}: Props) {
  const [error, setError] = useState<string>("");
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
          {data[0]?.map((field) => (
            <ColumnHeading key={field} title={trim(field)} width={200} />
          ))}
        </tr>
      )}
      itemContent={(index) => {
        const style = {
          border: "1px solid #eee",
          padding: "0 5px",
          height: "30px",
          background: rowBackground({ index }),
        };
        return (
          <>
            {data[index + 1]?.map((val, k) => (
              <td style={style} key={k}>
                {val}
              </td>
            ))}
          </>
        );
      }}
    />
  );
}
