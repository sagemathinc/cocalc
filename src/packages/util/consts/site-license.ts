/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { sortBy } from "lodash";
import { SiteLicenseQuota } from "../types/site-licenses";

// Site Licenses related constants
// the license timeouts combined with the default quota (either hardcoded or the one from the site_settings)
// hence 30 minutes + 30 minutes default result in 30 minutes, and the same for "medium" and "day"
// @see DEFAULT_QUOTAS.mintime in src/packages/util/upgrade-spec.js
export const LicenseIdleTimeouts: {
  [key in NonNullable<SiteLicenseQuota["idle_timeout"]>]: {
    mins: number;
    desc: string;
  };
} = {
  short: {
    mins: 30,
    desc: "30 minutes",
  },
  medium: { mins: 2 * 60, desc: "2 hours" },
  day: { mins: 24 * 60, desc: "1 day" },
} as const;

export const LicenseIdleTimeoutsKeysOrdered = sortBy(
  Object.keys(LicenseIdleTimeouts),
  (v) => LicenseIdleTimeouts[v].mins
) as Array<string>;
