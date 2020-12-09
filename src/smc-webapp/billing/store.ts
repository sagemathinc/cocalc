/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { List, Map, Set } from "immutable";

import { redux, Store, TypedMap } from "../app-framework";
import { AppliedCoupons, CoursePay, Customer, Invoices } from "./types";
import { SiteLicense } from "smc-util/db-schema/site-licenses";

export interface BillingStoreState {
  stripe_publishable_key?: string;
  applied_coupons: AppliedCoupons;
  coupon_error?: string;
  error?: string;
  action?: string;
  no_stripe?: boolean;
  customer?: TypedMap<Customer>;
  invoices?: TypedMap<Invoices>;
  loaded?: boolean;
  continue_first_purchase?: boolean;
  selected_plan?: string;
  course_pay: CoursePay;
  managed_license_ids?: List<string[]>; // array of active (or recently expired) id's of license you manage. Not a changefeed -- you must explicitly call update_managed_licenses action.
  all_managed_license_ids?: List<string[]>; // same as managed_license_ids, but also includes all expired licenses.
  managed_licenses?: Map<string, TypedMap<SiteLicense>>; // actual data of the licenses.
  subscription_list_state?: "view" | "buy_upgrades" | "buy_license";
}

export class BillingStore extends Store<BillingStoreState> {}

export const store = redux.createStore("billing", BillingStore, {
  applied_coupons: Map<string, any>(),
  course_pay: Set<string>(),
});
