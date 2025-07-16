/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Divider, Form, Input, Radio, Space } from "antd";
import { ReactNode } from "react";

import { COSTS } from "@cocalc/util/licenses/purchase/consts";
import { Subscription } from "@cocalc/util/licenses/purchase/types";
import { isAcademic, unreachable } from "@cocalc/util/misc";
import DateRange from "components/misc/date-range";
import useProfile from "lib/hooks/profile";
import { LicenseType } from "./types";

type Duration = "all" | "subscriptions" | "monthly" | "yearly" | "range";

interface Props {
  showExplanations?: boolean;
  form: any;
  onChange: () => void;
  disabled?: boolean;
  showUsage?: boolean;
  duration?: Duration;
  discount?: boolean;
  extraDuration?: ReactNode;
  type: LicenseType;
}

function getTimezoneFromDate(
  date: Date,
  format: "long" | "short" = "long",
): string {
  return (
    Intl.DateTimeFormat(undefined, {
      timeZoneName: format,
    })
      .formatToParts(date)
      .find((x) => x.type === "timeZoneName")?.value || ""
  );
}

export function UsageAndDuration(props: Props) {
  const {
    showExplanations = false,
    form,
    onChange,
    disabled = false,
    showUsage = true,
    discount = true,
    extraDuration,
    type,
  } = props;

  //const duration: Duration = type === "license" ? "all" : "range";
  const duration = props.duration || "all";

  const profile = useProfile();

  function renderUsageExplanation() {
    if (!showExplanations) return;
    const ac = (
      <>Academic users receive a 40% discount off the standard price.</>
    );
    switch (type) {
      case "license":
        return (
          <>
            Will this license be used for academic or commercial purposes?
            {ac}
          </>
        );
      case "course":
        return ac;
      default:
        unreachable(type);
    }
  }

  function renderUsageItem() {
    switch (type) {
      case "license":
        return (
          <Radio.Group disabled={disabled}>
            <Space direction="vertical" style={{ margin: "5px 0" }}>
              <Radio value={"business"}>
                Business - for commercial purposes
              </Radio>
              <Radio value={"academic"}>
                Academic - students, teachers, academic researchers, non-profit
                organizations and hobbyists (40% discount)
              </Radio>
            </Space>{" "}
          </Radio.Group>
        );
      case "course":
        return <>Academic</>;

      default:
        unreachable(type);
    }
  }

  function renderUsage() {
    if (!showUsage) return;

    switch (type) {
      case "course":
        return (
          <Form.Item
            name="user"
            initialValue="academic"
            label={"Usage"}
            extra={renderUsageExplanation()}
          >
            <Input type="hidden" value="academic" />
            Academic
          </Form.Item>
        );
      case "license":
        return (
          <Form.Item
            name="user"
            initialValue={
              isAcademic(profile?.email_address) ? "academic" : "business"
            }
            label={"Usage"}
            extra={renderUsageExplanation()}
          >
            {renderUsageItem()}
          </Form.Item>
        );
      default:
        unreachable(type);
    }
  }

  function renderRangeSelector(getFieldValue) {
    const period = getFieldValue("period");
    if (period !== "range") {
      return;
    }
    let range = getFieldValue("range");
    let invalidRange = range?.[0] == null || range?.[1] == null;
    if (invalidRange) {
      const start = new Date();
      const dayMs = 1000 * 60 * 60 * 24;
      const daysDelta = type === "course" ? 4 * 30 : 30;
      const end = new Date(start.valueOf() + dayMs * daysDelta);
      range = [start, end];
      form.setFieldsValue({ range });
      onChange();
    }
    let suffix;
    try {
      if (!invalidRange) {
        // always make them actual dates. See
        //  https://github.com/sagemathinc/cocalc/issues/7173
        // where this caused a crash when parsing the URL.
        range[0] = new Date(range[0]);
        range[1] = new Date(range[1]);
      }
      suffix =
        range &&
        range[0] &&
        `(midnight to 11:59pm, ${getTimezoneFromDate(range[0], "long")})`;
    } catch (err) {
      invalidRange = true;
      console.warn(`WARNING: issue parsing date ${range[0]}`);
      suffix = undefined;
    }
    return (
      <Form.Item
        label={type === "course" ? "Course Dates" : "License Term"}
        name="range"
        rules={[{ required: true }]}
        help={invalidRange ? "Please enter a valid license range." : ""}
        validateStatus={invalidRange ? "error" : "success"}
        style={{ paddingBottom: "30px" }}
        extra={type === "course" ? renderDurationExplanation() : undefined}
      >
        <DateRange
          disabled={disabled}
          noPast
          maxDaysInFuture={365 * 4}
          style={{ marginTop: "5px" }}
          initialValues={range}
          onChange={(range) => {
            form.setFieldsValue({ range });
            onChange();
          }}
          suffix={suffix}
        />
      </Form.Item>
    );
  }

  function renderRange() {
    return (
      <Form.Item
        noStyle
        shouldUpdate={(prevValues, currentValues) =>
          prevValues.period !== currentValues.period
        }
      >
        {({ getFieldValue }) => renderRangeSelector(getFieldValue)}
      </Form.Item>
    );
  }

  function renderSubsDiscount(duration: Subscription) {
    if (!discount) return;
    const pct = Math.round(100 * (1 - COSTS.sub_discount[duration]));
    return <b> (discount {pct}%)</b>;
  }

  function renderSubsOptions() {
    if (duration === "all" || duration !== "range") {
      return (
        <>
          {duration !== "yearly" && (
            <Radio value={"monthly"}>
              Monthly Subscription {renderSubsDiscount("monthly")}
            </Radio>
          )}
          {duration !== "monthly" && (
            <Radio value={"yearly"}>
              Yearly Subscription {renderSubsDiscount("yearly")}
            </Radio>
          )}
        </>
      );
    }
  }

  function renderRangeOption() {
    if (duration === "all" || duration === "range") {
      return <Radio value={"range"}>Specific Start and End Dates</Radio>;
    }
  }

  function renderDurationExplanation() {
    if (extraDuration) {
      return extraDuration;
    }
    if (!showExplanations || !discount) return;

    const tz = (
      <i>
        Licenses start and end at the indicated times in your local timezone.
      </i>
    );

    switch (type) {
      case "course":
        return <>{tz}</>;

      case "license":
        return (
          <>
            You can buy a license either via a subscription or a single purchase
            for specific dates. Once you purchase a license,{" "}
            <b>
              you can always edit it later, or cancel it for a prorated refund
            </b>{" "}
            as credit that you can use to purchase something else. Subscriptions
            will be canceled at the end of the paid for period.{" "}
            {duration == "range" && { tz }}
          </>
        );
      default:
        unreachable(type);
    }
  }

  function renderPeriod() {
    const init =
      type === "course" ? "range" : duration === "range" ? "range" : "monthly";

    switch (type) {
      case "course":
        return (
          <Form.Item name="period" initialValue={init} hidden>
            <Input type="hidden" value="range" />
          </Form.Item>
        );

      case "license":
        return (
          <Form.Item
            name="period"
            initialValue={init}
            label="Period"
            extra={renderDurationExplanation()}
          >
            <Radio.Group disabled={disabled}>
              <Space direction="vertical" style={{ margin: "5px 0" }}>
                {renderSubsOptions()}
                {renderRangeOption()}
              </Space>
            </Radio.Group>
          </Form.Item>
        );

      default:
        unreachable(type);
    }
  }

  function renderDuration() {
    return (
      <>
        <Form.Item name="range" hidden={true}>
          <Input />
        </Form.Item>
        {renderPeriod()}
        {renderRange()}
      </>
    );
  }

  return (
    <>
      <Divider plain>{showUsage ? "Usage and " : ""}Duration</Divider>
      {renderUsage()}
      {renderDuration()}
    </>
  );
}
