/*
Billing actions.

These are mainly for interfacing with Stripe.  They are
all async (no callbacks!).
*/

import { Map } from "immutable";
import { redux, Actions, Store } from "../app-framework";
import { callback2, reuse_in_flight_methods } from "smc-util/async-utils";
import { server_minutes_ago, server_time } from "smc-util/misc";
const { webapp_client } = require("../webapp_client");

type StripeAction =
  | "delete_source"
  | "set_default_source"
  | "create_source"
  | "cancel_subscription"
  | "create_subscription"
  | "get_coupon";

import { BillingStoreState } from "./store";

require("./store"); // ensure 'billing' store is created so can set this.store below.

class BillingActions extends Actions<BillingStoreState> {
  private store: Store<BillingStoreState>;
  private last_subscription_attempt?: any;

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
    this.setState({ action: "Updating billing information" });
    try {
      const resp = await callback2(webapp_client.stripe_get_customer);
      if (resp == null || !resp.stripe_publishable_key) {
        this.setState({ no_stripe: true });
        throw Error(
          "WARNING: Stripe is not configured -- billing not available"
        );
      }
      this.setState({
        customer: resp.customer,
        loaded: true,
        stripe_publishable_key: resp.stripe_publishable_key,
      });
      if (resp.customer) {
        // only call get_invoices if the customer already exists in the system!
        // FUTURE: -- this {limit:100} will change when we use webhooks and our own database of info...
        const invoices = await callback2(webapp_client.stripe_get_invoices, {
          limit: 100,
        });
        this.setState({ invoices });
      }
    } catch (err) {
      this.setState({ error: err });
      throw err;
    } finally {
      this.setState({ action: "" });
    }
  }

  // Call a webapp_client.stripe_[action] function with given opts, returning
  // the result (which matters only for coupons?).
  // This is wrapped as an async call, and also sets the action and error
  // states of the Store so the UI can reflect what is happening.
  // Also, update_customer gets called, to update the UI.
  // If there is an error, this also throws that error (so it is NOT just
  // reflected in the UI).
  private async stripe_action(
    action: StripeAction,
    desc: string,
    opts: object
  ): Promise<any> {
    this.setState({ action: desc });
    const f: Function | undefined = webapp_client[`stripe_${action}`];
    if (f == null) {
      throw Error(`no such stripe action "${action}"`);
    }
    try {
      return await callback2(f, opts);
    } catch (err) {
      this.setState({ error: `${err}` });
      throw err;
    } finally {
      this.setState({ action: "" });
      await this.update_customer();
    }
  }

  public clear_action(): void {
    this.setState({ action: "", error: "" });
  }

  public async delete_payment_method(card_id: string): Promise<void> {
    await this.stripe_action("delete_source", "Deleting a payment method", {
      card_id,
    });
  }

  public async set_as_default_payment_method(card_id: string): Promise<void> {
    await this.stripe_action(
      "set_default_source",
      "Setting payment method as default",
      { card_id }
    );
  }

  public async submit_payment_method(token: string): Promise<void> {
    await this.stripe_action(
      "create_source",
      "Creating a new payment method (sending token)",
      { token }
    );
  }

  public async cancel_subscription(subscription_id: string): Promise<void> {
    await this.stripe_action("cancel_subscription", "Cancel a subscription", {
      subscription_id,
    });
  }

  public async create_subscription(plan: string): Promise<void> {
    const lsa = this.last_subscription_attempt;
    if (
      lsa != null &&
      lsa.plan == plan &&
      lsa.timestamp > server_minutes_ago(2)
    ) {
      this.setState({
        action: "",
        error:
          "Too many subscription attempts in the last minute.  Please **REFRESH YOUR BROWSER** THEN DOUBLE CHECK YOUR SUBSCRIPTION LIST.",
      });
      return;
    }
    let coupon: any;
    this.setState({ error: "" });
    // TODO: Support multiple coupons.
    const applied_coupons = this.store.get("applied_coupons");
    if (applied_coupons != null && applied_coupons.size > 0) {
      coupon = applied_coupons.first();
    }
    const opts = {
      plan,
      coupon_id: coupon != null ? coupon.id : undefined,
    };
    await this.stripe_action(
      "create_subscription",
      "Create a subscription",
      opts
    );
    this.last_subscription_attempt = { timestamp: server_time(), plan };
  }

  public async apply_coupon(coupon_id: string): Promise<any> {
    try {
      const coupon = await this.stripe_action(
        "get_coupon",
        `Applying coupon: ${coupon_id}`,
        { coupon_id }
      );
      const applied_coupons = this.store
        .get("applied_coupons", Map<string, any>())
        .set(coupon.id, coupon);
      if (applied_coupons == null) throw Error("BUG -- can't happen");
      this.setState({ applied_coupons, coupon_error: "" });
    } catch (err) {
      return this.setState({ coupon_error: `${err}` });
    }
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

  // Cancel all subscriptions, remove credit cards, etc. -- this is not a normal action,
  // and is used only when deleting an account.
  public async cancel_everything(): Promise<void> {
    // update info about this customer
    await this.update_customer();
    // delete stuff
    // delete payment methods
    const payment_methods = this.store.getIn(["customer", "sources", "data"]);
    if (payment_methods != null) {
      for (const x of payment_methods.toJS()) {
        await this.delete_payment_method(x.id);
      }
    }
    const subscriptions = this.store.getIn([
      "customer",
      "subscriptions",
      "data",
    ]);
    if (subscriptions != null) {
      for (const x of subscriptions.toJS()) {
        await this.cancel_subscription(x.id);
      }
    }
  }

  // Set this while we are paying for the course.
  public set_is_paying_for_course(
    project_id: string,
    is_paying: boolean
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
}

export const actions = redux.createActions("billing", BillingActions);
