/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Viewer for public ipynb files.
*/

import { Alert } from "antd";
import { CSSProperties, useMemo } from "react";
import { CodeMirrorStatic } from "@cocalc/frontend/jupyter/codemirror-static";
import parse from "@cocalc/jupyter/ipynb/parse";
import Notebook from "./notebook";

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
  ...props
}: Props) {
  const cocalcJupyter = useMemo(() => {
    try {
      return parse(content);
    } catch (error) {
      return error;
    }
  }, [content]);

  if (cocalcJupyter instanceof Error) {
    return (
      <div>
        <Alert
          message="Error Parsing Jupyter Notebook"
          description={`${cocalcJupyter}`}
          type="error"
        />
        <CodeMirrorStatic value={content} options={{ mode: "javascript" }} />
      </div>
    );
  }

  return <Notebook cocalcJupyter={cocalcJupyter} {...props} />;
}
