// Ensure the billing Actions and Store are created:
require("./actions");

import {
  Component,
  Rendered,
  React,
  redux,
  rtypes,
  rclass
} from "../app-framework";
import { AppliedCoupons, Customer, Invoices } from "./types";
import { Map } from "immutable";
import { ErrorDisplay } from "../r_misc/error-display";
import { Loading, Space, Icon, A, ActivityDisplay, Footer } from "../r_misc";
const { HelpEmailLink, PolicyPricingPageUrl } = require("../customize");
import { SubscriptionList } from "./subscription-list";
import { PaymentMethods } from "./payment-methods";
import { AddSubscription } from "./add-subscription";
const { Panel } = require("react-bootstrap");
import { InvoiceHistory } from "./invoice-history";

interface ReactProps {
  is_simplified?: boolean;
  for_course?: boolean;
}

interface ReduxProps {
  customer?: Customer;
  invoices?: Invoices;
  error?: string | Error;
  action?: string;
  loaded?: boolean;
  no_stripe?: boolean; // if true, stripe definitely isn't configured on the server
  selected_plan: string;
  applied_coupons: AppliedCoupons;
  coupon_error?: string;
  continue_first_purchase?: boolean;
  project_map: Map<string, any>; // used, e.g., for course project payments; also computing available upgrades
  stripe_customer: Map<string, any>; // to get total upgrades user has available
}

export const BillingPage = rclass<ReactProps>(
  class BillingPage extends Component<ReactProps & ReduxProps> {
    static reduxProps() {
      return {
        billing: {
          customer: rtypes.object,
          invoices: rtypes.object,
          error: rtypes.oneOfType([rtypes.string, rtypes.object]),
          action: rtypes.string,
          loaded: rtypes.bool,
          no_stripe: rtypes.bool, // if true, stripe definitely isn't configured on the server
          selected_plan: rtypes.string,
          applied_coupons: rtypes.immutable.Map,
          coupon_error: rtypes.string,
          continue_first_purchase: rtypes.bool
        },
        projects: {
          project_map: rtypes.immutable // used, e.g., for course project payments; also computing available upgrades
        },
        account: {
          stripe_customer: rtypes.immutable // to get total upgrades user has available
        }
      };
    }

    private render_action(): Rendered {
      if (this.props.action) {
        return (
          <ActivityDisplay
            style={{ position: "fixed", right: "45px", top: "85px" }}
            activity={[this.props.action]}
            on_clear={() => redux.getActions("billing").clear_action()}
          />
        );
      }
    }

    private render_error(): Rendered {
      if (this.props.error) {
        return (
          <ErrorDisplay
            error={this.props.error}
            onClose={() => redux.getActions("billing").clear_error()}
          />
        );
      }
    }

    private render_help_suggestion(): Rendered {
      return (
        <span>
          <Space /> If you have any questions at all, read the{" "}
          <A href={"https://doc.cocalc.com/billing.html"}>
            Billing{"/"}Upgrades FAQ
          </A>{" "}
          or email <HelpEmailLink /> immediately.
          <b>
            <Space />
            <HelpEmailLink text={<span>Contact&nbsp;us</span>} /> if you are
            considering purchasing a course subscription and need a short
            evaluation trial.
            <Space />
          </b>
          <br />
          <br />
          <b>Enterprise Support:</b> Contact us at <HelpEmailLink /> for{" "}
          <i>enterprise support</i>, including customized course packages,
          modified terms of service, additional legal agreements, purchase
          orders, insurance and priority technical support.
        </span>
      );
    }

    private counts(): { cards: number; subs: number; invoices: number } {
      const cards =
        this.props.customer == null
          ? 0
          : this.props.customer.sources.total_count;
      const subs =
        this.props.customer == null
          ? 0
          : this.props.customer.subscriptions.total_count;
      const invoices =
        this.props.invoices == null ? 0 : this.props.invoices.total_count;
      return { cards, subs, invoices };
    }

    private render_suggested_next_step(): Rendered {
      const { cards, subs, invoices } = this.counts();
      const help = this.render_help_suggestion();

      if (cards === 0) {
        if (subs === 0) {
          // no payment sources yet; no subscriptions either: a new user (probably)
          return (
            <span>
              If you are{" "}
              <A href={"https://doc.cocalc.com/teaching-instructors.html"}>
                teaching a course
              </A>
              , choose one of the course packages. If you need to upgrade your
              personal projects, choose a recurring subscription. You will{" "}
              <b>not be charged</b> until you explicitly click "Add Subscription
              or Course Package".
              {help}
            </span>
          );
        } else {
          // subscriptions but they deleted their card.
          return (
            <span>
              Click "Add Payment Method..." to add a credit card so you can
              purchase or renew your subscriptions. Without a credit card any
              current subscriptions will run to completion, but will not renew.
              If you have any questions about subscriptions or billing (e.g.,
              about purchase orders, using PayPal or wire transfers for
              non-recurring subscriptions above $50) please email{" "}
              <HelpEmailLink /> immediately.
            </span>
          );
        }
      } else if (subs === 0) {
        // have a payment source, but no subscriptions
        return (
          <span>
            Click "Add Subscription or Course Package...". If you are{" "}
            <A href={"https://doc.cocalc.com/teaching-instructors.html"}>
              teaching a course,
            </A>
            choose one of the course packages. If you need to upgrade your
            personal projects, choose a recurring subscription. You will be
            charged only after you select a specific subscription and click "Add
            Subscription or Course Package".
            {help}
          </span>
        );
      } else if (invoices === 0) {
        // have payment source, subscription, but no invoices yet
        return (
          <span>
            You may sign up for the same subscription package more than once to
            increase the number of upgrades that you can use.
            {help}
          </span>
        );
      } else {
        // have payment source, subscription, and at least one invoice
        return (
          <span>
            You may sign up for the same subscription package more than once to
            increase the number of upgrades that you can use. Past invoices and
            receipts are available below.
            {help}
          </span>
        );
      }
    }

    private render_info_link(): Rendered {
      return (
        <div style={{ marginTop: "1em", marginBottom: "1em", color: "#666" }}>
          We offer many{" "}
          <A href={PolicyPricingPageUrl}>pricing and subscription options</A>
          .
          <Space />
          {this.render_suggested_next_step()}
        </div>
      );
    }

    private render_panel_header(icon, header): Rendered {
      return (
        <div style={{ cursor: "pointer" }}>
          <Icon name={icon} fixedWidth /> {header}
        </div>
      );
    }

    private render_subscriptions(): Rendered {
      return (
        <SubscriptionList
          customer={this.props.customer}
          applied_coupons={this.props.applied_coupons}
          coupon_error={this.props.coupon_error}
          selected_plan={this.props.selected_plan}
        />
      );
    }

    private finish_first_subscription(): void {
      const actions = redux.getActions("billing");
      if (actions == null) return;
      actions.set_selected_plan("");
      actions.remove_all_coupons();
      actions.setState({ continue_first_purchase: false });
    }

    private render_page(): Rendered {
      if (!this.props.loaded) {
        // nothing loaded yet from backend
        return <Loading />;
      } else if (this.props.customer == null && this.props.for_course) {
        // user not initialized yet -- only thing to do is add a card.
        return (
          <div>
            <PaymentMethods sources={{ data: [] }} default="" />
          </div>
        );
      } else if (
        !this.props.for_course &&
        (this.props.customer == null || this.props.continue_first_purchase)
      ) {
        return (
          <div>
            <PaymentMethods
              sources={
                this.props.customer != null
                  ? this.props.customer.sources
                  : undefined
              }
              default={
                this.props.customer != null
                  ? this.props.customer.default_source
                  : undefined
              }
            />
            <AddSubscription
              hide_cancel_button={true}
              on_close={this.finish_first_subscription.bind(this)}
              selected_plan={this.props.selected_plan}
              applied_coupons={this.props.applied_coupons}
              coupon_error={this.props.coupon_error}
              customer={this.props.customer}
            />
          </div>
        );
      } else {
        // data loaded and customer exists
        if (this.props.customer == null) return; // can't happen; for typescript
        const { subs } = this.counts();
        if (this.props.is_simplified && subs > 0) {
          return (
            <div>
              <PaymentMethods
                sources={this.props.customer.sources}
                default={this.props.customer.default_source}
              />
              {!this.props.for_course ? (
                <Panel
                  header={this.render_panel_header(
                    "list-alt",
                    "Subscriptions and Course Packages"
                  )}
                  eventKey="2"
                >
                  {this.render_subscriptions()}
                </Panel>
              ) : (
                undefined
              )}
            </div>
          );
        } else if (this.props.is_simplified) {
          return (
            <div>
              <PaymentMethods
                sources={this.props.customer.sources}
                default={this.props.customer.default_source}
              />
              {!this.props.for_course ? this.render_subscriptions() : undefined}
            </div>
          );
        } else {
          return (
            <div>
              <PaymentMethods
                sources={this.props.customer.sources}
                default={this.props.customer.default_source}
              />
              {!this.props.for_course ? this.render_subscriptions() : undefined}
              <InvoiceHistory invoices={this.props.invoices} />
            </div>
          );
        }
      }
    }

    public render(): Rendered {
      return (
        <div>
          <div>
            {!this.props.for_course ? this.render_info_link() : undefined}
            {!this.props.no_stripe ? this.render_action() : undefined}
            {this.render_error()}
            {!this.props.no_stripe ? this.render_page() : undefined}
          </div>
          {!this.props.is_simplified ? <Footer /> : undefined}
        </div>
      );
    }
  }
);
