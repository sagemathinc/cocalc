/*
stripe payments api via backend hub
*/

import { callback2 } from "smc-util/async-utils";
import * as message from "smc-util/message";

export class StripeClient {
  private call_api: Function;

  constructor(call_api) {
    this.call_api = call_api;
  }

  private async call(mesg): Promise<any> {
    return await callback2(this.call_api, {
      message: mesg,
      error_event: true,
      timeout: 15,
    });
  }

  // gets custormer info (if any) and stripe public api key
  // for this user, if they are logged in
  public async get_customer(): Promise<any> {
    const mesg = await this.call(message.stripe_get_customer());
    if (mesg == null) {
      // evidently this happened -- see
      //   https://github.com/sagemathinc/cocalc/issues/3711
      throw Error("mesg must be defined");
    } else {
      return {
        stripe_publishable_key: mesg.stripe_publishable_key,
        customer: mesg.customer,
      };
    }
  }

  public async create_source(token: string): Promise<any> {
    return await this.call(message.stripe_create_source({ token }));
  }

  public async delete_source(card_id: string): Promise<any> {
    return await this.call(message.stripe_delete_source({ card_id }));
  }

  public async update_source(card_id: string, info: any): Promise<any> {
    return await this.call(message.stripe_update_source({ card_id, info }));
  }

  public async set_default_source(card_id: string): Promise<any> {
    return await this.call(message.stripe_set_default_source({ card_id }));
  }

  // gets list of past stripe charges for this account.
  public async get_charges(opts: {
    limit?: number; // between 1 and 100 (default: 10)
    ending_before?: any;
    starting_after?: any;
  }): Promise<any> {
    return (
      await this.call(
        message.stripe_get_charges({
          limit: opts.limit,
          ending_before: opts.ending_before,
          starting_after: opts.starting_after,
        })
      )
    ).charges;
  }

  // gets stripe plans that could be subscribed to.
  public async get_plans(): Promise<any> {
    return (await this.call(message.stripe_get_plans())).plans;
  }

  public async create_subscription(opts: {
    plan: string;
    quantity?: number;
    coupon_id?: string;
  }): Promise<any> {
    if (opts.quantity == null) {
      opts.quantity = 1;
    }
    return await this.call(message.stripe_create_subscription(opts));
  }

  public async cancel_subscription(opts: {
    subscription_id: string;
    at_period_end?: boolean; // default is *true*
  }) {
    if (opts.at_period_end == null) {
      opts.at_period_end = true;
    }
    return await this.call(message.stripe_cancel_subscription(opts));
  }

  public async update_subscription(opts: {
    subscription_id: string;
    quantity?: number; // if given, must be >= number of projects
    coupon_id?: string;
    projects?: string[]; // ids of projects that subscription applies to (TOD: what?)
    plan?: string;
  }) {
    return await this.call(message.stripe_update_subscription(opts));
  }

  // gets list of past stripe charges for this account.
  public async get_subscriptions(opts: {
    limit?: number; // between 1 and 100 (default: 10)
    ending_before?: any; // see https://stripe.com/docs/api/node#list_subscriptions
    starting_after?: any;
  }) {
    return (await this.call(message.stripe_get_subscriptions(opts)))
      .subscriptions;
  }

  // Gets the coupon for this account. Returns an error if invalid
  // https://stripe.com/docs/api#retrieve_coupon
  public async get_coupon(coupon_id: string) {
    return (await this.call(message.stripe_get_coupon({ coupon_id }))).coupon;
  }

  // gets list of invoices for this account.
  public async get_invoices(opts: {
    limit?: number; // between 1 and 100 (default: 10)
    ending_before?: any; // see https://stripe.com/docs/api/node#list_charges
    starting_after?: any;
  }) {
    return (
      await this.call(
        message.stripe_get_invoices({
          limit: opts.limit,
          ending_before: opts.ending_before,
          starting_after: opts.starting_after,
        })
      )
    ).invoices;
  }

  public async admin_create_invoice_item(
    opts:
      | {
          account_id: string;
          email_address?: string;
          amount?: number; // in US dollars -- if amount/description *not* given, then merely ensures user has stripe account and updats info about them
          description?: string;
        }
      | {
          account_id?: string;
          email_address: string;
          amount?: number;
          description?: string;
        }
  ) {
    return await this.call(message.stripe_admin_create_invoice_item(opts));
  }

  // Make it so the SMC user with the given email address has a corresponding stripe
  // identity, even if they have never entered a credit card.  May only be used by
  // admin users.
  public async admin_create_customer(
    opts:
      | { account_id: string; email_address?: string }
      | { account_id?: string; email_address: string }
  ) {
    return await this.admin_create_invoice_item(opts);
  }
}
