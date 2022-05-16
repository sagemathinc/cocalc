/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Ensure the billing Actions and Store are created:
require("./actions");

import {
  Component,
  rclass,
  redux,
  Rendered,
  rtypes,
} from "@cocalc/frontend/app-framework";
import {
  A,
  ActivityDisplay,
  ErrorDisplay,
  Loading,
} from "@cocalc/frontend/components";
import {
  Footer,
  HelpEmailLink,
  PolicyPricingPageUrl,
} from "@cocalc/frontend/customize";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { Alert } from "antd";
import { Map } from "immutable";
import { join } from "path";
import { PaymentMethods } from "./payment-methods";
import { Customer, InvoicesMap } from "./types";

interface ReactProps {
  is_simplified?: boolean;
  for_course?: boolean;
}

interface ReduxProps {
  customer?: Customer;
  invoices?: InvoicesMap;
  error?: string | Error;
  action?: string;
  loaded?: boolean;
  no_stripe?: boolean; // if true, stripe definitely isn't configured on the server
  selected_plan: string;
  project_map: Map<string, any>; // used, e.g., for course project payments; also computing available upgrades
  stripe_customer: Map<string, any>; // to get total upgrades user has available
}

export const BillingPage = rclass<ReactProps>(
  class BillingPage extends Component<ReactProps & ReduxProps> {
    static reduxProps() {
      return {
        billing: {
          customer: rtypes.object,
          invoices: rtypes.immutable.Map,
          error: rtypes.oneOfType([rtypes.string, rtypes.object]),
          action: rtypes.string,
          loaded: rtypes.bool,
          no_stripe: rtypes.bool, // if true, stripe definitely isn't configured on the server
          selected_plan: rtypes.string,
        },
        projects: {
          project_map: rtypes.immutable, // used, e.g., for course project payments; also computing available upgrades
        },
        account: {
          stripe_customer: rtypes.immutable, // to get total upgrades user has available
        },
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

    private render_enterprise_support(): Rendered {
      return (
        <p>
          <b>Enterprise Support:</b> Contact us at <HelpEmailLink /> for{" "}
          <i>enterprise support</i>, including customized course packages,
          modified terms of service, additional legal agreements, purchase
          orders, insurance and priority technical support.
        </p>
      );
    }

    private render_on_prem(): Rendered {
      return (
        <p>
          <b>Commercial on Premises:</b> Contact us at <HelpEmailLink /> for{" "}
          questions about our{" "}
          <A href={PolicyPricingPageUrl + "/onprem"}>
            commercial on premises offering.
          </A>
        </p>
      );
    }

    private render_help_suggestion(): Rendered {
      return (
        <>
          <p>
            <b>Questions: </b>
            If you have any questions at all, read the{" "}
            <A href={"https://doc.cocalc.com/billing.html"}>
              Billing{"/"}Upgrades FAQ
            </A>{" "}
            or email <HelpEmailLink /> immediately.
          </p>
          <p>
            <b>Teaching:</b>{" "}
            <HelpEmailLink text={<span>Contact&nbsp;us</span>} /> if you are
            considering purchasing a course subscription and need a short
            evaluation trial.
          </p>
          {this.render_enterprise_support()}
          {this.render_on_prem()}
        </>
      );
    }

    private counts(): { cards: number; subs: number; invoices: number } {
      const cards = this.props.customer?.sources?.total_count ?? 0;
      const subs = this.props.customer?.subscriptions?.total_count ?? 0;
      const invoices = this.props.invoices?.get("total_count") ?? 0;
      return { cards, subs, invoices };
    }

    private render_page(): Rendered {
      if (!this.props.for_course) return;
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
            </div>
          );
        } else if (this.props.is_simplified) {
          return (
            <div>
              <PaymentMethods
                sources={this.props.customer.sources}
                default={this.props.customer.default_source}
              />
            </div>
          );
        }
      }
    }

    private render_alert(): Rendered {
      if (this.props.for_course) return;
      return (
        <Alert
          showIcon
          style={{ margin: "30px auto", fontSize: "125%" }}
          icon={
            <span style={{ fontSize: "150%", margin: "30px" }}>&#x26A0;</span>
          }
          type="warning"
          message={
            <>
              The old purchasing page is no longer available. Instead, visit
              these pages:
              <br />
              <ul>
                <li>
                  <A href={join(appBasePath, "pricing")}>Pricing</A>: get an
                  overview about all offered products.
                </li>
                <li>
                  <A href={join(appBasePath, "store")}>Store</A>: purchase
                  license upgrades, boosts, dedicated resources, etc.
                </li>
                <li>
                  <A href={join(appBasePath, "billing")}>Billing</A>:
                  information about your purchases, ongoing subscriptions,
                  credit cards, invoices, etc.
                </li>
              </ul>
            </>
          }
        />
      );
    }

    public render(): Rendered {
      return (
        <>
          {this.render_alert()}
          <div>
            {!this.props.for_course ? this.render_help_suggestion() : undefined}
            {!this.props.no_stripe ? this.render_action() : undefined}
            {this.render_error()}
            {!this.props.no_stripe ? this.render_page() : undefined}
          </div>
          {!this.props.is_simplified ? <Footer /> : undefined}
        </>
      );
    }
  }
);
