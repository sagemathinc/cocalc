/* Convert from Ipynb to HTML.

We give this a non JSX interface so it can be used from the project, which
doesn't directly know about React.

This is meant to be used from node.js only.  Not from webpack at all.
It is used by the project to convert Jupyter notebooks to html,
which is suitable for download or printing to pdf.

Note that the resulting HTML depends on network access for the CSS
for CodeMirror, KaTeX, and antd.  Thus printing to pdf purely on the
backend is impossible in a project without network access.
*/

import NBViewer from "./nbviewer";
import { renderToString } from "react-dom/server";
import { createElement, CSSProperties } from "react";
import { FileContext } from "@cocalc/frontend/lib/file-context";

export default function exportToHTML({
  content,
  fontSize,
  style,
}: {
  content: string;
  fontSize?: number;
  style?: CSSProperties;
}): string {
  const notebook = createElement(NBViewer, { content, fontSize, style });
  const element = createElement(
    FileContext.Provider,
    { value: { noSanitize: true } },
    [notebook]
  );
  const body = renderToString(element);

  const { codemirror, antd, katex } = getVersions();

  return `<html>
<head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/${codemirror}/codemirror.min.css" crossorigin="anonymous" referrerpolicy="no-referrer" />
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/${katex}/katex.min.css" crossorigin="anonymous" referrerpolicy="no-referrer" />
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/antd/${antd}/antd.compact.min.css" crossorigin="anonymous" referrerpolicy="no-referrer" />
</head>
<body>
${body}
</body>
`;
}

function getVersions() {
  return {
    antd: require("antd").version,
    codemirror: require("codemirror/package").version,
    katex: require("katex").version,
  };
}
