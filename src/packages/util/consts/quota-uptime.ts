/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { sortBy } from "lodash";

type Keys = "short" | "medium" | "day";

// Site Licenses related constants
// the license timeouts combined with the default quota (either hardcoded or the one from the site_settings)
// hence 30 minutes + 30 minutes default result in 30 minutes, and the same for "medium" and "day"
// @see DEFAULT_QUOTAS.mintime in src/packages/util/upgrade-spec.js
// medium and day imply member hosting
export const LicenseIdleTimeouts: {
  [key in Keys]: {
    mins: number;
    label: string;
    labelShort: string; // same as "label", but shorter
    priceFactor: number;
    requireMemberhosting?: boolean; // if true, require member hosting
  };
} = {
  short: {
    mins: 30,
    label: "30 minutes",
    labelShort: "30min",
    priceFactor: 1,
  },
  medium: { mins: 2 * 60, label: "2 hours", labelShort: "2h", priceFactor: 2 },
  day: {
    mins: 24 * 60,
    label: "1 day",
    labelShort: "1d",
    priceFactor: 4,
    requireMemberhosting: true,
  },
} as const;

export const LicenseIdleTimeoutsKeysOrdered = sortBy(
  Object.keys(LicenseIdleTimeouts),
  (v) => LicenseIdleTimeouts[v].mins
) as Readonly<Keys[]>;

export function requiresMemberhosting(key?: Uptime | string): boolean {
  if (key == null) return false;
  if (key == "always_running") return true;
  return LicenseIdleTimeouts[key]?.requireMemberhosting ?? false;
}

export type Uptime = Keys | "always_running";

export function untangleUptime(uptime?: Uptime): {
  always_running: boolean;
  idle_timeout: Keys;
} {
  if (uptime == null) {
    // Let's just support this and have it default to short, since obviously
    // by explicitly allowing uptime? via typescript, we can't even tell there
    // is a problem from typescript errors.  See
    //    https://github.com/sagemathinc/cocalc/issues/6257
    // for how this bug causes a lot of trouble.
    return { always_running: false, idle_timeout: "short" };
  }
  if (uptime == "always_running") {
    return { always_running: true, idle_timeout: "day" };
  }
  return { always_running: false, idle_timeout: uptime };
}

export function displaySiteLicense(uptime: Uptime) {
  if (uptime == "always_running") {
    return "Always Running";
  } else {
    return LicenseIdleTimeouts[uptime].label;
  }
}
