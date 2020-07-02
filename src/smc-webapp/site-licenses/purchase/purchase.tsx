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

import { Button, Card, DatePicker, Radio } from "antd";
import * as moment from "moment";
import { React, useState } from "../../app-framework";
import { SliderWithInput } from "./slider-with-input";
const { RangePicker } = DatePicker;

type User = "academic" | "individual" | "business";
type Upgrade = "basic" | "standard" | "premium";
type Quantity = number;
type SubscriptionPeriod = "no" | "monthly" | "yearly";

const COSTS = {
  user: { academic: 1, individual: 1.2, business: 2 },
  upgrade: { basic: 4, standard: 6, premium: 10 },
} as const;

const DISCOUNT = 0.7;

interface Props {
  onClose: () => void;
}

export const PurchaseOneLicense: React.FC<Props> = React.memo(({ onClose }) => {
  const [user, set_user] = useState<User | undefined>(undefined);
  const [upgrade, set_upgrade] = useState<Upgrade | undefined>(undefined);
  const [quantity, set_quantity] = useState<Quantity>(1);
  const [subscription, set_subscription] = useState<
    SubscriptionPeriod | undefined
  >(undefined);
  const [start, set_start] = useState<Date>(new Date());
  const [end, set_end] = useState<Date>(moment().add(1, "M").toDate());
  const [quote, set_quote] = useState<boolean | undefined>(undefined);
  const [quote_info, set_quote_info] = useState<string | undefined>(undefined);

  function render_user() {
    return (
      <div>
        <Radio.Group
          options={[
            { label: "Academic", value: "academic" },
            { label: "Individual", value: "individual" },
            { label: "Business", value: "business" },
          ]}
          onChange={(e) => set_user(e.target.value)}
          value={user}
        />
      </div>
    );
  }

  function render_upgrade() {
    if (user == null) return;

    return (
      <div>
        <Radio.Group
          options={[
            { label: "Basic", value: "basic" },
            { label: "Standard", value: "standard" },
            { label: "Premium", value: "premium" },
          ]}
          onChange={(e) => set_upgrade(e.target.value)}
          value={upgrade}
        />
      </div>
    );
  }

  function render_quantity() {
    if (upgrade == null || user == null) return;
    return (
      <div>
        Number of simultaneous active projects{" "}
        {isNaN(quantity) ? "enter a number" : ""}
        <SliderWithInput
          min={1}
          max={1000}
          value={quantity}
          onChange={set_quantity}
        />
      </div>
    );
  }

  function render_subscription() {
    if (upgrade == null || user == null || quantity == null) return;
    return (
      <div>
        <Radio.Group
          options={[
            { label: "Specific period of time", value: "no" },
            { label: "Monthly subscription", value: "monthly" },
            { label: "Yearly subscription", value: "yearly" },
          ]}
          onChange={(e) => set_subscription(e.target.value)}
          value={subscription}
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
      const value = [moment(start), moment(end)];
      return (
        <RangePicker
          value={value as any}
          onChange={(value) => {
            if (value == null || value[0] == null || value[1] == null) return;
            set_start(value[0].toDate());
            set_end(value[1].toDate());
          }}
        />
      );
    } else {
      // just the start date (default to today)
      return (
        <div>
          Start on{" "}
          <DatePicker
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
    if (
      upgrade == null ||
      user == null ||
      quantity == null ||
      subscription == null ||
      isNaN(quantity)
    )
      return;

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
    cost = Math.max(5, Math.round(cost));
    const discounted_cost = Math.max(5, Math.round(cost * DISCOUNT));
    return (
      <div style={{ fontSize: "12pt" }}>
        Cost: ${cost} {subscription != "no" ? subscription : ""} (
        <i>or ${discounted_cost} if you purchase online NOW</i>)
      </div>
    );
  }

  function render_quote() {
    if (
      upgrade == null ||
      user == null ||
      quantity == null ||
      subscription == null ||
      isNaN(quantity)
    )
      return;

    return (
      <div>
        <Radio.Group
          options={[
            { label: "Purchase online now", value: false },
            {
              label: "I require a quote, invoice, special terms, PO's etc.",
              value: true,
            },
          ]}
          onChange={(e) => set_quote(e.target.value)}
          value={quote}
        />
      </div>
    );
  }

  function render_credit_card() {
    if (quote !== false) return;

    return <div>Enter credit card number here: </div>;
  }

  function submit() {
    const info = {
      quantity,
      user,
      upgrade,
      subscription,
      start,
      end,
      quote,
      quote_info,
    };
    console.log("submit", info);
    onClose();
  }

  function render_quote_info() {
    if (quote !== true) return;

    return (
      <div>
        Enter additional information about your quote request:
        <br />
        <textarea
          style={{ width: "100%" }}
          rows={4}
          value={quote_info}
          onChange={(event) => set_quote_info(event.target.value)}
        />
        <br />
        <Button onClick={submit}>Please contact me with a quote</Button>
      </div>
    );
  }

  function render_buy() {
    if (quote !== false) return;
    return (
      <div>
        <Button onClick={submit}>Complete purchase</Button>
      </div>
    );
  }

  return (
    <Card
      style={{ width: "100%" }}
      title={"Buy a license"}
      extra={<a onClick={onClose}>close</a>}
    >
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
    </Card>
  );
});
