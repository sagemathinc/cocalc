/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Static codemirror-based renderer. */

import CodeMirrorStatic from "cocalc-codemirror-static";
import { getExtension } from "lib/util";
import { codemirrorMode } from "lib/file-extensions";

interface Props {
  content: string;
  filename: string;
}

export default function CodeMirror({ content, filename }: Props) {
  const ext = getExtension(filename);
  const mode = codemirrorMode(ext);
  const options = { lineNumbers: true, mode };
  return <CodeMirrorStatic value={content} options={options} />;
}
