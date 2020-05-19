/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map, Set } from "immutable";

import { redux, Store } from "../app-framework";
import { AppliedCoupons, CoursePay, Customer, Invoices } from "./types";

export interface BillingStoreState {
  stripe_publishable_key?: string;
  applied_coupons: AppliedCoupons;
  coupon_error?: string;
  error?: string;
  action?: string;
  no_stripe?: boolean;
  customer?: Customer;
  invoices?: Invoices;
  loaded?: boolean;
  continue_first_purchase?: boolean;
  selected_plan?: string;
  course_pay: CoursePay;
}

export class BillingStore extends Store<BillingStoreState> {}

export const store = redux.createStore("billing", BillingStore, {
  applied_coupons: Map<string, any>(),
  course_pay: Set<string>(),
});
