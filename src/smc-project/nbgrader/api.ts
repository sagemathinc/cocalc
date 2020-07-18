/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  NBGraderAPIOptions,
  NBGraderAPIResponse,
} from "../smc-webapp/jupyter/nbgrader/api";

export async function nbgrader(
  client,
  logger,
  opts: NBGraderAPIOptions
): Promise<NBGraderAPIResponse> {
  logger.debug("nbgrader", opts);
  client = client;
  return { output: opts };
}
