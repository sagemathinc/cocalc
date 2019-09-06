import { reuseInFlight } from "async-await-utils/hof";
import { callback } from "awaiting";
import { callback2 } from "smc-util/async-utils";
import * as message from "smc-util/message";
import { available_upgrades, get_total_upgrades } from "smc-util/upgrades";

const { get_stripe } = require("./connect");
const { stripe_sales_tax } = require("./sales-tax");

interface HubClient {
  account_id: string;
  dbg: (f: string) => Function;
  database: any;
  push_to_client: Function;
  error_to_client: Function;
  assert_user_is_in_group: Function;
}

type StripeConnection = any;
type StripeCustomer = any;
type Message = any;
type Coupon = any;
type CouponHistory = any;

function get_string_field(mesg: Message, name: string): string {
  if (mesg == null) throw Error("invalid message; must not be null");
  const x = mesg[name];
  if (typeof x != "string") throw Error(`mesg[${name}] must be a string`);
  return x;
}

function get_nonnull_field(mesg: Message, name: string): any {
  if (mesg == null) throw Error("invalid message; must not be null");
  const x = mesg[name];
  if (x == null) throw Error(`mesg[${name}] must be defined`);
  return x;
}

export class StripeClient {
  private client: HubClient;
  private stripe: StripeConnection;
  private stripe_customer_id?: string;

  constructor(client: HubClient) {
    this.client = client;
    this.stripe = get_stripe();
    if (this.stripe == null) throw Error("stripe billing not configured");

    this.get_customer_id = reuseInFlight(this.get_customer_id.bind(this));
  }

  private dbg(f: string): Function {
    return this.client.dbg(`stripe.${f}`);
  }

  // Returns the stripe customer id for this account from our database,
  // or undefined if there is no known stripe customer id.
  // Throws an error if something goes wrong.
  // If called multiple times simultaneously, only does one DB query.
  private async get_customer_id(): Promise<string | undefined> {
    //  If no customer info yet with stripe, then NOT an error; instead,
    //  customer_id is undefined (but will check every time in this case).
    const dbg = this.dbg("get_customer_id");
    dbg();
    if (this.stripe_customer_id != null) {
      dbg("using cached this.stripe_customer_id");
      return this.stripe_customer_id;
    }
    const account_id = this.client.account_id;
    if (account_id == null) {
      throw Error("You must be signed in to use billing related functions.");
    }
    dbg("getting stripe_customer_id from database...");
    const stripe_customer_id = await callback2(
      this.client.database.get_stripe_customer_id,
      { account_id }
    );
    if (stripe_customer_id != null) {
      // cache it, since it won't change.
      this.stripe_customer_id = stripe_customer_id;
    }
    return stripe_customer_id;
  }

  // Raise an exception if user is not yet registered with stripe.
  private async need_customer_id(): Promise<string> {
    this.dbg("need_customer_id")();
    const customer_id = await this.get_customer_id();
    if (customer_id == null) {
      throw Error("stripe customer not defined");
    }
    return customer_id;
  }

  private async stripe_api_pager_options(mesg: Message): Promise<any> {
    return {
      customer: await this.need_customer_id(),
      limit: mesg.limit,
      ending_before: mesg.ending_before,
      starting_after: mesg.starting_after
    };
  }

  // We use this, since converting stripe api calls to use async/await
  // messes up the binding.
  private async call_stripe_api(
    objname: string,
    method: string,
    ...args
  ): Promise<any> {
    const obj = this.stripe[objname];
    if (obj == null) throw Error(`unknown stripe objname "${objname}"`);
    const f = obj[method];
    if (f == null) throw Error(`unknown stripe method "${objname}.${method}"`);
    return await callback(f.bind(obj), ...args);
  }

  private async get_customer(customer_id?: string): Promise<StripeCustomer> {
    const dbg = this.dbg("get_customer");
    if (customer_id == null) {
      dbg("getting customer id");
      customer_id = await this.need_customer_id();
    }
    dbg("now getting stripe customer object");
    return await this.call_stripe_api("customers", "retrieve", customer_id);
  }

  public async handle_mesg(mesg: Message): Promise<void> {
    try {
      if (mesg.event.slice(0, 7) != "stripe_") {
        throw Error("mesg event must start with stripe_");
      }
      const f = this[`mesg_${mesg.event.slice(7)}`];
      if (f == null) {
        throw Error(`no such message type ${mesg.event}`);
      } else {
        let resp: any = await f.bind(this)(mesg);
        if (resp == null) {
          resp = {};
        }
        resp.id = mesg.id;
        this.client.push_to_client(resp);
      }
    } catch (err) {
      let error: string;
      if (err.stack != null) {
        error = err.stack.split("\n")[0];
      } else {
        error = `${err}`;
      }
      this.dbg("handle_mesg")("Error", error, err.stack);
      this.client.error_to_client({ id: mesg.id, error });
    }
  }

  public async mesg_get_customer(_mesg: Message): Promise<Message> {
    const dbg = this.dbg("mesg_get_customer");
    dbg("get information from stripe: subscriptions, payment methods, etc.");
    const customer_id = await this.get_customer_id();
    let customer: undefined | StripeCustomer;
    if (customer_id != null) {
      customer = await this.get_customer(customer_id);
    }
    return message.stripe_customer({
      stripe_publishable_key: this.stripe.publishable_key,
      customer
    });
  }

  public async mesg_create_source(mesg: Message): Promise<void> {
    const dbg = this.dbg("mesg_create_source");
    dbg("create a payment method (credit card) in stripe for this user");
    const token = get_string_field(mesg, "token");
    dbg("looking up customer");
    const customer_id = await this.get_customer_id();
    if (customer_id == null) {
      await this.create_new_stripe_customer_from_card_token(token);
    } else {
      await this.add_card_to_existing_stripe_customer(token);
    }
  }

  private async create_new_stripe_customer_from_card_token(
    token: string
  ): Promise<void> {
    const dbg = this.dbg("create_new_stripe_customer_from_card_token");
    dbg("create new stripe customer from card token");

    dbg("get identifying info about user");
    const r = await callback2(this.client.database.get_account, {
      columns: ["email_address", "first_name", "last_name"],
      account_id: this.client.account_id
    });
    const email = r.email_address;
    const description = `${r.first_name} ${r.last_name}`;
    dbg(`they are ${description} with email ${email}`);

    dbg("creating stripe customer");
    const x = {
      source: token,
      description,
      name: description,
      email,
      metadata: {
        account_id: this.client.account_id
      }
    };

    const customer_id: string = (await this.call_stripe_api(
      "customers",
      "create",
      x
    )).id;

    dbg("success; now save customer_id to database");
    await callback2(this.client.database.set_stripe_customer_id, {
      account_id: this.client.account_id,
      customer_id
    });

    await this.update_database();
  }

  private async add_card_to_existing_stripe_customer(
    token: string
  ): Promise<void> {
    const dbg = this.dbg("add_card_to_existing_stripe_customer");
    dbg("add card to existing stripe customer");
    const customer_id = await this.need_customer_id();
    await this.call_stripe_api("customers", "createCard", customer_id, {
      card: token
    });

    await this.update_database();
  }

  public async mesg_delete_source(mesg: Message): Promise<void> {
    const dbg = this.dbg("mesg_delete_source");
    dbg("delete a payment method for this user");
    const card_id: string = get_string_field(mesg, "card_id");

    const customer_id = await this.get_customer_id();
    if (customer_id == null)
      throw Error("no customer information so can't delete source");

    await this.call_stripe_api("customers", "deleteCard", customer_id, card_id);
    await this.update_database();
  }

  public async mesg_set_default_source(mesg: Message): Promise<void> {
    const dbg = this.dbg("mesg_set_default_source");
    dbg("set a payment method for this user to be the default");
    const card_id: string = get_string_field(mesg, "card_id");
    const customer_id: string = await this.need_customer_id();
    dbg("now setting the default source in stripe");
    await this.call_stripe_api("customers", "update", customer_id, {
      default_source: card_id
    });
    await this.update_database();
  }

  private async update_database(): Promise<void> {
    this.dbg("update_database")();
    const customer_id = await this.get_customer_id();
    if (customer_id == null) return;
    await callback2(this.client.database.stripe_update_customer, {
      account_id: this.client.account_id,
      stripe: this.stripe,
      customer_id
    });
  }

  public async mesg_update_source(mesg: Message): Promise<void> {
    const dbg = this.dbg("mesg_update_source");
    dbg("modify a payment method");

    const card_id: string = get_string_field(mesg, "card_id");

    const info: any = get_nonnull_field(mesg, "info");
    if (info.metadata != null) throw Error("can't change card metadata");

    const customer_id = await this.get_customer_id();
    if (customer_id == null)
      throw Error("no customer information so can't update source");

    await this.call_stripe_api(
      "customers",
      "updateCard",
      customer_id,
      card_id,
      info
    );

    await this.update_database();
  }

  public async mesg_get_plans(_mesg: Message): Promise<Message> {
    const dbg = this.dbg("mesg_get_plans");
    dbg("get descriptions of plans that the user might subscribe to");
    const plans = await this.call_stripe_api("plans", "list");
    return message.stripe_plans({ plans });
  }

  public async mesg_create_subscription(mesg: Message): Promise<void> {
    const dbg = this.dbg("mesg_create_subscription");
    dbg("create a subscription for this user, using some billing method");

    const plan: string = get_string_field(mesg, "plan");

    const schema = require("smc-util/schema").PROJECT_UPGRADES.subscription[
      plan.split("-")[0]
    ];
    if (schema == null) throw Error(`unknown plan -- '${plan}'`);

    const customer_id: string = await this.need_customer_id();

    const quantity = mesg.quantity ? mesg.quantity : 1;

    const options: any = {
      plan,
      quantity,
      coupon: mesg.coupon_id
    };

    dbg("determine applicable tax");
    const tax_rate = await callback2(stripe_sales_tax, {
      customer_id
    });
    dbg(`tax_rate = ${tax_rate}`);
    if (tax_rate) {
      // CRITICAL: if we don't just multiply by 100, since then sometimes
      // stripe comes back with an error like this
      //    "Error: Invalid decimal: 8.799999999999999; must contain at maximum two decimal places."
      options.tax_percent = Math.round(tax_rate * 100 * 100) / 100;
    }

    dbg("add customer subscription to stripe");
    const subscription = await this.call_stripe_api(
      "customers",
      "createSubscription",
      customer_id,
      options
    );

    if (schema.cancel_at_period_end) {
      dbg("Setting subscription to cancel at period end");
      await this.call_stripe_api("subscriptions", "update", subscription.id, {
        cancel_at_period_end: true
      });
    }

    dbg("added subscription; now save info in our database about it...");
    await this.update_database();

    if (options.coupon != null) {
      dbg("add coupon to customer history");
      const { coupon, coupon_history } = await this.validate_coupon(
        options.coupon
      );

      // SECURITY NOTE: incrementing a counter... subject to attack?
      // I.e., use a coupon more times than should be able to?
      coupon_history[coupon.id] += 1;
      await callback2(this.client.database.update_coupon_history, {
        account_id: this.client.account_id,
        coupon_history
      });
    }
  }

  public async mesg_cancel_subscription(mesg: Message): Promise<void> {
    const dbg = this.dbg("mesg_cancel_subscription");
    dbg("cancel a subscription for this user");

    const subscription_id: string = get_string_field(mesg, "subscription_id");

    // TODO/SECURITY: We should check that this subscription actually
    // belongs to this user.  As it is, they could be cancelling somebody
    // else's subscription!

    dbg("cancel the subscription at stripe");
    // This also returns the subscription, which lets
    // us easily get the metadata of all projects associated to this subscription.
    await this.call_stripe_api("subscriptions", "update", subscription_id, {
      cancel_at_period_end: mesg.at_period_end
    });

    await this.update_database();
  }

  public async mesg_update_subscription(mesg: Message): Promise<void> {
    const dbg = this.dbg("mesg_update_subscription");
    dbg("edit a subscription for this user");

    const subscription_id: string = get_string_field(mesg, "subscription_id");
    const customer_id: string = await this.need_customer_id();
    dbg("Update the subscription.");
    const changes = {
      quantity: mesg.quantity,
      plan: mesg.plan,
      coupon: mesg.coupon_id
    };
    await this.call_stripe_api(
      "customers",
      "updateSubscription",
      customer_id,
      subscription_id,
      changes
    );
    await this.update_database();
    if (mesg.coupon_id != null) {
      const { coupon, coupon_history } = await this.validate_coupon(
        mesg.coupon_id
      );
      coupon_history[coupon.id] += 1;
      await callback2(this.client.database.update_coupon_history, {
        account_id: this.client.account_id,
        coupon_history
      });
    }
  }

  public async mesg_get_subscriptions(mesg: Message): Promise<Message> {
    const dbg = this.dbg("mesg_get_subscriptions");
    dbg("get a list of all the subscriptions that this customer has");

    const customer_id: string = await this.need_customer_id();

    const options = await this.stripe_api_pager_options(mesg);
    const subscriptions = await this.call_stripe_api(
      "customers",
      "listSubscriptions",
      customer_id,
      options
    );
    return message.stripe_subscriptions({ subscriptions });
  }

  public async mesg_get_coupon(mesg: Message): Promise<Message> {
    const dbg = this.dbg("mesg_get_coupon");
    dbg(`get the coupon with id=${mesg.coupon_id}`);

    const coupon_id: string = get_string_field(mesg, "coupon_id");

    const { coupon } = await this.validate_coupon(coupon_id);
    return message.stripe_coupon({ coupon });
  }

  // Checks these coupon criteria:
  // - Exists
  // - Is valid
  // - Used by this account less than the max per account (hard coded default is 1)
  private async validate_coupon(
    coupon_id: string
  ): Promise<{ coupon: Coupon; coupon_history: CouponHistory }> {
    const dbg = this.dbg("validate_coupon");
    dbg("retrieve the coupon");
    const coupon: Coupon = await this.call_stripe_api(
      "coupons",
      "retrieve",
      coupon_id
    );

    dbg("check account coupon_history");
    let coupon_history: CouponHistory = await callback2(
      this.client.database.get_coupon_history,
      {
        account_id: this.client.account_id
      }
    );
    if (!coupon.valid) throw Error("Sorry! This coupon has expired.");

    if (coupon_history == null) {
      coupon_history = {};
    }

    const times_used: number =
      coupon_history[coupon.id] != null ? coupon_history[coupon.id] : 0;

    if (
      times_used >=
      (coupon.metadata.max_per_account != null
        ? coupon.metadata.max_per_account
        : 1)
    ) {
      throw Error("You've already used this coupon.");
    }

    coupon_history[coupon.id] = times_used;
    return { coupon, coupon_history };
  }

  public async mesg_get_charges(mesg: Message): Promise<Message> {
    const dbg = this.dbg("mesg_get_charges");
    dbg("get a list of charges for this customer");

    const options = await this.stripe_api_pager_options(mesg);
    const charges = await this.call_stripe_api("charges", "list", options);
    return message.stripe_charges({ charges });
  }

  public async mesg_get_invoices(mesg: Message): Promise<Message> {
    const dbg = this.dbg("mesg_get_invoices");
    dbg("get a list of invoices for this customer");
    const options = await this.stripe_api_pager_options(mesg);
    const invoices = await this.call_stripe_api("invoices", "list", options);
    return message.stripe_invoices({ invoices });
  }

  // This is not actually used **YET**.
  public async mesg_admin_create_invoice_item(mesg: Message): Promise<void> {
    const dbg = this.dbg("mesg_admin_create_invoice_item");
    await callback(
      this.client.assert_user_is_in_group.bind(this.client),
      "admin"
    );

    dbg("check for existing stripe customer_id");
    const r = await callback2(this.client.database.get_account, {
      columns: [
        "stripe_customer_id",
        "email_address",
        "first_name",
        "last_name",
        "account_id"
      ],
      account_id: mesg.account_id,
      email_address: mesg.email_address
    });
    let customer_id = r.stripe_customer_id;
    const email = r.email_address;
    const description = `${r.first_name} ${r.last_name}`;
    mesg.account_id = r.account_id;
    if (customer_id != null) {
      dbg(
        "already signed up for stripe -- sync local user account with stripe"
      );
      await callback2(this.client.database.stripe_update_customer, {
        account_id: mesg.account_id,
        stripe: this.stripe,
        customer_id
      });
    } else {
      dbg("create stripe entry for this customer");
      const x = {
        description,
        email,
        metadata: {
          account_id: mesg.account_id
        }
      };
      const customer = await this.call_stripe_api("customers", "create", x);
      customer_id = customer.id;
      dbg("store customer id in our database");
      await callback2(this.client.database.set_stripe_customer_id, {
        account_id: mesg.account_id,
        customer_id
      });
    }
    if (!(mesg.amount != null && mesg.description != null)) {
      dbg("no amount or no description, so not creating an invoice");
      return;
    }

    dbg("now create the invoice item");
    await this.call_stripe_api("invoiceItems", "create", {
      customer: customer_id,
      amount: mesg.amount * 100,
      currency: "usd",
      description: mesg.description
    });
  }

  public async mesg_get_available_upgrades(_mesg: Message): Promise<Message> {
    const dbg = this.dbg("mesg_get_available_upgrades");

    dbg("get stripe customer data");
    const customer = await this.get_customer();
    if (customer == null && customer.subscriptions == null) {
      // no upgrades since not even a stripe account.
      return message.available_upgrades({
        total: {},
        excess: {},
        available: {}
      });
    }
    const stripe_data = customer.subscriptions.data;

    dbg("get user project upgrades");
    const projects = await callback2(
      this.client.database.get_user_project_upgrades,
      {
        account_id: this.client.account_id
      }
    );
    const { excess, available } = available_upgrades(stripe_data, projects);
    const total = get_total_upgrades(stripe_data);
    return message.available_upgrades({
      total,
      excess,
      available
    });
  }

  public async mesg_remove_all_upgrades(mesg: Message): Promise<void> {
    const dbg = this.dbg("mesg_remove_all_upgrades");
    dbg();
    if (this.client.account_id == null) throw Error("you must be signed in");
    await callback2(this.client.database.remove_all_user_project_upgrades, {
      account_id: this.client.account_id,
      projects: mesg.projects
    });
  }
}
