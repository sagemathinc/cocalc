/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

export const LANGUAGE_NAMES = [
  "python",
  "R",
  "octave",
  "julia",
  "sagemath",
] as const;

export type LanguageName = (typeof LANGUAGE_NAMES)[number];

// sort this starting from the newest to the oldest – appears in the UI, e.g. on that /software/index page
// TODO: after https://github.com/sagemathinc/cocalc/pull/6284 has been merged, make 22.04 the first entry in that list
export const SOFTWARE_ENV_NAMES = ["24.04", "22.04", "20.04"] as const;
export type SoftwareEnvNames = (typeof SOFTWARE_ENV_NAMES)[number];
export const SOFTWARE_ENV_DEFAULT: SoftwareEnvNames = "22.04";
