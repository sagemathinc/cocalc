/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { FILE_ACTIONS } from "@cocalc/frontend/project_actions";

interface Props {
  action: keyof typeof FILE_ACTIONS;
}

export function FilesAction({ action }: Props) {
  return <>File action: {action}`</>
}
