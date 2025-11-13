/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Store, redux } from "@cocalc/frontend/app-framework";
import { SiteLicensesState } from "./types";

export class SiteLicensesStore extends Store<SiteLicensesState> {}

export const store = redux.createStore(
  "admin-site-licenses",
  SiteLicensesStore,
  {}
);
