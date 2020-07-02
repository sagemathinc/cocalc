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
import { webapp_client } from "../../webapp-client";
import { React, useMemo, useState } from "../../app-framework";
import { SliderWithInput } from "./slider-with-input";
const { RangePicker } = DatePicker;
import { ErrorDisplay } from "../../r_misc";

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
}

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
  const [quantity, set_quantity] = useState<number>(1);
  const [subscription, set_subscription] = useState<Subscription | undefined>(
    undefined
  );
  const [start, set_start] = useState<Date>(new Date());
  const [end, set_end] = useState<Date>(moment().add(1, "M").toDate());
  const [quote, set_quote] = useState<boolean | undefined>(undefined);
  const [quote_info, set_quote_info] = useState<string | undefined>(undefined);
  const [error, set_error] = useState<string>("");
  const [sending, set_sending] = useState<
    undefined | "active" | "success" | "failed"
  >(undefined);
  const disabled: boolean = useMemo(() => {
    return sending == "success" || sending == "active";
  }, [sending]);

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
    return Math.max(5, Math.round(cost * DISCOUNT));
  }, [cost]);

  function render_error() {
    if (error == "") return;
    return <ErrorDisplay error={error} onClose={() => set_error("")} />;
  }

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
          disabled={disabled}
        />
      </div>
    );
  }

  function render_upgrade() {
    if (user == null) return;

    return (
      <div>
        <Radio.Group
          disabled={disabled}
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
          disabled={disabled}
        />
      </div>
    );
  }

  function render_subscription() {
    if (upgrade == null || user == null || quantity == null) return;
    return (
      <div>
        <Radio.Group
          disabled={disabled}
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
          disabled={disabled}
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
        Cost: ${cost} {subscription != "no" ? subscription : ""}{" "}
        {discounted_cost < cost ? (
          <i>(or ${discounted_cost} if you purchase online NOW)</i>
        ) : undefined}
      </div>
    );
  }

  function render_quote() {
    if (cost == null || discounted_cost == null) return;
    return (
      <div>
        <Radio.Group
          disabled={disabled}
          options={[
            {
              label:
                "Purchase online now " +
                (discounted_cost < cost
                  ? `(and save $${cost - discounted_cost})`
                  : ""),
              value: false,
            },
            {
              label:
                "I require a quote, invoice, modified terms or a purchase order, etc.",
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
      end,
      quote,
      quote_info,
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
        <Button onClick={submit} disabled={disabled}>
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

  return (
    <Card title={"Buy a license"} extra={<a onClick={onClose}>close</a>}>
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
    </Card>
  );
});
