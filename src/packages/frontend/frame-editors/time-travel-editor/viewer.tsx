/*
Render a document, where the rendering is determined by the file extension
*/

import ChatViewer from "@cocalc/frontend/chat/viewer";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { TasksHistoryViewer } from "@cocalc/frontend/editors/task-editor/history-viewer";
import { getScale } from "@cocalc/frontend/frame-editors/frame-tree/hooks";
import Whiteboard from "@cocalc/frontend/frame-editors/whiteboard-editor/time-travel";
import { HistoryViewer as JupyterHistoryViewer } from "@cocalc/frontend/jupyter/history-viewer";
import type { Document } from "@cocalc/sync/editor/generic/types";
import { TextDocument } from "./document";
import { isObjectDoc } from "./view-document";

export const HAS_SPECIAL_VIEWER = new Set([
  "tasks",
  "ipynb",
  "sagews",
  "board",
  "slides",
  "md",
  "chat",
  "sage-chat",
]);

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
  doc: () => Document | undefined;
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
        value={() => doc()?.to_str() ?? "unknown version"}
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
  const opts1 = { doc, project_id, path, font_size, editor_settings };

  switch (ext) {
    case "chat":
    case "sage-chat":
      return <ChatViewer {...opts1} />;
  }

  const opts = { doc: doc(), project_id, path, font_size, editor_settings };
  if (opts.doc == null) {
    return null;
  }

  // CRITICAL: the extensions here *must* also be listed in HAS_SPECIAL_VIEWER above!
  switch (ext) {
    case "tasks":
      return <TasksHistoryViewer {...opts} />;
    case "ipynb":
      return <JupyterHistoryViewer {...opts} />;
    case "md":
      const scale = getScale(font_size);
      return (
        <div style={{ overflow: "auto", padding: "50px 70px" }}>
          <StaticMarkdown
            value={doc()?.to_str() ?? "unknown version"}
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
