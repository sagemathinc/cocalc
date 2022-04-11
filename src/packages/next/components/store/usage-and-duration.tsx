/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { endOfDay, startOfDay } from "@cocalc/util/stripe/timecalcs";
import { Divider, Form, Input, Radio, Space } from "antd";
import A from "components/misc/A";
import DateRange from "components/misc/date-range";

export function UsageAndDuration({
  showExplanations,
  form,
  onChange,
  disabled = false,
}) {
  return (
    <>
      <Divider plain>Usage and Duration</Divider>
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
      <Form.Item
        name="period"
        initialValue={"monthly"}
        label="Period"
        extra={
          showExplanations ? (
            <>
              You receive a discount if you pay for the license monthly or
              yearly via a{" "}
              <A href="/pricing/subscriptions" external>
                recurring subscription
              </A>
              . You can also pay once for a specific period of time. Licenses
              start at midnight in your local timezone on the start date and end
              at 23:59 your local time zone on the ending date.
            </>
          ) : undefined
        }
      >
        <Radio.Group
          disabled={disabled}
          onChange={(e) => {
            form.setFieldsValue({ period: e.target.value });
          }}
        >
          <Space direction="vertical" style={{ margin: "5px 0" }}>
            <Radio value={"monthly"}>Monthly Subscription (10% discount)</Radio>
            <Radio value={"yearly"}>Yearly Subscription (15% discount)</Radio>
            <Radio value={"range"}>Specific Start and End Dates</Radio>
          </Space>
        </Radio.Group>
      </Form.Item>
      <Form.Item name="range" hidden={true}>
        <Input />
      </Form.Item>
      <Form.Item
        noStyle
        shouldUpdate={(prevValues, currentValues) =>
          prevValues.period !== currentValues.period
        }
      >
        {({ getFieldValue }) =>
          getFieldValue("period") == "range" ? (
            <DateRange
              disabled={disabled}
              noPast
              maxDaysInFuture={365 * 4}
              style={{ margin: "5px 0 30px", textAlign: "center" }}
              initialValues={getFieldValue("range")}
              onChange={(range) => {
                // fixes the range to the start/end of day in the timezone of the user
                const [start, end] = range;
                range = [
                  start != null ? startOfDay(start) : undefined,
                  end != null ? endOfDay(end) : undefined,
                ];
                form.setFieldsValue({ range });
                onChange();
              }}
            />
          ) : null
        }
      </Form.Item>
    </>
  );
}
