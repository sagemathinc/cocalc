/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { exec } from "../generic/client";
import { path_split } from "smc-util/misc2";

// an enhancement might be to generate html via $ texcount -htmlcore
// but that doesn't format it in a substantially better way

export async function count_words(
  project_id: string,
  path: string,
  time?: number
) {
  const { head, tail } = path_split(path);
  const res = await exec({
    command: "texcount",
    args: [tail],
    project_id: project_id,
    path: head,
    err_on_exit: false,
    aggregate: time,
  });
  return res;
}
