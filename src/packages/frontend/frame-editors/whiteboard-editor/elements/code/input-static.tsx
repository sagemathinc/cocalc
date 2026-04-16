/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { redux } from "@cocalc/frontend/app-framework";
import { codemirrorMode } from "@cocalc/frontend/file-extensions";
import { cm_options } from "@cocalc/frontend/jupyter/cm_options";
import { CodeMirrorStatic } from "@cocalc/frontend/jupyter/codemirror-static";
import { Element } from "../../types";

export default function InputStatic({
  element,
  mode,
}: {
  element: Element;
  mode?;
}) {
  const account = redux.getStore("account");
  const immutableEditorSettings = account?.get("editor_settings");
  const editorSettings = immutableEditorSettings?.toJS() ?? {};
  // TODO: falling back to python for the mode below; will happen on share server or before things have fully loaded.
  // Instead, this should be stored cached in the file.
  return (
    <CodeMirrorStatic
      value={element.str ?? ""}
      font_size={element.data?.fontSize}
      options={cm_options(
        mode ?? codemirrorMode("py"),
        editorSettings,
        false,
        false,
      )}
      style={{
        background: "var(--cocalc-bg-hover, #f8f8f8)",
        color: "var(--cocalc-text-primary, #303030)",
        border: "1px solid var(--cocalc-border, #cfcfcf)",
        borderRadius: "4px",
      }}
    />
  );
}
