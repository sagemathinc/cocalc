/*
Render a document, where the rendering is detemined by the file extension
*/

import type { Document } from "@cocalc/sync/editor/generic/types";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { TextDocument } from "./document";
import { TasksHistoryViewer } from "../../editors/task-editor/history-viewer";
import { HistoryViewer as JupyterHistoryViewer } from "../../jupyter/history-viewer";
import { SagewsCodemirror } from "./sagews-codemirror";
import Whiteboard from "@cocalc/frontend/frame-editors/whiteboard-editor/time-travel";
import { isObjectDoc } from "./view-document";
import { getScale } from "@cocalc/frontend/frame-editors/frame-tree/hooks";

export function Viewer({
  ext,
  doc,
  textMode,
  id,
  path,
  project_id,
  font_size,
  editor_settings,
  actions,
}: {
  ext: string;
  doc: Document;
  textMode?: boolean;
  id: string;
  path: string;
  project_id: string;
  font_size: number;
  editor_settings;
  actions;
}) {
  const renderText = () => {
    return (
      <TextDocument
        value={doc.to_str()}
        id={id}
        path={isObjectDoc(path) ? "a.js" : path}
        project_id={project_id}
        font_size={font_size}
        editor_settings={editor_settings}
        actions={actions}
      />
    );
  };
  if (textMode) {
    return renderText();
  }
  const opts = { doc, project_id, path, font_size, editor_settings };

  switch (ext) {
    case "tasks":
      return <TasksHistoryViewer {...opts} />;
    case "ipynb":
      return <JupyterHistoryViewer {...opts} />;
    case "sagews":
      return <SagewsCodemirror {...opts} />;
    case "md":
      const scale = getScale(font_size);
      return (
        <div style={{ overflow: "auto", padding: "50px 70px" }}>
          <StaticMarkdown
            value={doc.to_str()}
            style={{ fontSize: `${100 * scale}%` }}
          />
        </div>
      );
    case "board":
      return <Whiteboard {...opts} mainFrameType={"whiteboard"} />;
    case "slides":
      return <Whiteboard {...opts} mainFrameType={"slides"} />;
    default:
      return renderText();
  }
}
