import { Map, Set } from "immutable";

import { redux, Store } from "../app-framework";

export interface BillingStoreState {
  stripe_publishable_key?: string;
  applied_coupons: Map<string, any>;
  coupon_error?: string;
  error?: string;
  action?: string;
  no_stripe?: boolean;
  customer?: any;
  loaded?: boolean;
  invoices?: any;
  continue_first_purchase?: boolean;
  selected_plan?: string;
  course_pay: Set<string>;
}

class BillingStore extends Store<BillingStoreState> {}

export const store = redux.createStore("billing", BillingStore, {
  applied_coupons: Map<string, any>(),
  course_pay: Set<string>()
});
