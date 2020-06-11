/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

interface Opts {
  base_url: string;
  req: any;
  res: any;
}

export async function handle_open_request(opts: Opts): Promise<void> {
  const { base_url, req, res } = opts;
  res.type("text");
  const { schema, spec } = req.params;
  res.write(`schema: '${schema}' for opening '${spec}' -- ${base_url}`);
  res.end()
}
