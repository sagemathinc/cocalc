/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { init as init_mentions } from "./mentions/init";

export function init(redux) {
  init_mentions(redux);
}
