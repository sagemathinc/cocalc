import { CSSProperties } from "react";
import { useBottomScroller } from "@cocalc/frontend/app-framework/use-bottom-scroller";
import "@cocalc/frontend/jupyter/output-messages/mime-types/init-nbviewer";
import { path_split } from "@cocalc/util/misc";
import { JupyterContext } from "../jupyter-context";
import {
  type CoCalcJupyter,
  getCMOptions,
  getMode,
} from "@cocalc/jupyter/ipynb/parse";
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
  let { cellList, cells, cmOptions, metadata, kernelspec } = cocalcJupyter;
  if (cmOptions == null) {
    cmOptions = getCMOptions(getMode({ metadata }));
  }

  return (
    <JupyterContext.Provider value={{ kernelspec }}>
      <div ref={ref} style={style}>
        <div style={{ margin: "15px", textAlign:'right' }}>
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
