/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Purchasing a license

   - [ ] User: Academic Individual,  or Business
   - [ ] Upgrade: Basic, Standard, Premium (actual upgrades depend on user type)
   - [ ] Quantity: How many simultaneously running projects can use this
   - [ ] Duration: 1 day, 1 week, 1 month, 4 months, 1 year, 2 years
   - [ ] Subscription: yes or no
   - [ ] Start date:

*/

import { Button, Card, DatePicker } from "antd";
import * as moment from "moment";
import { webapp_client } from "../../webapp-client";
import { CSS, React, useMemo, useState } from "../../app-framework";
const { RangePicker } = DatePicker;
import { ErrorDisplay } from "../../r_misc";
import { SliderWithInput } from "./slider-with-input";
import { PurchaseMethod } from "./purchase-method";
import { RadioGroup } from "./radio-group";

const radioStyle: CSS = {
  display: "block",
  height: "30px",
  lineHeight: "30px",
  fontWeight: "inherit", // this is to undo what react-bootstrap does to the labels.
};

type User = "academic" | "individual" | "business";
type Upgrade = "basic" | "standard" | "premium";
type Subscription = "no" | "monthly" | "yearly";

export interface PurchaseInfo {
  user: User;
  upgrade: Upgrade;
  quantity: number;
  subscription: Subscription;
  start: Date;
  end?: Date;
  quote: boolean;
  quote_info?: string;
  payment_method?: string;
  cost?: number; // use cost and discounted_cost as double check on backend only (i.e., don't trust them, but on other hand be careful not to charge more!)
  discounted_cost?: number;
}

const COSTS = {
  user: { academic: 0.5, individual: 0.7, business: 1 },
  upgrade: { basic: 8, standard: 12, premium: 20 },
} as const;

const ONLINE_DISCOUNT = 0.7;

const MIN_QUOTE = 100;

interface Props {
  onClose: () => void;
}

export const PurchaseOneLicense: React.FC<Props> = React.memo(({ onClose }) => {
  const [user, set_user] = useState<User | undefined>(undefined);
  const [upgrade, set_upgrade] = useState<Upgrade | undefined>(undefined);
  const [quantity, set_quantity] = useState<number>(1);
  const [subscription, set_subscription] = useState<Subscription | undefined>(
    undefined
  );

  const [start, set_start_state] = useState<Date>(new Date());
  function set_start(date: Date) {
    set_start_state(date < start ? new Date() : date);
  }

  const [end, set_end_state] = useState<Date>(
    moment().add(1, "month").toDate()
  );
  function set_end(date: Date) {
    set_end_state(date <= start ? moment(start).add(1, "day").toDate() : date);
  }

  const [quote, set_quote] = useState<boolean | undefined>(undefined);
  const [quote_info, set_quote_info] = useState<string | undefined>(undefined);
  const [error, set_error] = useState<string>("");
  const [sending, set_sending] = useState<
    undefined | "active" | "success" | "failed"
  >(undefined);
  const disabled: boolean = useMemo(() => {
    return sending == "success" || sending == "active";
  }, [sending]);
  const [payment_method, set_payment_method] = useState<string | undefined>(
    undefined
  );

  const cost = useMemo<number | undefined>(() => {
    if (
      upgrade == null ||
      user == null ||
      quantity == null ||
      subscription == null ||
      isNaN(quantity)
    )
      return undefined;

    // Just a quick sample cost formula so we can see this work.
    let cost = quantity * COSTS.user[user] * COSTS.upgrade[upgrade];
    if (subscription == "no") {
      // scale by factor of a month
      const months =
        (end.valueOf() - start.valueOf()) / (30.5 * 24 * 60 * 60 * 1000);
      cost *= months;
    } else if (subscription == "yearly") {
      cost *= 12;
    }
    return Math.max(5, Math.round(cost));
  }, [quantity, user, upgrade, subscription, start, end]);

  const discounted_cost = useMemo<number | undefined>(() => {
    if (cost == null) return undefined;
    return Math.max(5, Math.round(cost * ONLINE_DISCOUNT));
  }, [cost]);

  function render_error() {
    if (error == "") return;
    return <ErrorDisplay error={error} onClose={() => set_error("")} />;
  }

  function render_user() {
    return (
      <div>
        <h4>Who will use the license</h4>
        <RadioGroup
          options={[
            {
              label: "Academics",
              desc: `students and teachers at an academic institute or online course (up to ${Math.round(
                (1 - COSTS.user.academic) * 100
              )}% discount)`,
              value: "academic",
            },
            {
              label: "Individuals",
              desc: `non-academic and non-business users  (up to ${Math.round(
                (1 - COSTS.user.individual) * 100
              )}% discount)`,
              value: "individual",
            },
            {
              label: "Business employees",
              desc:
                "people working at a company, e.g., doing research and development",
              value: "business",
            },
          ]}
          onChange={(e) => set_user(e.target.value)}
          value={user}
          disabled={disabled}
          radioStyle={radioStyle}
        />
      </div>
    );
  }

  function render_upgrade() {
    if (user == null) return;

    return (
      <div>
        <br />
        <h4>How to upgrade projects</h4>
        <RadioGroup
          disabled={disabled}
          options={[
            {
              label: "Basic",
              value: "basic",
              desc:
                "member hosting, internet access, better idle timeout, a slightly more dedicated and shared RAM",
            },
            {
              label: "Standard",
              value: "standard",
              desc:
                "member hosting, internet access, 4 hours idle timeout, 2GB shared RAM and 2 shared vCPU's",
            },
            {
              label: "Premium",
              value: "premium",
              desc:
                "premium hosting, internet access, 24 hours idle timeout, 4GB shared RAM, 3 shared vCPU's",
            },
          ]}
          onChange={(e) => set_upgrade(e.target.value)}
          value={upgrade}
          radioStyle={radioStyle}
        />
      </div>
    );
  }

  function render_quantity() {
    if (upgrade == null || user == null) return;
    return (
      <div>
        <br />
        <h4>Maximum number of simultaneous active projects</h4>
        {isNaN(quantity) ? "enter a number" : ""}
        <SliderWithInput
          min={1}
          max={1000}
          value={quantity}
          onChange={set_quantity}
          disabled={disabled}
        />
      </div>
    );
  }

  function render_subscription() {
    if (upgrade == null || user == null || quantity == null) return;
    return (
      <div>
        <br />
        <h4>When the license will be used</h4>
        <RadioGroup
          disabled={disabled}
          options={[
            { label: "Specific period of time", value: "no" },
            { label: "Monthly subscription", value: "monthly" },
            { label: "Yearly subscription", value: "yearly" },
          ]}
          onChange={(e) => set_subscription(e.target.value)}
          value={subscription}
          radioStyle={radioStyle}
        />
      </div>
    );
  }

  function render_date() {
    if (
      upgrade == null ||
      user == null ||
      quantity == null ||
      subscription == null
    )
      return;
    if (subscription == "no") {
      // range of dates: start date -- end date
      // TODO: use "midnight UTC", or should we just give a day grace period on both ends (?).
      const value = [moment(start), moment(end)];
      return (
        <div>
          <br />
          <h4>Start and end dates</h4>
          <RangePicker
            disabled={disabled}
            value={value as any}
            onChange={(value) => {
              if (value == null || value[0] == null || value[1] == null) return;
              set_start(value[0].toDate());
              set_end(value[1].toDate());
            }}
          />
        </div>
      );
    } else {
      // just the start date (default to today)
      return (
        <div>
          <br />
          <h4>Start date</h4>
          <DatePicker
            disabled={disabled}
            value={moment(start) as any}
            onChange={(moment) => {
              if (moment == null) return;
              set_start(moment.toDate());
            }}
          />
        </div>
      );
    }
  }

  function render_cost() {
    if (cost == null || discounted_cost == null) return;

    return (
      <div style={{ fontSize: "12pt" }}>
        <br />
        <h4>
          Total cost: ${cost} {subscription != "no" ? subscription : ""}{" "}
        </h4>
        {discounted_cost < cost ? (
          <i>
            Online Special: ${discounted_cost} if you{" "}
            <b>
              <i>purchase online</i>
            </b>{" "}
            today!
          </i>
        ) : undefined}
      </div>
    );
  }

  function render_quote() {
    if (cost == null || discounted_cost == null) return;
    return (
      <div>
        <br />
        <h4>Purchase now or request quote</h4>
        <RadioGroup
          disabled={disabled}
          options={[
            {
              label: "Purchase now",
              desc:
                "purchase online now " +
                (discounted_cost < cost
                  ? `and save $${cost - discounted_cost}`
                  : ""),
              value: false,
            },
            {
              label: "Get a quote",
              desc: `I need a quote, invoice, modified terms, a purchase order, to use PayPal, etc. ($${MIN_QUOTE} minimum)`,
              value: true,
              disabled: cost < MIN_QUOTE,
            },
          ]}
          onChange={(e) => set_quote(e.target.value)}
          value={quote}
          radioStyle={radioStyle}
        />
      </div>
    );
  }

  function render_credit_card() {
    if (quote !== false) return;
    if (payment_method != null) {
      return (
        <div>
          <br />
          <h4>Payment method</h4>
          Pay with {payment_method}
          <br />
          <Button onClick={() => set_payment_method(undefined)}>
            Change...
          </Button>
        </div>
      );
    } else {
      return (
        <div>
          <br />
          <h4>Select or enter payment method</h4>
          <PurchaseMethod
            onClose={(id) => {
              set_payment_method(id);
            }}
          />
        </div>
      );
    }
  }

  async function submit(): Promise<void> {
    if (
      user == null ||
      upgrade == null ||
      quantity <= 0 ||
      subscription == null ||
      quote == null
    )
      return;
    const info: PurchaseInfo = {
      quantity,
      user,
      upgrade,
      subscription,
      start,
      end: subscription == "no" ? end : undefined,
      quote,
      quote_info,
      payment_method,
      cost,
      discounted_cost,
    };
    set_sending("active");
    try {
      await webapp_client.stripe.purchase_license(info);
      set_sending("success");
    } catch (err) {
      set_error(err.toString());
      set_sending("failed");
    }
  }

  function render_quote_info() {
    if (quote !== true) return;

    return (
      <div>
        Enter additional information about your quote request:
        <br />
        <textarea
          disabled={disabled}
          style={{ width: "100%" }}
          rows={4}
          value={quote_info}
          onChange={(event) => set_quote_info(event.target.value)}
        />
        <br />
        <Button disabled={disabled} onClick={submit}>
          Please contact me
        </Button>
      </div>
    );
  }

  function render_buy() {
    if (quote !== false) return;
    return (
      <div>
        <Button onClick={submit} disabled={disabled || payment_method == null}>
          Complete purchase
        </Button>
      </div>
    );
  }

  function render_sending() {
    switch (sending) {
      case "active":
        return <div>Sending to server...</div>;
      case "success":
        return (
          <div>
            Successfully{" "}
            {quote === true ? "requested quote" : "completed purchase"}
            <br />
            <Button onClick={onClose}>Close</Button>
          </div>
        );
      case "failed":
        if (error) {
          return (
            <div>
              Failed to {quote === true ? "request quote" : "complete purchase"}
              <br />
              You may want to try again later.
              <br />
              <Button onClick={onClose}>Close</Button>
            </div>
          );
        } else return;
    }
  }

  // Just cancel everything
  function render_cancel() {
    return (
      <div>
        <Button onClick={onClose}>Cancel</Button>
      </div>
    );
  }

  return (
    <Card
      title={<h3>Purchase license</h3>}
      extra={<a onClick={onClose}>close</a>}
      style={{ maxWidth: "1100px", margin: "auto" }}
    >
      {render_error()}
      {render_user()}
      {render_upgrade()}
      {render_quantity()}
      {render_subscription()}
      {render_date()}
      {render_cost()}
      {render_quote()}
      {render_credit_card()}
      {render_quote_info()}
      {render_buy()}
      {render_sending()}
      <hr />
      <br />
      {render_cancel()}
    </Card>
  );
});
