import { Map, Set } from "immutable";

import { redux, Store } from "../app-framework";
import { AppliedCoupons, CoursePay} from "./types";

export interface BillingStoreState {
  stripe_publishable_key?: string;
  applied_coupons: AppliedCoupons;
  coupon_error?: string;
  error?: string;
  action?: string;
  no_stripe?: boolean;
  customer?: any;
  loaded?: boolean;
  invoices?: any;
  continue_first_purchase?: boolean;
  selected_plan?: string;
  course_pay: CoursePay;
}

class BillingStore extends Store<BillingStoreState> {}

export const store = redux.createStore("billing", BillingStore, {
  applied_coupons: Map<string, any>(),
  course_pay: Set<string>()
});
