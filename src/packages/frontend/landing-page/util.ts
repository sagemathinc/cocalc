/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Maybe should go in app-framework ... ?

import { redux } from "@cocalc/frontend/app-framework";

export function actions(name: string): any {
  const a = redux.getActions(name);
  if (a == null) {
    throw Error(`actions "${name}" not available`);
  }
  return a;
}
