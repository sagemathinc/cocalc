/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// base unit in pixel for margin/size/padding
export const UNIT = 15;

// injected by webpack, but not for react-static renderings
// (ATTN don't assign to uppercase vars!)
export let smc_version, build_date, smc_git_rev;
try {
  smc_version = (window as any)?.SMC_VERSION ?? "N/A";
  build_date = (window as any)?.BUILD_DATE ?? "N/A";
  smc_git_rev = (window as any)?.SMC_GIT_REV ?? "N/A";
} catch (_err) {
  // Happens if window is not defined (e.g., running on backend).
  smc_version = "N/A";
  build_date = "N/A";
  smc_git_rev = "N/A";
}
