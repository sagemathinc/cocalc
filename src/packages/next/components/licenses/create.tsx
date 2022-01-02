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
  style?: CSSProperties;
}

// Note -- the back and forth between moment and Date below
// is a *workaround* because of some sort of bug in moment/antd/react.

function CreateLicense({ style }: CreateLicenseProps) {
  const [creating, setCreating] = useState<boolean>(true);
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [subscription, setSubscription] = useState<boolean>(false);
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");
  const [runLimit, setRunLimit] = useState<number>(1);
  const [dateRange, setDateRange] = useState<
    [Date | undefined, Date | undefined]
  >([new Date(), moment(new Date()).add(1, "month").toDate()]);
  return (
    <div style={style}>
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
          <div style={{ marginLeft: "30px" }}>
            <Input
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          Description
          <div style={{ marginLeft: "30px" }}>
            <Input.TextArea
              placeholder="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          Period of Time
          <Space direction="vertical" style={{ marginLeft: "30px" }}>
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
                  allowEmpty={[true, true]}
                  style={{ marginLeft: "30px" }}
                  ranges={{
                    Week: [moment(), moment().add(1, "week")],
                    Month: [moment(), moment().add(1, "month")],
                    Year: [moment(), moment().add(1, "year")],
                    "+ Week": [
                      moment(dateRange[0]),
                      moment(dateRange[0]).add(1, "week"),
                    ],
                    "+ Month": [
                      moment(dateRange[0]),
                      moment(dateRange[0]).add(1, "month"),
                    ],
                    "+ Three Months": [
                      moment(dateRange[0]),
                      moment(dateRange[0]).add(3, "months"),
                    ],
                    "+ Four Months": [
                      moment(dateRange[0]),
                      moment(dateRange[0]).add(4, "months"),
                    ],
                  }}
                  value={[
                    dateRange[0] ? moment(dateRange[0]) : undefined,
                    dateRange[1] ? moment(dateRange[1]) : undefined,
                  ] as any}
                  onChange={(value) => {
                    setDateRange([value?.[0]?.toDate(), value?.[1]?.toDate()]);
                  }}
                />
              </Space>
            )}
          </Space>
          Run Limit
          <div
            style={{
              marginLeft: "30px",
              border: "1px solid #eee",
              padding: "10px",
              borderRadius: "5px",
            }}
          >
            <IntegerSlider
              min={1}
              max={2000}
              value={runLimit}
              onChange={setRunLimit}
              units={"projects"}
              presets={[1, 2, 10, 50, 100, 250]}
            />
          </div>
        </Space>
      )}
    </div>
  );
}
