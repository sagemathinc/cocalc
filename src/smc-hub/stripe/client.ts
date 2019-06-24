import { reuseInFlight } from "async-await-utils/hof";
import { callback } from "awaiting";
import { callback2 } from "async-utils";

const { get_stripe } = require("./connect");

interface HubClient {
  public account_id: string;
  dbg: (f: string) => Function;
  database: any;
}

interface StripeConnection {}
interface StripeCustomer {}

type Message = any;

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

  constructor(client): void {
    this.client = client;
    this.stripe = get_stripe();
    if (this.stripe == null) throw Error("stripe billing not configured");

    this.get_customer_id = reuseInFlight(this.get_customer_id);
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

  private async get_customer(): Promise<StripeCustomer> {
    const dbg = this.dbg("get_customer");
    dbg("getting customer id");
    const customer_id: string = await this.get_customer_id();
    dbg("now getting stripe customer object");
    return await callback(this.stripe.customers.retrieve, customer_id);
  }

  public async handle_mesg(mesg: Message): Promise<void> {
    try {
      const f = this[`mesg_${mesg.event}`];
      if (f == null) {
        throw Error(`no such message type ${mesg.event}`);
      } else {
        let resp: any = await f(mesg);
        if (resp == null) {
          resp = {};
        }
        resp.id = mesg.id;
        this.client.push_to_client(resp);
      }
    } catch (err) {
      let e: string;
      if (err.stack != null) {
        e = err.stack.split("\n")[0];
      } else {
        e = `${err}`;
      }
      this.dbg("handle_mesg")("Error", e);
      this.client.error_to_client({ id: mesg.id, error: e });
    }
  }

  private async mesg_get_customer(mesg: Message): Promise<Message> {
    const dbg = this.dbg("mesg_get_customer");
    dbg("get information from stripe: subscriptions, payment methods, etc.");
    const customer = await this.get_customer();
    return message.stripe_customer({
      stripe_publishable_key: this.stripe.publishable_key,
      customer
    });
  }

  private mesg_create_source(mesg: Message): Promise<void> {
    const dbg = this.dbg("mesg_create_source");
    dbg("create a payment method (credit card) in stripe for this user");
    const token = get_string_field(mesg, "token");
    dbg("looking up customer");
    const customer_id = await this.stripe_get_customer_id();
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
    const r = await callback2(this.database.get_account, {
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
      email,
      metadata: {
        account_id: this.client.account_id
      }
    };

    const customer_id: string = (await callback(
      this.stripe.customers.create,
      x
    )).id;

    dbg("success; now save customer_id to database");
    await callback2(this.database.set_stripe_customer_id, {
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

    await callback(this.stripe.customers.createCard, customer_id, {
      card: token
    });

    await this.update_database();
  }

  private async mesg_delete_source(mesg: Message): Promise<void> {
    const dbg = this.dbg("mesg_delete_source");
    dbg("delete a payment method for this user");
    if (!this.ensure_fields(mesg, "card_id")) {
      dbg("missing card_id field");
      return;
    }
    const card_id: string = get_string_field(mesg, "card_id");

    const customer_id = await this.get_customer_id();
    if (customer_id == null)
      throw Error("no customer information so can't delete source");

    await callback(this.stripe.customers.deleteCard, customer_id, card_id);
    await this.update_database();
  }

  private async mesg_set_default_source(mesg: Message): Promise<void> {
    const dbg = this.dbg("mesg_set_default_source");
    dbg("set a payment method for this user to be the default");
    const card_id: string = get_string_field(mesg, "card_id");
    const customer_id = await this.get_customer_id();
    if (customer_id == null)
      throw Error("no customer information so can't set a default source");

    dbg("now setting the default source in stripe");
    await callback(this.stripe.customers.update, customer_id, {
      default_source: mesg.card_id
    });

    await this.update_database();
  }

  private async update_database(): Promise<void> {
    dbg("update_database")();
    const customer_id = await this.get_customer_id();
    if (customer_id == null) return;
    await callback2(this.database.stripe_update_customer, {
      account_id: this.client.account_id,
      stripe: this.stripe,
      customer_id
    });
  }

  private async mesg_update_source(mesg: Message): Promise<void> {
    const dbg = this.dbg("mesg_update_source");
    dbg("modify a payment method");

    const card_id: string = get_string_field(mesg, "card_id");

    const info: any = get_nonnull_field(mesg, "info");
    if (info.metadata != null) throw Error("can't change card metadata");

    const customer_id = await this.get_customer_id();
    if (customer_id == null)
      throw Error("no customer information so can't update source");

    await callback(
      this.stripe.customers.updateCard,
      customer_id,
      card_id,
      info
    );

    await this.update_database();
  }

  private async mesg_get_plans(mesg: Message): Promise<Message> {
    const dbg = this.dbg("mesg_get_plans");
    dbg("get descriptions of plans that the user might subscribe to");
    const plans = await callback(this.stripe.plans.list);
    return message.stripe_plans({ plans });
  }

  private async mesg_create_subscription(mesg: Message): Promise<void> {
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
    const tax_rate = await callback2(
      require("./stripe/sales-tax").stripe_sales_tax,
      {
        customer_id
      }
    );
    dbg(`tax_rate = ${tax_rate}`);
    if (tax_rate) {
      // CRITICAL: if we don't just multiply by 100, since then sometimes
      // stripe comes back with an error like this
      //    "Error: Invalid decimal: 8.799999999999999; must contain at maximum two decimal places."
      options.tax_percent = Math.round(tax_rate * 100 * 100) / 100;
    }

    dbg("add customer subscription to stripe");
    const subscription = await callback(
      this.stripe.customers.createSubscription,
      customer_id,
      options
    );

    if (schema.cancel_at_period_end) {
      dbg("Setting subscription to cancel at period end");
      await callback(this.stripe.subscriptions.update, subscription.id, {
        cancel_at_period_end: true
      });
    }

    dbg("added subscription; now save info in our database about it...");
    await this.update_database();

    if (options.coupon != null) {
      dbg("add coupon to customer history");
      const { coupon, coupon_history } = await callback(
        this.validate_coupon,
        options.coupon
      );

      // SECURITY NOTE: incrementing a counter... subject to attack?
      // I.e., use a coupon more times than should be able to?
      coupon_history[coupon.id] += 1;
      await callback2(this.database.update_coupon_history, {
        account_id: this.account_id,
        coupon_history
      });
    }
  }

  private async mesg_cancel_subscription(mesg: Message): Promise<void> {
    const dbg = this.dbg("mesg_cancel_subscription");
    dbg("cancel a subscription for this user");

    const subscription_id: string = get_string_field(mesg, "subscription_id");

    const customer_id: string = await this.need_customer_id();

    dbg("cancel the subscription at stripe");
    // This also returns the subscription, which lets
    // us easily get the metadata of all projects associated to this subscription.
    await callback(this.stripe.subscriptions.update, subscription_id, {
      cancel_at_period_end: mesg.at_period_end
    });

    await this.update_database();
  }

  private async mesg_update_subscription(mesg: Message): Promise<void> {
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
    await callback(
      this.stripe.customers.updateSubscription,
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
      await callback2(this.database.update_coupon_history, {
        account_id: this.account_id,
        coupon_history
      });
    }
  }

  private async mesg_get_subscriptions(mesg: Message): Promise<Message> {
    const dbg = this.dbg("mesg_get_subscriptions");
    dbg("get a list of all the subscriptions that this customer has");

    const customer_id: string = await this.need_customer_id();

    const options = {
      limit: mesg.limit,
      ending_before: mesg.ending_before,
      starting_after: mesg.starting_after
    };
    const subscriptions = await callback(
      this.stripe.customers.listSubscriptions,
      customer_id,
      options
    );
    return message.stripe_subscriptions({ subscriptions });
  }

  private async mesg_get_coupon(mesg: Message): Message {
    const dbg = this.dbg("mesg_get_coupon");
    dbg(`get the coupon with id=${mesg.coupon_id}`);

    const coupon_id: string = get_string_field(mesg, "coupon_id");

    const coupon = await callback(this.validate_coupon, mesg.coupon_id);
    return message.stripe_coupon({ coupon });
  }

  // Checks these coupon criteria:
  // - Exists
  // - Is valid
  // - Used by this account less than the max per account (hard coded default is 1)
  // Calls cb(err, coupon, coupon_history)
  validate_coupon(coupon_id, cb) {
    const dbg = this.dbg("validate_coupon");
    this.stripe = get_stripe();
    return async.series(
      [
        local_cb => {
          dbg("retrieve the coupon");
          return this.stripe.coupons.retrieve(coupon_id, local_cb);
        },
        local_cb => {
          dbg("check account coupon_history");
          return this.database.get_coupon_history({
            account_id: this.account_id,
            cb: local_cb
          });
        }
      ],
      (err, [coupon, coupon_history]) => {
        if (err) {
          cb(err);
          return;
        }
        if (!coupon.valid) {
          cb("Sorry! This coupon has expired.");
          return;
        }
        if (coupon_history == null) {
          coupon_history = {};
        }
        const times_used =
          coupon_history[coupon.id] != null ? coupon_history[coupon.id] : 0;
        if (
          times_used >=
          (coupon.metadata.max_per_account != null
            ? coupon.metadata.max_per_account
            : 1)
        ) {
          cb("You've already used this coupon.");
          return;
        }

        coupon_history[coupon.id] = times_used;
        return cb(err, coupon, coupon_history);
      }
    );
  }

  mesg_get_charges(mesg) {
    const dbg = this.dbg("mesg_get_charges");
    dbg("get a list of charges for this customer.");
    return this.stripe_need_customer_id(mesg.id, (err, customer_id) => {
      if (err) {
        return;
      }
      const options = {
        customer: customer_id,
        limit: mesg.limit,
        ending_before: mesg.ending_before,
        starting_after: mesg.starting_after
      };
      return this.stripe.charges.list(options, (err, charges) => {
        if (err) {
          return this.stripe_error_to_client({ id: mesg.id, error: err });
        } else {
          return this.push_to_client(
            message.stripe_charges({ id: mesg.id, charges })
          );
        }
      });
    });
  }

  mesg_get_invoices(mesg) {
    const dbg = this.dbg("mesg_get_invoices");
    dbg("get a list of invoices for this customer.");
    return this.stripe_need_customer_id(mesg.id, (err, customer_id) => {
      if (err) {
        return;
      }
      const options = {
        customer: customer_id,
        limit: mesg.limit,
        ending_before: mesg.ending_before,
        starting_after: mesg.starting_after
      };
      return this.stripe.invoices.list(options, (err, invoices) => {
        if (err) {
          return this.stripe_error_to_client({ id: mesg.id, error: err });
        } else {
          return this.push_to_client(
            message.stripe_invoices({ id: mesg.id, invoices })
          );
        }
      });
    });
  }

  mesg_admin_create_invoice_item(mesg) {
    const dbg = this.dbg("mesg_admin_create_invoice_item");
    this.stripe = get_stripe();
    if (this.stripe == null) {
      const err = "stripe billing not configured";
      dbg(err);
      this.error_to_client({ id, error: err });
      return;
    }
    let customer_id = undefined;
    let description = undefined;
    let email = undefined;
    let new_customer = true;
    return async.series(
      [
        cb => {
          return this.assert_user_is_in_group("admin", cb);
        },
        cb => {
          dbg("check for existing stripe customer_id");
          return this.database.get_account({
            columns: [
              "stripe_customer_id",
              "email_address",
              "first_name",
              "last_name",
              "account_id"
            ],
            account_id: mesg.account_id,
            email_address: mesg.email_address,
            cb: (err, r) => {
              if (err) {
                return cb(err);
              } else {
                customer_id = r.stripe_customer_id;
                email = r.email_address;
                description = `${r.first_name} ${r.last_name}`;
                mesg.account_id = r.account_id;
                return cb();
              }
            }
          });
        },
        cb => {
          if (customer_id != null) {
            new_customer = false;
            dbg(
              "already signed up for stripe -- sync local user account with stripe"
            );
            return this.database.stripe_update_customer({
              account_id: mesg.account_id,
              stripe: get_stripe(),
              customer_id,
              cb
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
            return this.stripe.customers.create(x, (err, customer) => {
              if (err) {
                return cb(err);
              } else {
                customer_id = customer.id;
                return cb();
              }
            });
          }
        },
        cb => {
          if (!new_customer) {
            return cb();
          } else {
            dbg("store customer id in our database");
            return this.database.set_stripe_customer_id({
              account_id: mesg.account_id,
              customer_id,
              cb
            });
          }
        },
        cb => {
          if (!(mesg.amount != null && mesg.description != null)) {
            dbg("no amount or description -- not creating an invoice");
            return cb();
          } else {
            dbg("now create the invoice item");
            return this.stripe.invoiceItems.create(
              {
                customer: customer_id,
                amount: mesg.amount * 100,
                currency: "usd",
                description: mesg.description
              },
              (err, invoice_item) => {
                if (err) {
                  return cb(err);
                } else {
                  return cb();
                }
              }
            );
          }
        }
      ],
      err => {
        if (err) {
          return this.error_to_client({ id: mesg.id, error: err });
        } else {
          return this.success_to_client({ id: mesg.id });
        }
      }
    );
  }

  mesg_api_key(mesg) {
    return api_key_action({
      database: this.database,
      account_id: this.account_id,
      password: mesg.password,
      action: mesg.action,
      cb: (err, api_key) => {
        if (err) {
          return this.error_to_client({ id: mesg.id, error: err });
        } else {
          if (api_key != null) {
            return this.push_to_client(
              message.api_key_info({ id: mesg.id, api_key })
            );
          } else {
            return this.success_to_client({ id: mesg.id });
          }
        }
      }
    });
  }

  mesg_user_auth(mesg) {
    return auth_token.get_user_auth_token({
      database: this.database,
      account_id: this.account_id, // strictly not necessary yet... but good if user has to be signed in,
      // since more secure and we can rate limit attempts from a given user.
      user_account_id: mesg.account_id,
      password: mesg.password,
      cb: (err, auth_token) => {
        if (err) {
          return this.error_to_client({ id: mesg.id, error: err });
        } else {
          return this.push_to_client(
            message.user_auth_token({ id: mesg.id, auth_token })
          );
        }
      }
    });
  }

  mesg_revoke_auth_token(mesg) {
    return auth_token.revoke_user_auth_token({
      database: this.database,
      auth_token: mesg.auth_token,
      cb: err => {
        if (err) {
          return this.error_to_client({ id: mesg.id, error: err });
        } else {
          return this.push_to_client(message.success({ id: mesg.id }));
        }
      }
    });
  }

  // Receive and store in memory the latest metrics status from the client.
  mesg_metrics(mesg) {
    const dbg = this.dbg("mesg_metrics");
    dbg();
    if (!(mesg != null ? mesg.metrics : undefined)) {
      return;
    }
    const { metrics } = mesg;
    //dbg('GOT: ', misc.to_json(metrics))
    if (!misc.is_array(metrics)) {
      // client is messing with us...?
      return;
    }
    for (let metric of metrics) {
      if (!misc.is_array(metric != null ? metric.values : undefined)) {
        // what?
        return;
      }
      if (metric.values.length === 0) {
        return;
      }
      for (let v of metric.values) {
        if (!misc.is_object(v != null ? v.labels : undefined)) {
          // what?
          return;
        }
      }
      switch (metric.type) {
        case "gauge":
          metric.aggregator = "average";
          break;
        default:
          metric.aggregator = "sum";
      }
    }

    return (client_metrics[this.id] = metrics);
  }
  //dbg('RECORDED: ', misc.to_json(client_metrics[@id]))

  mesg_get_available_upgrades(mesg) {
    const dbg = this.dbg("mesg_get_available_upgrades");
    const locals = {};
    return async.series(
      [
        cb => {
          dbg("get stripe customer data");
          return this.stripe_get_customer(mesg.id, (err, stripe_customer) => {
            locals.stripe_data = __guard__(
              stripe_customer != null
                ? stripe_customer.subscriptions
                : undefined,
              x => x.data
            );
            return cb(err);
          });
        },
        cb => {
          dbg("get user project upgrades");
          return this.database.get_user_project_upgrades({
            account_id: this.account_id,
            cb: (err, projects) => {
              locals.projects = projects;
              return cb(err);
            }
          });
        }
      ],
      err => {
        if (err) {
          return this.error_to_client({ id: mesg.id, error: err });
        } else {
          locals.x = compute_upgrades.available_upgrades(
            locals.stripe_data,
            locals.projects
          );
          locals.resp = message.available_upgrades({
            id: mesg.id,
            total: compute_upgrades.get_total_upgrades(locals.stripe_data),
            excess: locals.x.excess,
            available: locals.x.available
          });
          return this.push_to_client(locals.resp);
        }
      }
    );
  }

  mesg_remove_all_upgrades(mesg) {
    const dbg = this.dbg("mesg_remove_all_upgrades");
    if (this.account_id == null) {
      this.error_to_client({ id: mesg.id, error: "you must be signed in" });
      return;
    }
    return this.database.remove_all_user_project_upgrades({
      account_id: this.account_id,
      projects: mesg.projects,
      cb: err => {
        if (err) {
          return this.error_to_client({ id: mesg.id, error: err });
        } else {
          return this.push_to_client(message.success({ id: mesg.id }));
        }
      }
    });
  }
}
