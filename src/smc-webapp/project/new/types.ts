/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { TypedMap } from "../../app-framework";

export type AvailableFeatures = TypedMap<{
  sage: boolean;
  latex: boolean;
  x11: boolean;
  rmd: boolean;
  jupyter_notebook: boolean;
  jupyter_lab: boolean;
}>;
