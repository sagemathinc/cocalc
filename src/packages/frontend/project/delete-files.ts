/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { webapp_client } from "../webapp-client";

// Low-level file deletion — calls the project API directly.
// WARNING: Do not call this from UI code. Use ProjectActions.delete_files()
// instead, which adds sandbox checks, project-running validation,
// activity logging, and audit trail on top of this.
export async function delete_files(
  project_id: string,
  paths: string[],
  compute_server_id?: number,
): Promise<void> {
  // Get project api
  const api = await webapp_client.project_client.api(project_id);
  // Send message requesting to delete the files
  await api.delete_files(paths, compute_server_id);
}
