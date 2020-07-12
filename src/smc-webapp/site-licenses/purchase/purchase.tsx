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

import { Button, Card, DatePicker, InputNumber } from "antd";
import * as moment from "moment";
import { webapp_client } from "../../webapp-client";
import { CSS, React, useMemo, useState } from "../../app-framework";
const { RangePicker } = DatePicker;
import { ErrorDisplay } from "../../r_misc";
import { PurchaseMethod } from "./purchase-method";
import { RadioGroup } from "./radio-group";
import { plural } from "smc-util/misc2";

const radioStyle: CSS = {
  display: "block",
  height: "30px",
  lineHeight: "30px",
  fontWeight: "inherit", // this is to undo what react-bootstrap does to the labels.
};

import {
  User,
  Upgrade,
  Subscription,
  PurchaseInfo,
  COSTS,
  compute_cost,
  compute_discounted_cost,
  money,
  percent_discount,
} from "./util";

interface Props {
  onClose: () => void;
}

export const PurchaseOneLicense: React.FC<Props> = React.memo(({ onClose }) => {
  const [user, set_user] = useState<User | undefined>(undefined);
  const [upgrade, set_upgrade] = useState<Upgrade>("standard");
  const [quantity, set_quantity] = useState<number | undefined>(1);
  const [subscription, set_subscription] = useState<Subscription>("monthly");

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
  const [purchase_resp, set_purchase_resp] = useState<string | undefined>(
    undefined
  );
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
    ) {
      return undefined;
    }
    return compute_cost({ quantity, user, upgrade, subscription, start, end });
  }, [quantity, user, upgrade, subscription, start, end]);

  const discounted_cost = useMemo<number | undefined>(() => {
    if (cost == null) return undefined;
    return compute_discounted_cost(cost);
  }, [cost]);

  function render_error() {
    if (error == "") return;
    return <ErrorDisplay error={error} onClose={() => set_error("")} />;
  }

  function render_user() {
    return (
      <div>
        <h4>Academic or Commercial Use</h4>
        <RadioGroup
          options={[
            {
              label: "Academic",
              desc: `students, teachers, academic researchers and hobbyists (${Math.round(
                (1 - COSTS.user_discount["academic"]) * 100
              )}% discount)`,
              value: "academic",
              icon: "graduation-cap",
            },
            {
              label: "Commercial",
              desc: "for business purposes",
              value: "business",
              icon: "briefcase",
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

  function render_project_type() {
    if (user == null) return;

    return (
      <div>
        <br />
        <h4>Type of Projects</h4>
        <RadioGroup
          disabled={disabled}
          options={[
            {
              icon: "battery-2",
              label: "Standard",
              value: "standard",
              desc:
                "support, member hosting, internet access, 3GB disk space (removes the red warning banner)",
              cost: `${money(
                COSTS.sub_discount[subscription] *
                  COSTS.user_discount[user] *
                  COSTS.base_cost["standard"]
              )}/month per project`,
            },
            {
              icon: "battery-3",
              label: "Custom",
              value: "premium",
              desc: "customize your RAM, CPU, disk space and idle timeout",
              cost: `${money(
                COSTS.sub_discount[subscription] *
                  COSTS.user_discount[user] *
                  COSTS.base_cost["premium"]
              )}/month per project`,
            },
          ]}
          onChange={(e) => set_upgrade(e.target.value)}
          value={upgrade}
          radioStyle={radioStyle}
        />
      </div>
    );
  }

  function render_quantity_input() {
    return (
      <InputNumber
        style={{ margin: "0 5px" }}
        disabled={disabled}
        min={1}
        max={1500}
        value={quantity}
        onChange={(number) => {
          if (typeof number == "string") return;
          set_quantity(number);
        }}
      />
    );
  }

  function render_quantity() {
    if (user == null) return;
    return (
      <div>
        <br />
        <h4>Number of Projects</h4>
        <div style={{ fontSize: "12pt", marginLeft: "30px" }}>
          Simultaneously run
          {render_quantity_input()}
          {plural(quantity, "project")} using this license.
        </div>
      </div>
    );
  }

  function render_subscription() {
    if (user == null) return;
    return (
      <div>
        <br />
        <h4>Period</h4>
        <RadioGroup
          disabled={disabled}
          options={[
            {
              icon: "calendar-alt",
              label: "Monthly subscription",
              value: "monthly",
              desc: `pay once per month (${Math.round(
                (1 - COSTS.sub_discount["monthly"]) * 100
              )}% discount)`,
            },
            {
              icon: "calendar-check",
              label: "Yearly subscription",
              value: "yearly",
              desc: `pay once per year (${Math.round(
                (1 - COSTS.sub_discount["yearly"]) * 100
              )}% discount)`,
            },
            { label: "Specific period of time", value: "no" },
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
        <div style={{ marginLeft: "30px" }}>
          <br />
          <h5>Start and End Dates</h5>
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
        <div style={{ marginLeft: "30px" }}>
          <br />
          <h5>Start Date</h5>
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

    let desc;
    if (discounted_cost < cost) {
      desc = (
        <>
          <span style={{ textDecoration: "line-through" }}>{money(cost)}</span>
          {" or "}
          {money(discounted_cost)}
          {subscription != "no" ? " " + subscription : ""}, if you purchase
          online now ({percent_discount(cost, discounted_cost)}% off!)
        </>
      );
    } else {
      desc = `${money(cost)} ${subscription != "no" ? subscription : ""}`;
    }

    return (
      <div style={{ fontSize: "12pt" }}>
        <br />
        <h4>Total Cost: {desc}</h4>
      </div>
    );
  }

  function render_quote() {
    if (cost == null || discounted_cost == null) return;
    return (
      <div>
        <br />
        <h4>Purchase now or request a quote</h4>
        <RadioGroup
          disabled={disabled}
          options={[
            {
              label: "Purchase now",
              desc:
                "purchase online now " +
                (discounted_cost < cost
                  ? `and save ${money(cost - discounted_cost)} ${
                      subscription != "no" ? subscription : ""
                    }`
                  : ""),
              value: false,
            },
            {
              label: "Get a quote",
              desc: `I need a quote, invoice, modified terms, a purchase order, to use PayPal, etc. (${money(
                COSTS.min_quote
              )} minimum)`,
              value: true,
              disabled: cost < COSTS.min_quote,
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
          Use {payment_method}
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
      quantity == undefined ||
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
      const resp = await webapp_client.stripe.purchase_license(info);
      set_purchase_resp(resp);
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
        <br />
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

  function render_purchase_resp() {
    if (!purchase_resp) return;
    return (
      <div>
        <br />
        {purchase_resp}
      </div>
    );
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
      title={
        <>
          <h3>Buy a license</h3>
          <span style={{ fontWeight: 350 }}>
            Find out how much licenses cost, buy a license online, or get a
            quote.
          </span>
        </>
      }
      extra={<a onClick={onClose}>close</a>}
    >
      {render_error()}
      {render_user()}
      {render_quantity()}
      {render_project_type()}
      {render_subscription()}
      {render_date()}
      {render_cost()}
      {render_quote()}
      {render_credit_card()}
      {render_quote_info()}
      {render_buy()}
      {render_sending()}
      {render_purchase_resp()}
      <hr />
      <br />
      {render_cancel()}
    </Card>
  );
});
