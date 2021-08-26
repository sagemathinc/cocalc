/* Static markdown renderer.

This is OK for basic stuff, but it is not really good.
It renders to HTML using markdown-it's own generator,
then using dangerouslySetInnerHTML, so that's not great.
Also, it's easy to trip up with math, e.g., this gets :

```
a = "$x^3$"
```

CoCalc has two other ways to convert Markdown to React:

- components/markdown: this converts to html without touching the math, then
  mathjax+katex directly process the math in the html via jQuery plugins.
  This basically works *on the frontend*, but has safety issues and uses
  dangerouslySetInnerHTML as well.

- editors/slate: this uses the markdown-it parser with some cleverness to
  properly parse markdown with math notation to a token stream.  It then
  directly processes that stream to make a slate document (a JSON object).
  Then our slate editor renders the document via React.
*/

import { markdown_to_html } from "@cocalc/frontend/markdown";
import { latexMathToHtml } from "@cocalc/frontend/misc/math-to-html";
import { replace_all } from "@cocalc/util/misc";

interface Props {
  value: string;
}

export default function Markdown({ value }: Props) {
  const html = markdown_to_html(value, { processMath: latexMathToHtml });
  // Unescape math:
  const __html = replace_all(html, "\\$", "$");
  return <div dangerouslySetInnerHTML={{ __html }}></div>;
}
