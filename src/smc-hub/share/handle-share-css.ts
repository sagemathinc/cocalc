/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export function handle_share_css(_req: any, res: any): void {
  res.type("text/css");
  res.send(`\
.cocalc-jupyter-anchor-link {
  visibility : hidden
};\
`);
}
