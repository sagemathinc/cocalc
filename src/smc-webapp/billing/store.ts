import { Map, Set } from "immutable";

import { redux, Store } from "../app-framework";
import { AppliedCoupons, CoursePay } from "./types";

export interface BillingStoreState {
  stripe_publishable_key?: string;
  applied_coupons: AppliedCoupons;
  coupon_error?: string;
  error?: string;
  action?: string;
  no_stripe?: boolean;
  customer?: any;   // I tried and failed to declare these... It's Customer in types, but as immutable, so what do I do?
  invoices?: any;
  loaded?: boolean;
  continue_first_purchase?: boolean;
  selected_plan?: string;
  course_pay: CoursePay;
}

class BillingStore extends Store<BillingStoreState> {}

export const store = redux.createStore("billing", BillingStore, {
  applied_coupons: Map<string, any>(),
  course_pay: Set<string>()
});
