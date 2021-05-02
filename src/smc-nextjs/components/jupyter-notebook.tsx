/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import CodeMirror from "components/codemirror";

interface Props {
  content: string;
}

export default function JupyterNotebook({ content }: Props) {
  const a = JSON.stringify(JSON.parse(content), undefined, 2);
  return <CodeMirror content={a} filename={"a.json"} />;
}
