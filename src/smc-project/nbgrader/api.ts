/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// THIS IS STILL JUST A STUB.

import {
  NBGraderAPIOptions,
  NBGraderAPIResponse,
} from "../smc-webapp/jupyter/nbgrader/api";

export async function nbgrader(
  client,
  logger,
  opts: NBGraderAPIOptions
): Promise<NBGraderAPIResponse> {
  logger.debug("nbgrader STUB", opts);
  client = client;
  return { output: opts, ids: [] };
}
