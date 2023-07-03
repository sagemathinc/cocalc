/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { IconName } from "@cocalc/frontend/components";

interface TopBarAction {
  label: string;
  icon: IconName;
  action: (any) => any;
}

export type TopBarActions = TopBarAction[];
