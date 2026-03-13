/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// This is used to find files on the share server (public_paths) in "next"
// and also in the hub, for deleting shared files of projects

import { join } from "node:path";

import { projects } from "@cocalc/backend/data";

// Given a project_id/path, return the directory on the file system where
// that path should be located.
export function pathToFiles(project_id: string, path: string): string {
  return join(projects.replace("[project_id]", project_id), path);
}
