/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { isAcademic } from "@cocalc/util/misc";
import { Subscription } from "@cocalc/util/licenses/purchase/types";
import { Divider, Form, Input, Radio, Space } from "antd";
import DateRange from "components/misc/date-range";
import { ReactNode } from "react";
import useProfile from "lib/hooks/profile";

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

function getTimezoneFromDate(date: Date, format: 'long'|'short'='long'): string {
  return Intl.DateTimeFormat(undefined, {
    timeZoneName: format,
  }).formatToParts(date)
    .find(x => x.type === 'timeZoneName')
    ?.value || '';
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

  const profile = useProfile();

  function renderUsage() {
    if (!showUsage) return;
    return (
      <Form.Item
        name="user"
        initialValue={
          isAcademic(profile?.email_address) ? "academic" : "business"
        }
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
            <Radio value={"business"}>Business - for commercial purposes</Radio>
            <Radio value={"academic"}>
              Academic - students, teachers, academic researchers, non-profit
              organizations and hobbyists (40% discount)
            </Radio>
          </Space>{" "}
        </Radio.Group>
      </Form.Item>
    );
  }

  function renderRangeSelector(getFieldValue) {
    const period = getFieldValue("period");
    if (period !== "range") return;
    const range = getFieldValue("range");
    const invalidRange = range?.[0] == null || range?.[1] == null;
    return (
      <Form.Item label="License Term"
                 name="range"
                 rules={[{ required: true }]}
                 help={invalidRange ? "Please enter a valid license range." : ""}
                 validateStatus={invalidRange ? "error" : "success"}
                 style={{ paddingBottom: "30px" }}
      >
        <DateRange
          disabled={disabled}
          noPast
          maxDaysInFuture={365 * 4}
          style={{ marginTop: "5px" }}
          initialValues={getFieldValue("range")}
          onChange={(range) => {
            form.setFieldsValue({ range });
            onChange();
          }}
          suffix={(range && range[0]) && `(${getTimezoneFromDate(range[0] as Date, 'long')})`}
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

  //   function renderSubsDiscount(duration: Subscription) {
  //     if (!discount) return;
  //     const pct = Math.round(100 * (1 - COSTS.sub_discount[duration]));
  //     return ` (discount ${pct}%)`;
  //   }
  function renderSubsDiscount(_duration: Subscription) {
    return null;
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
        You can buy a license either via a subscription or a single purchase for
        specific dates. Once you purchase a license,{" "}
        <b>you can always edit it later, or cancel it for a prorated refund</b>{" "}
        as credit that you can use to purchase something else.{" "}
        {duration == "range" && (
          <i>
            Licenses start and end at the indicated times in your local
            timezone.
          </i>
        )}
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
          <Radio.Group disabled={disabled}>
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
