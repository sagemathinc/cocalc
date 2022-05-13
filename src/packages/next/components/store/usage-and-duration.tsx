/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { COSTS } from "@cocalc/util/licenses/purchase/consts";
import { Subscription } from "@cocalc/util/licenses/purchase/types";
import { endOfDay, startOfDay } from "@cocalc/util/stripe/timecalcs";
import { Divider, Form, Input, Radio, Space } from "antd";
import A from "components/misc/A";
import DateRange, { DateRangeType } from "components/misc/date-range";
import { ReactNode } from "react";
import { useTimeFixer } from "./util";

interface Props {
  showExplanations?: boolean;
  form: any;
  onChange: () => void;
  disabled?: boolean;
  showUsage?: boolean;
  duration?: "all" | "subscriptions" | "monthly" | "yearly" | "range";
  discount?: boolean;
  extraDuration?: ReactNode;
}

export function UsageAndDuration(props: Props) {
  const {
    showExplanations = false,
    form,
    onChange,
    disabled = false,
    showUsage = true,
    duration = "all",
    discount = true,
    extraDuration,
  } = props;

  const { toServerTime, serverTimeDate } = useTimeFixer();

  function renderUsage() {
    if (!showUsage) return;
    return (
      <Form.Item
        name="user"
        initialValue="academic"
        label={"Type of Usage"}
        extra={
          showExplanations ? (
            <>
              Will this license be used for academic or commercial purposes?
              Academic users receive a 40% discount off the standard price.
            </>
          ) : undefined
        }
      >
        <Radio.Group disabled={disabled}>
          <Space direction="vertical" style={{ margin: "5px 0" }}>
            <Radio value={"academic"}>
              Academic - students, teachers, academic researchers, non-profit
              organizations and hobbyists (40% discount)
            </Radio>
            <Radio value={"business"}>
              Business - for commercial business purposes
            </Radio>
          </Space>{" "}
        </Radio.Group>
      </Form.Item>
    );
  }

  function fixRangeSelector(range: DateRangeType): DateRangeType {
    // fixes the range to the start/end of day in the timezone of the user
    const [start, end] = range;
    const fixedStart =
      start != null ? startOfDay(toServerTime(start)) : undefined;
    let fixedEnd = end != null ? endOfDay(toServerTime(end)) : undefined;
    if (fixedStart != null && fixedEnd != null && fixedStart < serverTimeDate) {
      const diff = serverTimeDate.getTime() - fixedStart.getTime();
      fixedEnd = new Date(fixedEnd.getTime() + diff);
      // we don't care about changing fixedStart, because it's already in the past
    }
    const fixed: DateRangeType = [fixedStart, fixedEnd];
    return fixed;
  }

  function renderRangeSelector(getFieldValue) {
    const period = getFieldValue("period");
    if (period !== "range") return;
    return (
      <DateRange
        disabled={disabled}
        noPast
        maxDaysInFuture={365 * 4}
        style={{ margin: "5px 0 30px", textAlign: "center" }}
        initialValues={getFieldValue("range")}
        onChange={(range) => {
          range = fixRangeSelector(range);
          form.setFieldsValue({ range });
          onChange();
        }}
      />
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
    return ` (discount ${pct}%)`;
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
    return (
      <>
        You receive a discount if you pay for the license monthly or yearly via
        a{" "}
        <A href="/pricing/subscriptions" external>
          recurring subscription
        </A>
        . You can also pay once for a specific period of time. Licenses start at
        midnight in your local timezone on the start date and end at 23:59 your
        local time zone on the ending date.
      </>
    );
  }

  function renderDuration() {
    const init = duration === "range" ? "range" : "monthly";
    return (
      <>
        <Form.Item name="range" hidden={true}>
          <Input />
        </Form.Item>
        <Form.Item
          name="period"
          initialValue={init}
          label="Period"
          extra={renderDurationExplanation()}
        >
          <Radio.Group
            disabled={disabled}
            onChange={(e) => {
              form.setFieldsValue({ period: e.target.value });
            }}
          >
            <Space direction="vertical" style={{ margin: "5px 0" }}>
              {renderSubsOptions()}
              {renderRangeOption()}
            </Space>
          </Radio.Group>
        </Form.Item>

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
