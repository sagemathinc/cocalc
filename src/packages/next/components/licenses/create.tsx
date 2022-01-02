/*
Create a new license.
*/

import {
  Button,
  Checkbox,
  DatePicker,
  Form,
  Input,
  Radio,
  Slider,
  Space,
} from "antd";
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

function rangeMarks(min, max) {
  const marks: { [i: number]: string } = {};
  for (let i = min; i <= max; i++) {
    marks[i] = `${i}`;
  }
  return marks;
}

function DateRange({ onChange }) {
  const [dateRange, setDateRange] = useState<
    [Date | undefined, Date | undefined]
  >([undefined, undefined]);
  return (
    <div style={{ margin: "5px 0 30px", textAlign: "center" }}>
      <DatePicker.RangePicker
        allowEmpty={[true, true]}
        ranges={{
          Week: [moment(), moment().add(1, "week")],
          Month: [moment(), moment().add(1, "month")],
          Year: [moment(), moment().add(1, "year")],
          "+ Week": [moment(dateRange[0]), moment(dateRange[0]).add(1, "week")],
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
        value={
          [
            dateRange[0] ? moment(dateRange[0]) : undefined,
            dateRange[1] ? moment(dateRange[1]) : undefined,
          ] as any
        }
        onChange={(value) => {
          const x = [value?.[0]?.toDate(), value?.[1]?.toDate()];
          setDateRange(x);
          onChange(x);
        }}
      />
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

  const [subscription, setSubscription] = useState<boolean>(false);
  const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");
  const [runLimit, setRunLimit] = useState<number>(1);

  const [form] = Form.useForm();

  function onFinish(...args) {
    console.log("onFinish", ...args);
  }
  function onFinishFailed() {}

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
        <Form
          form={form}
          style={{ marginTop: "30px" }}
          name="basic"
          labelCol={{ span: 5 }}
          wrapperCol={{ span: 19 }}
          onFinish={onFinish}
          onFinishFailed={onFinishFailed}
          autoComplete="off"
        >
          <Form.Item label="Title" name="title" required>
            <Input placeholder="Title" />
          </Form.Item>
          <Form.Item label="Description" name="description">
            <Input.TextArea placeholder="Description" rows={2} />
          </Form.Item>
          <Form.Item name="period" hidden={true} initialValue={"monthly"}>
            <Input />
          </Form.Item>
          <Form.Item label="Period">
            <Radio.Group
              defaultValue={"monthly"}
              onChange={(e) => {
                form.setFieldsValue({ period: e.target.value });
              }}
            >
              <Radio value={"monthly"}>
                Recurring Monthly Subscription (10% discount)
              </Radio>
              <Radio value={"yearly"}>
                Recurring Yearly Subscription (15% discount)
              </Radio>
              <Radio value={"range"}>Specific Start and End Dates</Radio>
            </Radio.Group>{" "}
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
                  onChange={(range) => {
                    form.setFieldsValue({ range });
                  }}
                />
              ) : null
            }
          </Form.Item>
          <Form.Item label="Run Limit" name="runLimit" initialValue={1}>
            <div
              style={{
                border: "1px solid #ddd",
                padding: "10px",
                borderRadius: "3px",
              }}
            >
              <IntegerSlider
                min={1}
                max={1000}
                onChange={(runLimit) => {
                  form.setFieldsValue({ runLimit });
                }}
                units={"projects"}
                presets={[1, 2, 10, 50, 100, 250]}
              />
            </div>
          </Form.Item>
          <Form.Item label="Shared CPUs" name="sharedCores" initialValue={1}>
            <Slider marks={rangeMarks(1, 3)} min={1} max={3} />
          </Form.Item>
          <Form.Item label="Shared GB RAM" name="sharedRam" initialValue={1}>
            <Slider marks={rangeMarks(1, 16)} min={1} max={16} />
          </Form.Item>
          <Form.Item label="GB disk space" name="disk" initialValue={1}>
            <Slider marks={rangeMarks(1, 20)} min={1} max={20} />
          </Form.Item>
          <Form.Item
            initialValue={true}
            label="Member hosting"
            name="member"
            valuePropName="checked"
          >
            <Checkbox />
          </Form.Item>
          <Form.Item
            initialValue={false}
            label="Always running"
            name="alwaysRunning"
            valuePropName="checked"
          >
            <Checkbox />
          </Form.Item>
          <Form.Item
            wrapperCol={{ offset: 4, span: 20 }}
            style={{ marginTop: "50px" }}
          >
            <Button
              style={{ marginRight: "5px" }}
              onClick={() => {
                setCreating(false);
              }}
            >
              Cancel
            </Button>
            <Button type="primary" htmlType="submit">
              Create License
            </Button>
            <Button
              type="dashed"
              style={{ float: "right" }}
              onClick={() => form.resetFields()}
            >
              Reset Form
            </Button>
          </Form.Item>
        </Form>
      )}
    </div>
  );
}
