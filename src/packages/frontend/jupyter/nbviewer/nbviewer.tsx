/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Viewer for public ipynb files.
*/

import { Alert } from "antd";
import { CSSProperties, useMemo } from "react";
import { useBottomScroller } from "@cocalc/frontend/app-framework/use-bottom-scroller";
import { CodeMirrorStatic } from "@cocalc/frontend/jupyter/codemirror-static";
import "@cocalc/frontend/jupyter/output-messages/mime-types/init-nbviewer";
import parse from "@cocalc/jupyter/ipynb/parse";
import { path_split } from "@cocalc/util/misc";
import { JupyterContext } from "../jupyter-context";
import CellList from "./cell-list";

interface Props {
  content: string;
  project_id?: string;
  path?: string;
  fontSize?: number;
  style?: CSSProperties;
  cellListStyle?: CSSProperties;
  scrollBottom?: boolean;
}

export default function NBViewer({
  content, // JSON string of an ipynb notebook
  project_id,
  path,
  fontSize,
  style,
  cellListStyle,
  scrollBottom,
}: Props) {
  const ref = useBottomScroller<HTMLDivElement>(scrollBottom, content);

  const x = useMemo(() => {
    try {
      return parse(content);
    } catch (error) {
      return error;
    }
  }, [content]);
  if (x instanceof Error) {
    return (
      <div>
        <Alert
          message="Error Parsing Jupyter Notebook"
          description={`${x}`}
          type="error"
        />
        <CodeMirrorStatic value={content} options={{ mode: "javascript" }} />
      </div>
    );
  }
  const { cellList, cells, cmOptions, kernelspec } = x;

  return (
    <JupyterContext.Provider value={{ kernelspec }}>
      <div ref={ref} style={style}>
        <div style={{ marginBottom: "15px" }}>
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
