/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Static codemirror-based renderer. */

import {
  CodeMirrorStatic,
  Options,
} from "@cocalc/frontend/jupyter/codemirror-static";
import { getExtension } from "lib/share/util";
import { codemirrorMode } from "@cocalc/frontend/file-extensions";

interface Props {
  content: string;
  filename: string;
  options?: Options;
  fontSize?: number;
}

export default function CodeMirror({
  content,
  filename,
  options,
  fontSize,
}: Props) {
  const ext = getExtension(filename);
  const mode = codemirrorMode(ext);
  return (
    <CodeMirrorStatic
      value={content}
      font_size={fontSize}
      options={{ lineNumbers: true, mode, ...options }}
    />
  );
}
