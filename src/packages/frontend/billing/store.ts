/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { List, Map, Set } from "immutable";

import { redux, Store, TypedMap } from "@cocalc/frontend/app-framework";
import { SiteLicense } from "@cocalc/util/types/site-licenses";
import { AppliedCoupons, CoursePay, CustomerMap, InvoicesMap } from "./types";

export interface BillingStoreState {
  stripe_publishable_key?: string;
  applied_coupons: AppliedCoupons;
  coupon_error?: string;
  error?: string;
  action?: string;
  no_stripe?: boolean;
  customer?: CustomerMap;
  invoices?: InvoicesMap;
  loaded?: boolean;
  continue_first_purchase?: boolean;
  selected_plan?: string;
  course_pay: CoursePay;
  managed_license_ids?: List<string>; // array of active (or recently expired) id's of license you manage. Not a changefeed -- you must explicitly call update_managed_licenses action.
  all_managed_license_ids?: List<string>; // same as managed_license_ids, but also includes all expired licenses.
  managed_licenses?: TypedMap<{ [id: string]: SiteLicense }>; // actual data of the licenses.
  subscription_list_state?: "view" | "buy_upgrades" | "buy_license";
  pay_as_you_go?: TypedMap<{
    showModal?: boolean;
    service?: string;
    cost?: number;
    reason?: string;
    allowed?: boolean;
  }>;
}

export class BillingStore extends Store<BillingStoreState> {}

export const store = redux.createStore("billing", BillingStore, {
  applied_coupons: Map<string, any>(),
  course_pay: Set<string>(),
});
