/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// cSpell:ignore texcount htmlcore

import { exec } from "@cocalc/frontend/frame-editors/generic/client";
import { path_split } from "@cocalc/util/misc";

// an enhancement might be to generate html via $ texcount -htmlcore
// but that doesn't format it in a substantially better way

export async function count_words(
  project_id: string,
  path: string,
  time?: number,
) {
  const { head, tail } = path_split(path);
  const res = await exec(
    {
      command: "texcount",
      args: [tail],
      project_id: project_id,
      path: head,
      err_on_exit: false,
      aggregate: time,
    },
    path,
  );
  return res;
}
