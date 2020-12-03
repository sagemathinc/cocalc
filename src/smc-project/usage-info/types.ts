/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { TypedMap } from "../../smc-webapp/app-framework";

export interface UsageInfo {
  time: number; // server timestamp
  cpu: number;
  mem: number;
}

export type ImmutableUsageInfo = TypedMap<UsageInfo>;
