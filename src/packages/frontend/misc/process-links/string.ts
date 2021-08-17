/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Process links in an HTML **string**. This can run as "server side rendering", i.e.,
on the client or server.  It's very fast and lightweight.  It can't install
a click handler (since it's just manipulating html), so it can't do things
like open a link to a project from within cocalc internally without opening
another page.  This is, of course, meant to be used in contexts like the
share server.

TODO: this is NOT used anywhere yet.
*/

import $ from "cheerio";
import processLinks from "./generic";

interface Options {
  urlTransform?: (target: string, tag: string) => string | undefined; // unchanged if returns undefined
  projectId?: string;
  filePath?: string;
}

export default function processLinksString(
  html: string,
  opts: Options
): string {
  const elt = $(`<div>${html}</div>`);
  processLinks(elt, { ...opts, $ });
  return elt.html() ?? "";
}
