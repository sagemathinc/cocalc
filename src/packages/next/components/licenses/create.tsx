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
          <Form.Item label="Title" name="title">
            <Input placeholder="Enter the title of your license" />
          </Form.Item>
          <Form.Item label="Description" name="description">
            <Input.TextArea placeholder="Describe your license" rows={2} />
          </Form.Item>
          <Form.Item name="period" hidden={true} initialValue={"monthly"}>
            <Input />
          </Form.Item>
          <Form.Item
            label="Period"
            extra={
              <>
                You get a discount if you pay for the license monthly or yearly
                via a recurring subscription. You can also pay once for a
                specific period of time. Licenses start at midnight in your
                local timezone on the start date and end at 23:59 your local
                time zone on the ending date.
              </>
            }
          >
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
          <Form.Item
            label="Run Limit"
            name="runLimit"
            initialValue={1}
            extra={
              <div style={{ marginTop: "5px" }}>
                Simultaneously run this many projects using this license. You,
                and anyone you share the license code with, can apply the
                license to an unlimited number of projects, but it will only be
                used up to the run limit. When{" "}
                <A href="https://doc.cocalc.com/teaching-instructors.html">
                  teaching a course
                </A>
                , the run limit is typically 2 more than the number of students.
              </div>
            }
          >
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
          <Form.Item
            label="Shared CPUs"
            name="sharedCores"
            initialValue={1}
            extra={
              <>
                <A href="https://cloud.google.com/compute/docs/faq#virtualcpu">
                  Google cloud vCPU's
                </A>{" "}
                shared with other projects. Member hosting significantly reduces
                competition for CPUs.
              </>
            }
          >
            <Slider marks={rangeMarks(1, 3)} min={1} max={3} />
          </Form.Item>
          <Form.Item
            label="Shared GB RAM"
            name="sharedRam"
            initialValue={1}
            extra={
              <>
                Each project using this license can use up to this many GB's of
                RAM. Note that RAM may be limited if many other users are using
                the same host, though member hosting significantly reduces
                competition for RAM.
              </>
            }
          >
            <Slider marks={rangeMarks(1, 16)} min={1} max={16} />
          </Form.Item>
          <Form.Item
            label="GB disk space"
            name="disk"
            initialValue={1}
            extra={
              <>
                Extra disk space lets you store a larger number of files.
                Snapshots and file edit history is included at no additional
                charge. Each licensed project receives this amount of extra
                storage space.
              </>
            }
          >
            <Slider marks={rangeMarks(1, 20)} min={1} max={20} />
          </Form.Item>
          <Form.Item
            initialValue={true}
            label="Member hosting"
            name="member"
            valuePropName="checked"
            extra={
              <>
                Member hosting enables network access, so licensed projects can
                connect to the Internet to clone git repositories, download data
                files, send emails, etc. It also significanlty reduces
                competition for resources, and we prioritize{" "}
                <A href="support/new" external>
                  support requests
                </A>{" "}
                much higher.
              </>
            }
          >
            <Checkbox />
          </Form.Item>
          <Form.Item
            initialValue={false}
            label="Always running"
            name="alwaysRunning"
            valuePropName="checked"
            extra={
              <>
                Once started your project stays running, so you can run very
                long computations and also never have to wait for your project
                to start. Without this, your project will stop if it is not
                actively being used. See{" "}
                <A href="https://doc.cocalc.com/project-init.html">
                  project init scripts
                </A>
                . (Note: this is NOT guaranteed 100% uptime, since projects may
                sometimes restart for security and maintenance reasons.)
              </>
            }
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
