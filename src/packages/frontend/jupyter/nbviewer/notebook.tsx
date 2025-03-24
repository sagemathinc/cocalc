import { CSSProperties } from "react";
import { useBottomScroller } from "@cocalc/frontend/app-framework/use-bottom-scroller";
import "@cocalc/frontend/jupyter/output-messages/mime-types/init-nbviewer";
import { path_split } from "@cocalc/util/misc";
import { JupyterContext } from "../jupyter-context";
import type { CoCalcJupyter } from "@cocalc/jupyter/ipynb/parse";
import CellList from "./cell-list";

interface Props {
  cocalcJupyter: CoCalcJupyter;
  project_id?: string;
  path?: string;
  fontSize?: number;
  style?: CSSProperties;
  cellListStyle?: CSSProperties;
  scrollBottom?: boolean;
}

export default function Notebook({
  cocalcJupyter,
  project_id,
  path,
  fontSize,
  style,
  cellListStyle,
  scrollBottom,
}: Props) {
  const ref = useBottomScroller<HTMLDivElement>(scrollBottom, cocalcJupyter);
  const { cellList, cells, cmOptions, kernelspec } = cocalcJupyter;

  return (
    <JupyterContext.Provider value={{ kernelspec }}>
      <div ref={ref} style={style}>
        <div style={{ marginBottom: "15px", marginLeft: "15px" }}>
          <b>Kernel:</b> {kernelspec.display_name}
        </div>
        <CellList
          cellList={cellList}
          cells={cells}
          fontSize={fontSize}
          cmOptions={cmOptions}
          project_id={project_id}
          directory={path ? path_split(path).head : undefined}
          kernel={kernelspec.name}
          style={cellListStyle}
        />
      </div>
    </JupyterContext.Provider>
  );
}
