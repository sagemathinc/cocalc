/*
Create a new site license.
*/
import { Icon } from "@cocalc/frontend/components/icon";

import {
  Alert,
  Button,
  Checkbox,
  Form,
  Input,
  Popconfirm,
  Radio,
  Switch,
} from "antd";
import SiteName from "components/share/site-name";
import A from "components/misc/A";
import { CSSProperties, useEffect, useState } from "react";
import IntegerSlider from "components/misc/integer-slider";
import DateRange from "components/misc/date-range";
import { computeCost, Cost, DisplayCost } from "./site-license-cost";
import apiPost from "lib/api/post";

export default function Create() {
  return (
    <div>
      <h3>
        <Icon name={"key"} style={{ marginRight: "5px" }} /> Site Licenses
      </h3>
      <p>
        <A href="https://doc.cocalc.com/licenses.html">
          <SiteName /> site licenses
        </A>{" "}
        allow you to upgrade any number of projects to run more quickly, have
        network access, more disk space, memory, or run on a dedicated computer.
        Site licenses can be a wide range of sizes, ranging from a single
        hobbyist to thousands of simultaneous users across an entire department
        of school. You can create a license now via the form below, add it to
        your shopping cart, and check out later.
      </p>
      <CreateLicense />
    </div>
  );
}

// function rangeMarks(min, max) {
//   const marks: { [i: number]: string } = {};
//   for (let i = min; i <= max; i++) {
//     marks[i] = `${i}`;
//   }
//   return marks;
// }

interface CreateLicenseProps {
  style?: CSSProperties;
}

// Note -- the back and forth between moment and Date below
// is a *workaround* because of some sort of bug in moment/antd/react.

function CreateLicense({ style }: CreateLicenseProps) {
  const [cost, setCost] = useState<Cost | undefined>(undefined);
  const [cartError, setCartError] = useState<string>("");
  const [showExplanations, setShowExplanations] = useState<boolean>(true);
  const [form] = Form.useForm();

  function onFinish(...args) {
    console.log("onFinish", ...args);
  }
  function onFinishFailed(...args) {
    console.log("onFinishFail", ...args);
  }

  function onChange() {
    setCost(computeCost(form.getFieldsValue(true)));
  }

  useEffect(() => {
    onChange();
  }, []);

  async function addToCart() {
    const description = form.getFieldsValue(true);
    try {
      setCartError("");
      await apiPost("/shopping/cart/add", {
        product: "site-license",
        description,
      });
    } catch (err) {
      setCartError(err.message);
    }
  }

  return (
    <div style={style}>
      <div>
        <Switch checked={showExplanations} onChange={setShowExplanations} />{" "}
        Show explanations
      </div>
      <br />
      {cost && (
        <div
          style={{
            position: "fixed",
            top: 5,
            right: 5,
            maxWidth: "400px",
            background: "white",
            zIndex: 1,
            border: "1px solid #ccc",
            boxShadow: "4px 4px 2px #ddd",
            padding: "10px 20px",
            borderRadius: "5px",
          }}
        >
          <Icon
            name={"times"}
            style={{ float: "right", cursor: "pointer" }}
            onClick={() => setCost(undefined)}
          />

          <b>Edit license below</b>
          <br />
          <DisplayCost cost={cost} />
          <div style={{ textAlign: "center" }}>
            <Button
              size="large"
              type="primary"
              htmlType="submit"
              style={{ marginTop: "5px" }}
              onClick={() => addToCart()}
            >
              Add to Cart
            </Button>
            {cartError && <Alert type="error" message={cartError} />}
          </div>
        </div>
      )}
      <Form
        form={form}
        style={{ marginTop: "15px", maxWidth: "900px", margin: "auto" }}
        name="basic"
        labelCol={{ span: 4 }}
        wrapperCol={{ span: 20 }}
        onFinish={onFinish}
        onFinishFailed={onFinishFailed}
        autoComplete="off"
        onChange={onChange}
      >
        <Form.Item name="user" hidden={true} initialValue={"academic"}>
          <Input />
        </Form.Item>
        <Form.Item
          label="Type of Usage"
          extra={
            showExplanations ? (
              <>
                Will this license be used for academic or commercial purposes?
                Academic users receive a 40% discount off the standard price.
              </>
            ) : undefined
          }
        >
          <Radio.Group
            defaultValue={"academic"}
            onChange={(e) => {
              form.setFieldsValue({ user: e.target.value });
            }}
          >
            <Radio value={"academic"}>
              Academic - students, teachers, academic researchers, non-profit
              organizations and hobbyists (40% discount)
            </Radio>
            <Radio value={"business"}>
              Business - for commercial business purposes
            </Radio>
          </Radio.Group>
        </Form.Item>
        <Form.Item name="period" hidden={true} initialValue={"monthly"}>
          <Input />
        </Form.Item>
        <Form.Item
          label="Period"
          extra={
            showExplanations ? (
              <>
                You receive a discount if you pay for the license monthly or
                yearly via a recurring subscription. You can also pay once for a
                specific period of time. Licenses start at midnight in your
                local timezone on the start date and end at 23:59 your local
                time zone on the ending date.
              </>
            ) : undefined
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
                style={{ margin: "5px 0 30px", textAlign: "center" }}
                onChange={(range) => {
                  form.setFieldsValue({ range });
                  onChange();
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
            showExplanations ? (
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
            ) : undefined
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
              max={300}
              maxText={10000}
              onChange={(runLimit) => {
                form.setFieldsValue({ runLimit });
                onChange();
              }}
              units={"projects"}
              presets={[1, 2, 10, 50, 100, 250, 500]}
            />
          </div>
        </Form.Item>
        <Form.Item
          label="Shared CPUs"
          name="sharedCores"
          initialValue={1}
          extra={
            showExplanations ? (
              <>
                <A href="https://cloud.google.com/compute/docs/faq#virtualcpu">
                  Google cloud vCPU's.
                </A>{" "}
                Note that to keep prices low, these vCPU's may be shared with
                other projects, though member hosting very significantly reduces
                competition for CPUs. We also offer{" "}
                <A external href="https://cocalc.com/pricing/dedicated">
                  dedicated virtual machines
                </A>{" "}
                with more CPU options.
              </>
            ) : undefined
          }
        >
          {/*<Slider marks={rangeMarks(1, 3)} min={1} max={3} /> */}
          <IntegerSlider
            min={1}
            max={3}
            onChange={(sharedCores) => {
              form.setFieldsValue({ sharedCores });
              onChange();
            }}
            units={"vCPU"}
            presets={[1, 2, 3]}
          />
        </Form.Item>
        <Form.Item
          label="GB shared RAM"
          name="sharedRam"
          initialValue={1}
          extra={
            showExplanations ? (
              <>
                Each project using this license can use up to this many GB's of
                RAM. Note that RAM may be limited if many other users are using
                the same host, though member hosting significantly reduces
                competition for RAM. We also offer{" "}
                <A external href="https://cocalc.com/pricing/dedicated">
                  dedicated virtual machines
                </A>{" "}
                with larger memory options.
              </>
            ) : undefined
          }
        >
          {/*<Slider marks={rangeMarks(1, 16)} min={1} max={16} /> */}
          <IntegerSlider
            min={1}
            max={16}
            onChange={(sharedRam) => {
              form.setFieldsValue({ sharedRam });
              onChange();
            }}
            units={"GB RAM"}
            presets={[1, 2, 8, 16]}
          />
        </Form.Item>
        <Form.Item
          label="GB disk space"
          name="disk"
          initialValue={1}
          extra={
            showExplanations ? (
              <>
                Extra disk space lets you store a larger number of files.
                Snapshots and file edit history is included at no additional
                charge. Each licensed project receives this amount of extra
                storage space. We also offer much larger{" "}
                <A external href="https://cocalc.com/pricing/dedicated">
                  dedicated disks and SSD's
                </A>
                .
              </>
            ) : undefined
          }
        >
          {/*<Slider marks={rangeMarks(1, 20)} min={1} max={20} />*/}
          <IntegerSlider
            min={1}
            max={20}
            onChange={(disk) => {
              form.setFieldsValue({ disk });
              onChange();
            }}
            units={"GB Disk"}
            presets={[1, 4, 8, 16, 20]}
          />
        </Form.Item>
        <Form.Item
          initialValue={true}
          label="Member hosting"
          name="member"
          valuePropName="checked"
          extra={
            showExplanations ? (
              <>
                Member hosting significanlty reduces competition for resources,
                and we prioritize{" "}
                <A href="support/new" external>
                  support requests
                </A>{" "}
                much higher. All licensed projects, with or without member
                hosting, have network access, so they can connect to the network
                to clone git repositories, download data files and install
                software.
              </>
            ) : undefined
          }
        >
          <Checkbox>
            Run project on a much better host with network access
          </Checkbox>
        </Form.Item>
        <Form.Item
          initialValue={false}
          label="Always running"
          name="alwaysRunning"
          valuePropName="checked"
          extra={
            showExplanations ? (
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
            ) : undefined
          }
        >
          <Checkbox>Keep projects running</Checkbox>
        </Form.Item>
        <Form.Item
          label="Title (optional)"
          name="title"
          style={{ width: "100%" }}
          extra={
            showExplanations ? (
              <>
                Given your license a title makes it easier to keep track of. You
                can change it at any time.
              </>
            ) : undefined
          }
        >
          <Input placeholder="Enter the title of your license" />
        </Form.Item>
        <Form.Item
          label="Description (optional)"
          name="description"
          extra={
            showExplanations ? (
              <>
                Given your license a longer description to record extra
                information that isn't always shown with the license. You can
                change this at any time.
              </>
            ) : undefined
          }
        >
          <Input.TextArea placeholder="Describe your license" rows={2} />
        </Form.Item>{" "}
        <Form.Item wrapperCol={{ offset: 4, span: 20 }}>
          <Popconfirm
            title="Reset all values to their default?"
            onConfirm={() => {
              form.resetFields();
              onChange();
            }}
          >
            <Button style={{ marginRight: "5px" }} type="dashed">
              Reset Form
            </Button>
          </Popconfirm>
        </Form.Item>
      </Form>
    </div>
  );
}
