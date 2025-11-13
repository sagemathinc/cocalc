/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// NOTE: this pulls in a lot of data. Make sure to never load it indirectly from a page.

import { fromPairs } from "lodash";

import {
  SoftwareEnvNames,
  SOFTWARE_ENV_NAMES,
} from "@cocalc/util/consts/software-envs";
import { EnvData } from "./types";

import SOFTWARE_2004 from "software-inventory/20.04.json";
import SOFTWARE_2204 from "software-inventory/22.04.json";
import SOFTWARE_2404 from "software-inventory/24.04.json";


export const SOFTWARE_URLS: { [key in SoftwareEnvNames]: string } = fromPairs(
  SOFTWARE_ENV_NAMES.map((name) => [
    name,
    `https://storage.googleapis.com/cocalc-compute-environment/software-inventory-${name}.json`,
  ]),
);

// Note: we need to be explicit with these rougher types, because TS can't infer them from the JSON files since they're too large.
export const SOFTWARE_FALLBACK: { [key in SoftwareEnvNames]: EnvData } = {
  "20.04": SOFTWARE_2004 as EnvData,
  "22.04": SOFTWARE_2204 as EnvData,
  "24.04": SOFTWARE_2404 as EnvData,

} as const;
