/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Viewer for public ipynb files.
*/

import { CSSProperties, useMemo } from "react";
import { Alert } from "antd";
import CellList from "./cell-list";
import { path_split } from "@cocalc/util/misc";
import parse from "./parse";
import { CodeMirrorStatic } from "../codemirror-static";
import "../output-messages/mime-types/init-nbviewer";

interface Props {
  content: string;
  project_id?: string;
  path?: string;
  fontSize?: number;
  style?: CSSProperties;
}

export default function NBViewer({
  content, // JSON string of an ipynb notebook
  project_id,
  path,
  fontSize,
  style,
}: Props) {
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
  const { cellList, cells, cmOptions, kernel } = x;

  return (
    <div style={style}>
      <div style={{ marginBottom: "15px" }}>
        <b>Kernel:</b> {kernel}
      </div>
      <CellList
        cellList={cellList}
        cells={cells}
        fontSize={fontSize}
        cmOptions={cmOptions}
        project_id={project_id}
        directory={path ? path_split(path).head : undefined}
      />
    </div>
  );
}
