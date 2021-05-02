/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { parse_sagews } from "smc-webapp/sagews/parse-sagews";
import CodeMirror from "components/codemirror";

interface Props {
  content: string;
}

export default function SageWorksheet({ content }: Props) {
  const parsed = parse_sagews(content);
  return <CodeMirror
    content={JSON.stringify(parsed, undefined, 2)}
    filename={"a.json"}
  />;
}
