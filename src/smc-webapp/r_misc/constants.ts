/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// base unit in pixel for margin/size/padding
export const UNIT = 15;

// injected by webpack, but not for react-static renderings
declare var SMC_VERSION, BUILD_DATE, COCALC_GIT_REVISION;
export let smc_version, build_date, smc_git_rev;
try {
  smc_version = SMC_VERSION ?? "N/A";
  build_date = BUILD_DATE ?? "N/A";
  smc_git_rev = COCALC_GIT_REVISION ?? "N/A";
} catch (_err) {
  // Happens potentially when running on backend.
  smc_version = "N/A";
  build_date = "N/A";
  smc_git_rev = "N/A";
}
