/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Static markdown renderer. */

import { markdown_to_html } from "smc-webapp/markdown/markdown";

interface Props {
  content: string;
}

export default function Markdown({ content }: Props) {
  return (
    <div dangerouslySetInnerHTML={{ __html: markdown_to_html(content) }}></div>
  );
}
