/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
We define a mapping from plans to the upgrades provided by a license.

NOTES:

- Since licenses do not play well with disk upgrades, we never provide
  disk space upgrades as part off this.
*/

import { Upgrades } from "./types";

interface Product {
  upgrades: Partial<Upgrades>;
  desc?: string;
}

const PRESETS: { [name: string]: Product } = {};

export function presets(): { [name: string]: Product } {
  return PRESETS;
}
