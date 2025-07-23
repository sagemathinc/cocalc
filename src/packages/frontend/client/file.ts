/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { redux } from "../app-framework";
import { required, defaults } from "@cocalc/util/misc";

export class FileClient {
  constructor() {}

  // Returns true if the given file in the given project is currently
  // marked as deleted.
  public is_deleted(path: string, project_id: string): boolean {
    return !!redux
      .getProjectStore(project_id)
      ?.get("recentlyDeletedPaths")
      ?.get(path);
  }

  public set_deleted(_filename, _project_id): void {
    throw Error("set_deleted doesn't make sense for the frontend");
  }

  // Mark the given file with the given action.
  public async mark_file(opts: {
    project_id: string;
    path: string;
    action: string;
    ttl?: number;
  }): Promise<void> {
    opts = defaults(opts, {
      project_id: required,
      path: required,
      action: required,
      ttl: 120,
    });
    await redux
      .getActions("file_use")
      ?.mark_file(opts.project_id, opts.path, opts.action, opts.ttl);
  }
}
