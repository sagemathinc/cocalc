/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// These are defaults used by store (and also when parsing the quota params from a URL).

import { STANDARD_DISK } from "@cocalc/util/consts/billing";
import { upgrades } from "@cocalc/util/upgrade-spec";

// RAM
export const MAX_RAM_GB = upgrades.max_per_project.memory / 1000;
export const RAM_DEFAULT_GB = 4; // 4gb highly recommended

// CPU
export const DEFAULT_CPU = 1;
export const MAX_CPU = upgrades.max_per_project.cores;

// DISK
// TODO (Aug 2025): increase this once the new file server is released
export const MAX_DISK_GB = 15;
// Aug 2025: in anticipation of the new file server, the minimum and standard is increased
export const DISK_DEFAULT_GB = STANDARD_DISK;
// Aug 2025(Andrey): The new minimum should be the standard.
// This parameter is also used in the frontend/purchases/license-editor.tsx
export const MIN_DISK_GB = DISK_DEFAULT_GB;

interface Values {
  min: number;
  dflt: number;
  max: number;
}

interface Limits {
  cpu: Values;
  ram: Values;
  disk: Values;
}

export const REGULAR: Limits = {
  cpu: {
    min: 1,
    dflt: DEFAULT_CPU,
    max: MAX_CPU,
  },
  ram: {
    min: 4,
    dflt: RAM_DEFAULT_GB,
    max: MAX_RAM_GB,
  },
  disk: {
    min: MIN_DISK_GB,
    dflt: DISK_DEFAULT_GB,
    max: MAX_DISK_GB,
  },
} as const;

export const BOOST: Limits = {
  cpu: { min: 0, dflt: 0, max: MAX_CPU - 1 },
  ram: { min: 0, dflt: 0, max: MAX_RAM_GB - 1 },
  disk: { min: 0, dflt: 0, max: MAX_DISK_GB - 1 * DISK_DEFAULT_GB },
} as const;

// on-prem: this dedicated VM machine name is only used for cocalc-onprem
// the project's resource quotas are encoded in the license spec, and not taken from the known VM specs
export const DEDICATED_VM_ONPREM_MACHINE = "onprem";
