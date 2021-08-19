/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Static markdown renderer. */

import { markdown_to_html } from "@cocalc/frontend/markdown";
import mathToHtml from "@cocalc/frontend/misc/math-to-html";

function processMath(s: string): string {
  const { __html, err } = s.startsWith("$$")
    ? mathToHtml(s.slice(2, s.length - 2), false)
    : mathToHtml(s.slice(1, s.length - 1), true);
  if (err) {
    return `<span style="color:#ff6666">${err}</span>`;
  } else {
    return __html;
  }
}

interface Props {
  content: string;
}

export default function Markdown({ content }: Props) {
  const __html = markdown_to_html(content, { processMath });
  return <div dangerouslySetInnerHTML={{ __html }}></div>;
}

