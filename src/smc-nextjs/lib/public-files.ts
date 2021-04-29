/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { join, resolve } from "path";

const PROJECTS =
  process.env.COCALC_PROJECT_PATH ??
  join(
    process.env.SALVUS_ROOT ?? resolve(__dirname + "../.."),
    "data",
    "projects"
  );

// Given a project_id/path, return the directory on the file system where
// that path should be located.
export default function path(
  project_id: string,
  path: string
): string {
  return join(PROJECTS, project_id, path);
}
