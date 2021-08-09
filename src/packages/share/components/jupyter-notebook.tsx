/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import NBViewer from "@cocalc/frontend/jupyter/nbviewer/nbviewer";

interface Props {
  content: string;
}

export default function JupyterNotebook({ content }: Props) {
  return <NBViewer content={content} />;
}
