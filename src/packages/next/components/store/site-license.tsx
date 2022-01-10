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
import { useEffect, useState } from "react";
import IntegerSlider from "components/misc/integer-slider";
import DateRange from "components/misc/date-range";
import { computeCost, Cost, DisplayCost } from "./site-license-cost";
import apiPost from "lib/api/post";
import { useRouter } from "next/router";
import Loading from "components/share/loading";

export default function Create() {
  const router = useRouter();
  return (
    <div>
      <div style={{ maxWidth: "900px", margin: "auto" }}>
        <h3>
          <Icon name={"key"} style={{ marginRight: "5px" }} />{" "}
          {router.query.id != null
            ? "Edit Site License in Shopping Cart"
            : "Buy a Site License"}
        </h3>
        {router.query.id == null && (
          <p>
            <A href="https://doc.cocalc.com/licenses.html">
              <SiteName /> site licenses
            </A>{" "}
            allow you to upgrade any number of projects to run more quickly,
            have network access, more disk space, memory, or run on a dedicated
            computer. Site licenses can be for a wide range of sizes, ranging
            from a single hobbyist project to thousands of simultaneous users
            across an entire department of school. Create a license using the
            form below then add it to your{" "}
            <A href="/store/cart">shopping cart</A>.
          </p>
        )}
        <CreateLicense />
      </div>
    </div>
  );
}

// Note -- the back and forth between moment and Date below
// is a *workaround* because of some sort of bug in moment/antd/react.

function CreateLicense() {
  const [cost, setCost] = useState<Cost | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(false);
  const [cartError, setCartError] = useState<string>("");
  const [showExplanations, setShowExplanations] = useState<boolean>(true);
  const [form] = Form.useForm();
  const router = useRouter();

  function onChange() {
    setCost(computeCost(form.getFieldsValue(true)));
  }

  useEffect(() => {
    if (window.localStorage.store_site_license_show_explanations != null) {
      setShowExplanations(
        !!window.localStorage.store_site_license_show_explanations
      );
    }
    const { id } = router.query;
    if (id != null) {
      // editing something in the shopping cart
      (async () => {
        let item;
        try {
          setLoading(true);
          item = await apiPost("/shopping/cart/get", { id });
        } catch (err) {
          setCartError(err.message);
        } finally {
          setLoading(false);
        }
        if (item.product == "site-license") {
          form.setFieldsValue(item.description);
        }
        onChange();
      })();
    }
    onChange();
  }, []);

  if (loading) {
    return <Loading large center />;
  }

  async function addToCart() {
    const description = form.getFieldsValue(true);
    try {
      setCartError("");
      if (router.query.id != null) {
        await apiPost("/shopping/cart/edit", {
          id: router.query.id,
          description,
        });
      } else {
        await apiPost("/shopping/cart/add", {
          product: "site-license",
          description,
        });
      }
      router.push("/store/cart");
    } catch (err) {
      setCartError(err.message);
    }
  }

  const addBox = cost ? (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          display: "inline-block",
          maxWidth: "400px",
          background: "white",
          border: "1px solid #ccc",
          padding: "10px 20px",
          borderRadius: "5px",
          margin: "15px 0",
          fontSize: "12pt",
        }}
      >
        <DisplayCost cost={cost} />
        <div style={{ textAlign: "center" }}>
          {router.query.id != null && (
            <Button
              size="large"
              style={{ marginRight: "5px" }}
              onClick={() => router.push("/store/cart")}
            >
              Cancel
            </Button>
          )}
          <Button
            size="large"
            type="primary"
            htmlType="submit"
            style={{ marginTop: "5px" }}
            onClick={() => addToCart()}
          >
            {router.query.id != null ? "Save Changes" : "Add to Cart"}
          </Button>
          {cartError && <Alert type="error" message={cartError} />}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div>
      <Form
        form={form}
        style={{
          marginTop: "15px",
          maxWidth: "900px",
          margin: "auto",
          border: "1px solid #ddd",
          padding: "15px",
        }}
        name="basic"
        labelCol={{ span: 6 }}
        wrapperCol={{ span: 18 }}
        autoComplete="off"
        onChange={onChange}
      >
        <Form.Item wrapperCol={{ offset: 0, span: 24 }}>{addBox}</Form.Item>
        <Form.Item wrapperCol={{ offset: 0, span: 24 }}>
          <div style={{ float: "right" }}>
            <Switch
              checked={showExplanations}
              onChange={(show) => {
                setShowExplanations(show);
                // ugly and ignores basePath -- change later:
                window.localStorage.store_site_license_show_explanations = show
                  ? "t"
                  : "";
              }}
            />{" "}
            Show explanations
          </div>
        </Form.Item>
        <Form.Item
          name="user"
          initialValue="academic"
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
          <Radio.Group>
            <Radio value={"academic"}>
              Academic - students, teachers, academic researchers, non-profit
              organizations and hobbyists (40% discount)
            </Radio>
            <Radio value={"business"}>
              Business - for commercial business purposes
            </Radio>
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
                start at midnight in your local timezone on the start date and
                end at 23:59 your local time zone on the ending date.
              </>
            ) : undefined
          }
        >
          <Radio.Group
            onChange={(e) => {
              form.setFieldsValue({ period: e.target.value });
            }}
          >
            <Radio value={"monthly"}>Monthly Subscription (10% discount)</Radio>
            <Radio value={"yearly"}>Yearly Subscription (15% discount)</Radio>
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
                noPast
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
        </Form.Item>{" "}
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
          <IntegerSlider
            min={1}
            max={15}
            onChange={(disk) => {
              form.setFieldsValue({ disk });
              onChange();
            }}
            units={"GB Disk"}
            presets={[1, 4, 8, 10, 15]}
          />
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
          <EditRunLimit
            onChange={(runLimit) => {
              form.setFieldsValue({ runLimit });
              onChange();
            }}
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
          label="Title"
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
          <Input placeholder="Enter the title of your license (optional)" />
        </Form.Item>
        <Form.Item
          label="Description"
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
          <Input.TextArea
            placeholder="Describe your license (optional)"
            rows={2}
          />
        </Form.Item>{" "}
        <Form.Item wrapperCol={{ offset: 0, span: 24 }}>
          {addBox}
          {router.query.id == null && (
            <Popconfirm
              title="Reset all values to their default?"
              onConfirm={() => {
                form.resetFields();
                onChange();
              }}
            >
              <Button style={{ float: "right" }}>Reset Form</Button>
            </Popconfirm>
          )}
        </Form.Item>
      </Form>
    </div>
  );
}

export function EditRunLimit({ value, onChange }: { value?; onChange? }) {
  return (
    <IntegerSlider
      value={value}
      min={1}
      max={300}
      maxText={10000}
      onChange={onChange}
      units={"projects"}
      presets={[1, 2, 10, 50, 100, 250, 500]}
    />
  );
}
