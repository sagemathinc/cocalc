/*
Create a new license.
*/

import { Button, Checkbox, DatePicker, Input, Radio, Space } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import SiteName from "components/share/site-name";
import A from "components/misc/A";
import { CSSProperties, useState } from "react";
import IntegerSlider from "components/misc/integer-slider";
import moment from "moment";

export default function Create() {
  return (
    <div>
      <h3>Create a license</h3>
      <p>
        <A href="https://doc.cocalc.com/licenses.html">
          <SiteName /> licenses
        </A>{" "}
        allow you to upgrade any number of projects to run more quickly, have
        network access, more disk space, memory, or run on a dedicated computer.
      </p>
      <CreateLicense />
    </div>
  );
}

interface CreateLicenseProps {
  style: CSSProperties;
}

function CreateLicense({ style }: CreateLicenseProps) {
  const [creating, setCreating] = useState<boolean>(true);
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [subscription, setSubscription] = useState<boolean>(false);
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");
  const [runLimit, setRunLimit] = useState<number>(1);
  const [dateRange, setDateRange] = useState([
    moment(),
    moment().add(1, "month"),
  ]);
  return (
    <div style={{ style }}>
      <Button
        disabled={creating}
        type="primary"
        onClick={() => setCreating(true)}
      >
        <Icon name="plus-circle" /> Create New License...
      </Button>
      {creating && (
        <Space
          direction="vertical"
          style={{ width: "100%", marginTop: "15px" }}
        >
          Title
          <Input
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          Description
          <Input.TextArea
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
          <Checkbox
            checked={subscription}
            onChange={(e) => setSubscription(e.target.checked)}
          >
            Subscription
          </Checkbox>
          {subscription && (
            <Radio.Group
              style={{ marginLeft: "40px" }}
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
              }}
            >
              <Space direction="vertical">
                <Radio value={"monthly"}>Monthly</Radio>
                <Radio value={"yearly"}>Yearly</Radio>
              </Space>
            </Radio.Group>
          )}
          {!subscription && (
            <Space direction="vertical">
              Start and End Dates
              <DatePicker.RangePicker
                style={{ marginLeft: "30px" }}
                ranges={{
                  "This Week": [moment(), moment().add(1, "week")],
                  Week: [dateRange[0], dateRange[0].add(1, "week")],
                  Month: [dateRange[0], dateRange[0].add(1, "month")],
                  "Three Months": [dateRange[0], dateRange[0].add(3, "months")],
                  "Four Months": [dateRange[0], dateRange[0].add(4, "months")],
                  Year: [dateRange[0], dateRange[0].add(1, "year")],
                }}
                value={dateRange}
                onChange={(value) => {
                  console.log("value = ", value);
                  if (value == null || value[0] == null || value[1] == null)
                    return;
                  setDateRange(value);
                }}
              />
            </Space>
          )}
          Run Limit
          <IntegerSlider
            min={1}
            max={2000}
            onChange={setRunLimit}
            units={"projects"}
          />
        </Space>
      )}
    </div>
  );
}
