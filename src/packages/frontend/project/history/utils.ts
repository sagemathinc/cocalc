/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { redux } from "@cocalc/frontend/app-framework";
import { should_open_in_foreground } from "@cocalc/util/misc";

// used when clicking/opening a file open entry in the project activity log
export function handle_log_click(
  e: React.MouseEvent | React.KeyboardEvent,
  path: string,
  project_id: string
): void {
  e.preventDefault();
  const switch_to = should_open_in_foreground(e);
  redux.getProjectActions(project_id).open_file({
    path,
    foreground: switch_to,
    foreground_project: switch_to,
  });
}
