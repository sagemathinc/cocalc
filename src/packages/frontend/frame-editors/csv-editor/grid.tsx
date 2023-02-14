import { useMemo } from "react";
import { parse } from "csv-parse/sync";
import { AgGridReact } from "ag-grid-react";

import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";

import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";

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

export default function Grid({ value }) {
  const { desc } = useFrameContext();

  const { rowData, columnDefs } = useMemo(() => {
    const records = parse(value, {
      relax_quotes: true,
      skip_empty_lines: true,
    });
    const columnDefs = records[0].map((field) => {
      return { field: trim(field) };
    });
    const rowData: any[] = [];
    for (let n = 1; n < records.length; n++) {
      const row: any = {};
      for (let i = 0; i < columnDefs.length; i++) {
        row[columnDefs[i].field] = records[n][i];
      }
      rowData.push(row);
    }
    return { rowData, columnDefs };
  }, [value]);

  return (
    <div
      className="ag-theme-alpine"
      style={{ fontSize: desc.get("font_size"), height: "100%" }}
    >
      <AgGridReact rowData={rowData} columnDefs={columnDefs} />
    </div>
  );
}
