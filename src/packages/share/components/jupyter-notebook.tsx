/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import CodeMirror from "components/codemirror";

interface Props {
  content: string;
}

export default function JupyterNotebook({ content }: Props) {
  let a;
  try {
    a = JSON.stringify(JSON.parse(content), undefined, 2);
  } catch (err) {
    a = content;
  }
  return <CodeMirror content={a} filename={"a.json"} />;
}
