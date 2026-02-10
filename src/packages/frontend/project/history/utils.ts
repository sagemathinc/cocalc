/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { redux } from "@cocalc/frontend/app-framework";
import type { FragmentId } from "@cocalc/frontend/misc/fragment-id";
import { should_open_in_foreground } from "@cocalc/frontend/lib/should-open-in-foreground";

// used when clicking/opening a file open entry in the project activity log and similar
export function handleFileEntryClick(
  e: React.MouseEvent | React.KeyboardEvent | undefined,
  path: string,
  project_id: string,
  fragmentId?: FragmentId,
): void {
  e?.preventDefault();
  const switch_to = should_open_in_foreground(e);
  redux.getProjectActions(project_id).open_file({
    path,
    foreground: switch_to,
    foreground_project: switch_to,
    fragmentId,
  });
}
