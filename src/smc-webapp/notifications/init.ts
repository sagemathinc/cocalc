/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { AppRedux } from "../app-framework";
import { init as init_mentions } from "./mentions";

export function init(redux: AppRedux) {
  init_mentions(redux);
}
