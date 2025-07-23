/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// COMPLETEY DEPRECATED -- DELETE THIS ?

/*
Billing actions.

These are mainly for interfacing with Stripe.  They are
all async (no callbacks!).

**PRETTY MUCH DEPRECATED**
*/

import { fromJS, Map } from "immutable";
import { redux, Actions, Store } from "../app-framework";
import { reuse_in_flight_methods } from "@cocalc/util/async-utils";
import { server_days_ago } from "@cocalc/util/misc";
import { getManagedLicenses } from "../account/licenses/util";

import { BillingStoreState } from "./store";

require("./store"); // ensure 'billing' store is created so can set this.store below.

export class BillingActions extends Actions<BillingStoreState> {
  private store: Store<BillingStoreState>;

  constructor(name: string, redux: any) {
    super(name, redux);
    const store = redux.getStore("billing");
    if (store == null) throw Error("bug -- billing store should be defined");
    this.store = store;
    reuse_in_flight_methods(this, ["update_customer"]);
  }

  public clear_error(): void {
    this.setState({ error: "" });
  }

  public async update_customer(): Promise<void> {
    return;
  }

  public clear_action(): void {
    this.setState({ action: "", error: "" });
  }

  public clear_coupon_error(): void {
    this.setState({ coupon_error: "" });
  }

  public remove_all_coupons(): void {
    this.setState({ applied_coupons: Map<string, any>(), coupon_error: "" });
  }

  public remove_coupon(coupon_id: string): void {
    this.setState({
      applied_coupons: this.store
        .get("applied_coupons", Map<string, any>())
        .delete(coupon_id),
    });
  }

  // Set this while we are paying for the course.
  public set_is_paying_for_course(
    project_id: string,
    is_paying: boolean,
  ): void {
    let course_pay = this.store.get("course_pay");
    let continue_first_purchase = this.store.get("continue_first_purchase");
    if (is_paying) {
      course_pay = course_pay.add(project_id);
    } else {
      course_pay = course_pay.remove(project_id);
      continue_first_purchase = false;
    }
    this.setState({ course_pay, continue_first_purchase });
  }

  public set_selected_plan(plan: string, period?: string): void {
    if (period != null) {
      if (period.slice(0, 4) == "year") {
        plan += "-year";
      } else if (period.slice(0, 4) == "week") {
        plan += "-week";
      }
    }
    this.setState({ selected_plan: plan });
  }

  public async update_managed_licenses(): Promise<void> {
    // Update the license state in the frontend
    const v = await getManagedLicenses();
    const all_managed_license_ids = fromJS(v.map((x) => x.id)) as any;

    const day_ago = server_days_ago(1);
    const managed_license_ids = fromJS(
      v
        .filter((x) => x.expires == null || x.expires >= day_ago)
        .map((x) => x.id),
    ) as any;

    const x: { [license_id: string]: object } = {};
    for (const license of v) {
      x[license.id] = license;
    }
    const managed_licenses = fromJS(x) as any;
    this.setState({
      managed_licenses,
      managed_license_ids,
      all_managed_license_ids,
    });
  }
}

export const actions = redux.createActions("billing", BillingActions);
