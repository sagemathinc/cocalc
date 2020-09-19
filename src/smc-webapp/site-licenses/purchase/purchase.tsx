/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Purchasing a license */

import {
  Button,
  Card,
  DatePicker,
  InputNumber,
  Menu,
  Dropdown,
  Row,
  Col,
  Input,
} from "antd";
import { DownOutlined } from "@ant-design/icons";
import { describe_quota } from "smc-util/db-schema/site-licenses";

import * as moment from "moment";
import { webapp_client } from "../../webapp-client";
import { CSS, React, redux, useMemo, useState } from "../../app-framework";
const { RangePicker } = DatePicker;
import {
  A,
  CopyToClipBoard,
  ErrorDisplay,
  Loading,
  Icon,
  Space,
} from "../../r_misc";
import { PurchaseMethod } from "./purchase-method";
import { RadioGroup } from "./radio-group";
import { plural } from "smc-util/misc2";
import { DebounceInput } from "react-debounce-input";
import { create_quote_support_ticket } from "./get-a-quote";
import { QuotaEditor } from "./quota-editor";

const LENGTH_PRESETS = [
  { label: "2 Days", desc: { n: 2, key: "days" } },
  { label: "1 Week", desc: { n: 7, key: "days" } },
  { label: "1 Month", desc: { n: 1, key: "months" } },
  { label: "6 Weeks", desc: { n: 7 * 6, key: "days" } },
  { label: "2 Months", desc: { n: 2, key: "months" } },
  { label: "3 Months", desc: { n: 3, key: "months" } },
  { label: "4 Months", desc: { n: 4, key: "months" } },
  { label: "5 Months", desc: { n: 5, key: "months" } },
  { label: "6 Months", desc: { n: 6, key: "months" } },
  { label: "7 Months", desc: { n: 7, key: "months" } },
  { label: "8 Months", desc: { n: 8, key: "months" } },
  { label: "9 Months", desc: { n: 9, key: "months" } },
  { label: "10 Months", desc: { n: 10, key: "months" } },
  { label: "11 Months", desc: { n: 11, key: "months" } },
  { label: "1 Year", desc: { n: 1, key: "years" } },
] as const;

const radioStyle: CSS = {
  display: "block",
  whiteSpace: "normal",
  fontWeight: "inherit", // this is to undo what react-bootstrap does to the labels.
} as const;

import {
  User,
  Upgrade,
  Subscription,
  PurchaseInfo,
  COSTS,
  compute_cost,
  money,
  percent_discount,
  discount_pct,
} from "./util";

interface Props {
  onClose: () => void;
}

export const PurchaseOneLicense: React.FC<Props> = React.memo(({ onClose }) => {
  const [user, set_user] = useState<User | undefined>(undefined);
  const [upgrade] = useState<Upgrade>("custom");
  const [title, set_title] = useState<string>("");
  const [description, set_description] = useState<string>("");

  const [custom_ram, set_custom_ram] = useState<number>(COSTS.basic.ram);
  const [custom_cpu, set_custom_cpu] = useState<number>(COSTS.basic.cpu);
  const [custom_dedicated_ram, set_custom_dedicated_ram] = useState<number>(
    COSTS.basic.dedicated_ram
  );
  const [custom_dedicated_cpu, set_custom_dedicated_cpu] = useState<number>(
    COSTS.basic.dedicated_cpu
  );
  const [custom_disk, set_custom_disk] = useState<number>(COSTS.basic.disk);
  const [custom_always_running, set_custom_always_running] = useState<boolean>(
    !!COSTS.basic.always_running
  );
  const [custom_member, set_custom_member] = useState<boolean>(
    !!COSTS.basic.member
  );
  const [quantity, set_quantity] = useState<number>(1);
  const [subscription, set_subscription] = useState<Subscription>("monthly");

  const [start, set_start_state] = useState<Date>(new Date());
  function set_start(date: Date) {
    date = date < start ? new Date() : date;
    // start at midnight (local user time) on that day
    date = moment(date).startOf("day").toDate();
    set_start_state(date);
  }

  const [end, set_end_state] = useState<Date>(
    moment().add(1, "month").toDate()
  );
  function set_end(date: Date) {
    const today = moment(start).endOf("day").toDate();
    const two_years = moment(start).add(2, "year").toDate();
    if (date <= today) {
      date = today;
    } else if (date >= two_years) {
      date = two_years;
    }
    // ends at the last moment (local user time) for the user on that day
    date = moment(date).endOf("day").toDate();
    set_end_state(date);
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

  const cost = useMemo<
    | {
        cost: number;
        cost_per_project_per_month: number;
        discounted_cost: number;
        cost_sub_month: number;
        cost_sub_year: number;
      }
    | undefined
  >(() => {
    if (user == null || quantity == null || subscription == null) {
      return undefined;
    }
    return compute_cost({
      quantity,
      user,
      upgrade,
      subscription,
      start,
      end,
      custom_ram,
      custom_cpu,
      custom_dedicated_ram,
      custom_dedicated_cpu,
      custom_disk,
      custom_always_running,
      custom_member,
    });
  }, [
    quantity,
    user,
    upgrade,
    subscription,
    start,
    end,
    custom_ram,
    custom_cpu,
    custom_dedicated_ram,
    custom_dedicated_cpu,
    custom_disk,
    custom_always_running,
    custom_member,
  ]);

  function render_error() {
    if (error == "") return;
    return (
      <ErrorDisplay
        style={{ marginTop: "5px", maxWidth: "800px" }}
        error={error}
        onClose={() => set_error("")}
      />
    );
  }

  function render_user() {
    return (
      <div>
        <h4>
          <Icon name="percentage" /> Discount
        </h4>
        <RadioGroup
          options={[
            {
              label: "Academic",
              desc: (
                <span>
                  students, teachers, academic researchers and hobbyists{" "}
                  <b>({discount_pct}% discount)</b>
                </span>
              ),
              value: "academic",
              icon: "graduation-cap",
            },
            {
              label: "Business",
              desc: "for commercial business purposes",
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
    if (user == null || cost == null) return;

    return (
      <div>
        <h4>
          <Icon name="laptop" /> Type
          {`: ${money(cost.cost_per_project_per_month)}/month per project`}
        </h4>
        <div style={{ fontSize: "12pt" }}>
          Up to {quantity} projects can be running at once, <b>each</b> with the
          following specs:
          <br />
        </div>
        {render_custom()}
      </div>
    );
  }

  function render_custom() {
    if (user == null) return;
    return (
      <QuotaEditor
        hideExtra={false}
        quota={{
          cpu: custom_cpu,
          ram: custom_ram,
          dedicated_cpu: custom_dedicated_cpu,
          dedicated_ram: custom_dedicated_ram,
          disk: custom_disk,
          always_running: custom_always_running,
          member: custom_member,
          user,
        }}
        onChange={(change) => {
          if (change.cpu != null) set_custom_cpu(change.cpu);
          if (change.ram != null) set_custom_ram(change.ram);
          if (change.dedicated_cpu != null)
            set_custom_dedicated_cpu(change.dedicated_cpu);
          if (change.dedicated_ram != null)
            set_custom_dedicated_ram(change.dedicated_ram);
          if (change.disk != null) set_custom_disk(change.disk);
          if (change.member != null) set_custom_member(change.member);
          if (change.always_running != null)
            set_custom_always_running(change.always_running);
        }}
      />
    );
  }

  function render_quantity_input() {
    return (
      <InputNumber
        style={{ margin: "0 5px" }}
        disabled={disabled}
        min={1}
        max={10000}
        value={quantity}
        onChange={(x) => {
          if (typeof x != "number") return;
          set_quantity(Math.round(x));
        }}
      />
    );
  }

  function render_quantity() {
    if (user == null) return;
    return (
      <div>
        <br />
        <h4>
          <Icon name="sort-amount-up" /> Number of Projects:{" "}
          {render_quantity_input()}
        </h4>
        <div style={{ fontSize: "12pt" }}>
          <ul>
            <li>
              Simultaneously run {quantity} {plural(quantity, "project")} with
              this license. You, and anyone you share the license code with, can
              apply the license to any number of projects (in project settings).
            </li>
            <li>
              {" "}
              If you're{" "}
              <A href="https://doc.cocalc.com/teaching-instructors.html">
                teaching a course
              </A>
              , the number of projects is typically <i>n+2</i>, where <i>n</i>{" "}
              is the number of students in the class: each student has a
              project, you will manage the course from a project, and all
              students will have access to one shared project. Contact us by
              clicking the "Help" button if you need to change the quantity
              later in the course as more students add.
            </li>
            <li>
              {" "}
              You can create hundreds of projects that use this license, but
              only {quantity} can be running at once.
            </li>
          </ul>
        </div>
      </div>
    );
  }

  function render_subscription() {
    if (user == null) return;
    return (
      <div>
        <br />
        <h4>
          <Icon name="calendar-week" /> Period
        </h4>
        <RadioGroup
          disabled={disabled}
          options={[
            {
              icon: "calendar-alt",
              label: "Monthly subscription",
              value: "monthly",
              desc: `pay once every month (${Math.round(
                (1 - COSTS.sub_discount["monthly"]) * 100
              )}% discount)`,
            },
            {
              icon: "calendar-check",
              label: "Yearly subscription",
              value: "yearly",
              desc: `pay once every year (${Math.round(
                (1 - COSTS.sub_discount["yearly"]) * 100
              )}% discount)`,
            },
            {
              icon: "calendar-times-o",
              label: "Start and end dates",
              desc:
                "pay for a specific period of time (as short as one day and as long as 2 years).  Licenses start at 0:00 in your local timezone on the start date and end at 23:59 your local time zone on the ending date.",
              value: "no",
            },
          ]}
          onChange={(e) => set_subscription(e.target.value)}
          value={subscription}
          radioStyle={radioStyle}
        />
      </div>
    );
  }

  function set_end_date(x): void {
    set_end(
      moment(start)
        .subtract(1, "day")
        .add(x.n as any, x.key)
        .toDate()
    );
  }

  function render_date() {
    if (
      upgrade == null ||
      user == null ||
      quantity == null ||
      subscription != "no"
    )
      return;
    // range of dates: start date -- end date
    // TODO: use "midnight UTC", or should we just give a
    // day grace period on both ends (?).
    const value = [moment(start), moment(end)];
    const presets: JSX.Element[] = [];
    for (const { label, desc } of LENGTH_PRESETS) {
      presets.push(
        <Menu.Item key={label}>
          <a onClick={() => set_end_date(desc)}>{label}</a>
        </Menu.Item>
      );
    }
    const menu = <Menu>{presets}</Menu>;
    // +1 since moment rounds down (it's a fraction of a second less than a full day)
    const n =
      moment(end).endOf("day").diff(moment(start).startOf("day"), "days") + 1;
    return (
      <div style={{ marginLeft: "60px" }}>
        <br />
        <h5>
          Start and end dates ({n} {plural(n, "day")})
        </h5>
        <RangePicker
          disabled={disabled}
          value={value as any}
          onChange={(value) => {
            if (value == null || value[0] == null || value[1] == null) return;
            set_start(value[0].toDate());
            set_end(value[1].toDate());
          }}
        />
        <Space />
        <Space />
        <Space />
        <Dropdown overlay={menu}>
          <a className="ant-dropdown-link" onClick={(e) => e.preventDefault()}>
            End after... <DownOutlined />
          </a>
        </Dropdown>
      </div>
    );
  }

  function render_title_desc() {
    if (cost == null) return;
    return (
      <div style={{ fontSize: "12pt" }}>
        <br />
        <h4>
          <Icon name="info-circle" /> Title and description
        </h4>
        Optionally set the title and description of this license. You can easily
        change this later.
        <br />
        <br />
        <Row gutter={[16, 16]}>
          <Col md={2}>Title</Col>
          <Col md={8}>
            <DebounceInput
              placeholder={"Title"}
              value={title}
              element={Input as any}
              onChange={(e) => set_title(e.target.value)}
            />
          </Col>
          <Col md={1}></Col>
          <Col md={4}>Description</Col>
          <Col md={9}>
            <DebounceInput
              autoSize={{ minRows: 1, maxRows: 6 }}
              element={Input.TextArea as any}
              placeholder={"Description"}
              value={description}
              onChange={(e) => set_description(e.target.value)}
            />
          </Col>
        </Row>
      </div>
    );
  }

  function render_cost() {
    if (cost == null) return;

    let desc;
    if (cost.discounted_cost < cost.cost) {
      desc = (
        <>
          <span style={{ textDecoration: "line-through" }}>
            {money(cost.cost)}
          </span>
          {" or "}
          {money(cost.discounted_cost)}
          {subscription != "no" ? " " + subscription : ""}, if you purchase
          online now ({percent_discount(cost)}% off!)
        </>
      );
    } else {
      desc = `${money(cost.cost)} ${subscription != "no" ? subscription : ""}`;
    }

    return (
      <div style={{ fontSize: "12pt" }}>
        <br />
        <h4>
          <Icon name="money-check" /> Cost: {desc}
        </h4>
      </div>
    );
  }

  function render_quote() {
    if (cost == null) return;
    return (
      <div>
        <br />
        <h4>
          <Icon name="store" /> Purchase
        </h4>
        <RadioGroup
          disabled={disabled}
          options={[
            {
              label: "Purchase online",
              desc:
                "purchase now with a credit card " +
                (cost.discounted_cost < cost.cost
                  ? `and save ${money(cost.cost - cost.discounted_cost)} ${
                      subscription != "no"
                        ? subscription + " for the life of your subscription!"
                        : ""
                    }`
                  : ""),
              value: false,
            },
            {
              label: "Get a quote",
              desc: `obtain a quote, invoice, modified terms, a purchase order, use PayPal or wire transfer, etc. (${money(
                COSTS.min_quote
              )} minimum)`,
              value: true,
              disabled: cost.cost < COSTS.min_quote,
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
    if (quote !== false || cost == null) return;
    if (payment_method != null) {
      // payment method already selected, which is only the case
      // during payment and once it is done.
      return;
    } else {
      // ask them to confirm their method and pay.
      return (
        <div>
          <br />
          <h4>
            <Icon name="credit-card" /> Payment
          </h4>
          <PurchaseMethod
            amount={money(cost.discounted_cost)}
            description={`${quantity} × ${describe_quota({
              ram: custom_ram,
              cpu: custom_cpu,
              dedicated_ram: custom_dedicated_ram,
              dedicated_cpu: custom_dedicated_cpu,
              disk: custom_disk,
              always_running: custom_always_running,
              member: custom_member,
              user,
            })}`}
            onClose={(id) => {
              set_payment_method(id);
              submit();
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
      custom_ram,
      custom_cpu,
      custom_dedicated_ram,
      custom_dedicated_cpu,
      custom_disk,
      custom_always_running,
      custom_member,
      title,
      description,
    };
    set_error("");
    if (quote) {
      set_sending("success");
      create_quote_support_ticket(info);
      onClose();
    } else {
      set_sending("active");
      try {
        const resp = await webapp_client.stripe.purchase_license(info);
        set_purchase_resp(resp);
        set_sending("success");
        redux.getActions("billing").update_managed_licenses();
      } catch (err) {
        set_error(err.toString());
        set_sending("failed");
      }
    }
  }

  function render_quote_info() {
    if (quote !== true) return;

    return (
      <div>
        Enter additional information about your quote request:
        <br />
        <DebounceInput
          autoSize={{ minRows: 1, maxRows: 6 }}
          element={Input.TextArea as any}
          disabled={disabled}
          style={{
            width: "100%",
            padding: "10px",
            border: "1px solid grey",
            borderRadius: "3px",
            margin: "10px",
          }}
          value={quote_info}
          onChange={(event) => set_quote_info(event.target.value)}
        />
        <br />
        <Button
          size="large"
          disabled={disabled}
          onClick={submit}
          type="primary"
        >
          <Icon name="envelope-o" />
          <Space />
          <Space /> Please contact me...
        </Button>
      </div>
    );
  }

  function render_sending() {
    switch (sending) {
      case "active":
        return (
          <div style={{ margin: "10px 0" }}>
            <h4>
              <Loading />
            </h4>
          </div>
        );
      case "success":
        return (
          <div style={{ margin: "10px 0" }}>
            <h4>
              Successfully{" "}
              {quote === true
                ? "requested quote; we will be in touch soon"
                : "completed purchase"}
              !
            </h4>
          </div>
        );
      case "failed":
        if (error) {
          return (
            <div style={{ margin: "10px 0" }}>
              <h4>
                Failed to{" "}
                {quote === true ? "request quote" : "complete purchase"}. Please
                try again later.
              </h4>
            </div>
          );
        } else return;
    }
  }

  function render_purchase_resp() {
    if (!purchase_resp) return;
    return (
      <div style={{ margin: "30px 0" }}>
        Your newly purchased license code is
        <br />
        <br />
        <CopyToClipBoard
          value={purchase_resp}
          style={{ maxWidth: "60ex", marginLeft: "30px" }}
        />
        You should see it listed under "Licenses that you manage".
      </div>
    );
  }

  // Just cancel everything or close the dialog (since you're done).
  function render_close() {
    return (
      <div>
        <Button disabled={sending == "active"} onClick={onClose}>
          {disabled ? "Close" : "Cancel"}
        </Button>
      </div>
    );
  }

  function render_instructions() {
    return (
      <div style={{ marginBottom: "15px" }}>
        Buy licenses or request a quote below, as{" "}
        <A href="https://doc.cocalc.com/account/licenses.html#buy-a-license">
          explained here
        </A>
        . If you are planning on making a significant purchase, but need to test
        things out first,{" "}
        <a onClick={() => redux.getActions("support").set_show(true)}>
          please request a free trial.
        </a>
      </div>
    );
  }

  return (
    <Card
      title={
        <>
          <h3>Buy a license</h3>
        </>
      }
      extra={<a onClick={onClose}>close</a>}
    >
      {render_instructions()}
      {render_user()}
      {render_quantity()}
      {render_project_type()}
      {render_subscription()}
      {render_date()}
      {render_title_desc()}
      {render_cost()}
      {render_quote()}
      {render_credit_card()}
      {render_quote_info()}
      {render_sending()}
      {render_error()}
      {render_purchase_resp()}
      <hr />
      {render_close()}
    </Card>
  );
});
