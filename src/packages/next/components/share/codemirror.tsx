/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
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
  lineNumbers?: boolean; // default true
}

export default function CodeMirror({
  content,
  filename,
  options,
  fontSize,
  lineNumbers = true,
}: Props) {
  const ext = getExtension(filename);
  const mode = codemirrorMode(ext);
  return (
    <CodeMirrorStatic
      value={content}
      font_size={fontSize}
      options={{ lineNumbers, mode, ...options }}
    />
  );
}
