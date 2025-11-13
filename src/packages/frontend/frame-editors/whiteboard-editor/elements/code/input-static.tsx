/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { codemirrorMode } from "@cocalc/frontend/file-extensions";
import { CodeMirrorStatic } from "@cocalc/frontend/jupyter/codemirror-static";
import { Element } from "../../types";

export default function InputStatic({
  element,
  mode,
}: {
  element: Element;
  mode?;
}) {
  // TODO: falling back to python for the mode below; will happen on share server or before things have fully loaded.
  // Instead, this should be stored cached in the file.
  return (
    <CodeMirrorStatic
      value={element.str ?? ""}
      font_size={element.data?.fontSize}
      options={{ lineNumbers: false, mode: mode ?? codemirrorMode("py") }}
    />
  );
}
