/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export const LANGUAGE_NAMES = [
  "python",
  "R",
  "octave",
  "julia",
  "sagemath",
] as const;

// sort this starting from the newest to the oldest – appears in the UI, e.g. on that /software/index page
// TODO: after https://github.com/sagemathinc/cocalc/pull/6284 has been merged, make 22.04 the first entry in that list
export const SOFTWARE_ENV_NAMES = ["22.04", "20.04", "18.04"] as const;
export const SOFTWARE_ENV_DEFAULT = "20.04";
export type SoftwareEnvNames = typeof SOFTWARE_ENV_NAMES[number];
