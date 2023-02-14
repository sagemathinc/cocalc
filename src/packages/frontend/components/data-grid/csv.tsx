/*
Component for viewing csv data.
*/

import { useMemo } from "react";
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
}

export default function CSV({ overscan = 500, value = "" }: Props) {
  const data = useMemo(() => {
    return parse(value, {
      relax_quotes: true,
      skip_empty_lines: true,
    });
  }, [value]);

  return (
    <TableVirtuoso
      overscan={overscan}
      style={{ height: "100%", overflow: "auto" }}
      totalCount={data.length - 1}
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
            {data[index + 1]?.map((val) => (
              <td style={style} key={val}>
                {val}
              </td>
            ))}
          </>
        );
      }}
    />
  );
}
