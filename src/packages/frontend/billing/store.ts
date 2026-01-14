/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Map, Set } from "immutable";

import { redux, Store, TypedMap } from "@cocalc/frontend/app-framework";
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
