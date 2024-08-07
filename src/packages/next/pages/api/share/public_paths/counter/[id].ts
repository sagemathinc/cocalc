/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
API to increment the counter for a public_path.

This is of course really dumb and naive and somebody could trivially mess this up.
I'm just implementing this to get the same functionality as before and maybe better
inform server side rendering.  We'll do something much better later.
*/

import { isSha1Hash } from "lib/share/util";
import getPool from "@cocalc/database/pool";

export default async function handler(req, res) {
  const { id } = req.query;
  if (!isSha1Hash(id)) {
    res.error("id must be a sha1 hash");
    return;
  }
  const pool = getPool();
  await pool.query(
    "UPDATE public_paths SET counter = coalesce(counter,0) + 1 WHERE id=$1",
    [id]
  );
  res.end();
}
