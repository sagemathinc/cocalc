/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { SiteLicenseQuota } from "../types/site-licenses";

// Site Licenses related constants

export const LicenseIdleTimeouts: {
  [key in NonNullable<SiteLicenseQuota["idle_timeout"]>]: {
    mins: number;
    desc: string;
  };
} = {
  short: {
    mins: 15,
    desc: "15 minutes",
  },
  medium: { mins: 2 * 60, desc: "2 hours" },
  day: { mins: 24 * 60, desc: "1 day" },
} as const;
