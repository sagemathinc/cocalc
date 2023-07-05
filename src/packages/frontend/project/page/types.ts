/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { TypedMap } from "@cocalc/frontend/app-framework";
import { IconName } from "@cocalc/frontend/components";

interface TopBarAction {
  label: string;
  icon: IconName;
  action?: (any) => any; // captures a static action
  getAction?: (
    local_view_state?: TypedMap<{ active_id?: string; full_id?: string }>
  ) => any; // for dynamic actions
}

export type TopBarActions = TopBarAction[];
