/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { fromPairs } from "lodash";

import { EnvData } from "./types";

export const LANGUAGE_NAMES = [
  "python",
  "R",
  "octave",
  "julia",
  "sagemath",
] as const;

// sort this starting from the newest to the oldest – appears in the UI, e.g. on that /software/index page
// TODO: after https://github.com/sagemathinc/cocalc/pull/6284 has been merged, make 22.04 the first entry in that list
export const SOFTWARE_ENV_NAMES = [/*"22.04",*/ "20.04", "18.04"] as const;
export const SOFTWARE_ENV_DEFAULT = SOFTWARE_ENV_NAMES[0];
export type SoftwareEnvNames = typeof SOFTWARE_ENV_NAMES[number];

export const SOFTWARE_URLS: { [key in SoftwareEnvNames]: string } = fromPairs(
  SOFTWARE_ENV_NAMES.map((name) => [
    name,
    `https://storage.googleapis.com/cocalc-compute-environment/software-inventory-${name}.json`,
  ])
);

import SOFTWARE_1804 from "dist/software-inventory/18.04.json";
import SOFTWARE_2004 from "dist/software-inventory/20.04.json";
//import SOFTWARE_2204 from "dist/software-inventory/22.04.json";

// Note: we need to be explicit with these rougher types, because TS can't infer them from the JSON files since they're too large.
export const SOFTWARE_FALLBACK: { [key in SoftwareEnvNames]: EnvData } = {
  "18.04": SOFTWARE_1804 as EnvData,
  "20.04": SOFTWARE_2004 as EnvData,
  //"22.04": SOFTWARE_2204 as EnvData,
} as const;
