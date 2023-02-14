import { useMemo, useState } from "react";
import { parse } from "csv-parse/sync";
import { ReactGrid, Row } from "@silevis/reactgrid";
import "@silevis/reactgrid/styles.css";
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
  const { actions, desc } = useFrameContext();
  const [widths, setWidths] = useState<number[]>([]);

  const { columns, rows } = useMemo(() => {
    const records = parse(value, {
      relax_quotes: true,
      skip_empty_lines: true,
    });
    const columns = records[0].map((_, i) => {
      return { columnId: i, resizable: true, width: widths[i] };
    });
    const headerRow: Row = {
      rowId: "header",
      cells: records[0].map((x) => {
        return { type: "header", text: trim(x) };
      }),
    };
    const rows: Row[] = [headerRow];

    for (let idx = 1; idx < records.length; idx++) {
      rows.push({
        rowId: idx,
        cells: records[idx].map((x) => {
          return { type: "text", text: trim(x) };
        }),
      });
    }
    return { records, columns, rows };
  }, [value]);

  const handleChanges = (_changes) => {
    actions.set_error(
      "Editing the grid view is not yet implemented. You can edit in the raw data view."
    );
  };

  return (
    <div style={{ overflow: "auto", fontSize: desc.get("font_size") }}>
      <ReactGrid
        columns={columns}
        rows={rows}
        stickyTopRows={1}
        onColumnResized={(columnId, width: number) => {
          const widths1 = [...widths];
          widths1[columnId] = width;
          setWidths(widths1);
        }}
        onCellsChanged={handleChanges}
      />
    </div>
  );
}
