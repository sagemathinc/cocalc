/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { codemirrorMode } from "@cocalc/frontend/file-extensions";
import {
  CodeMirrorStatic,
  type Options,
} from "@cocalc/frontend/jupyter/codemirror-static";
import { Element } from "../../types";

export default function InputStatic({
  element,
  mode,
  options,
}: {
  element: Element;
  mode?;
  options?: Options;
}) {
  // TODO: falling back to python for the mode below; will happen on share server or before things have fully loaded.
  // Instead, this should be stored cached in the file.
  return (
    <CodeMirrorStatic
      value={element.str ?? ""}
      font_size={element.data?.fontSize}
      options={
        options ?? { lineNumbers: false, mode: mode ?? codemirrorMode("py") }
      }
      style={{
        background: "var(--cocalc-bg-hover, #f8f8f8)",
        color: "var(--cocalc-text-primary, #303030)",
        border: "1px solid var(--cocalc-border, #cfcfcf)",
        borderRadius: "4px",
      }}
    />
  );
}
