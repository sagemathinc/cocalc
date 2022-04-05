/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Create a new site license.
*/
import { Icon } from "@cocalc/frontend/components/icon";
import {
  get_local_storage,
  set_local_storage,
} from "@cocalc/frontend/misc/local-storage";
import {
  LicenseIdleTimeouts,
  requiresMemberhosting,
} from "@cocalc/util/consts/site-license";
import {
  Button,
  Checkbox,
  Divider,
  Form,
  Input,
  Popconfirm,
  Radio,
  Switch,
  Typography,
} from "antd";
import A from "components/misc/A";
import DateRange from "components/misc/date-range";
import IntegerSlider from "components/misc/integer-slider";
import Loading from "components/share/loading";
import SiteName from "components/share/site-name";
import apiPost from "lib/api/post";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { AddBox } from "./add-box";
import { computeCost, Cost } from "./site-license-cost";

const { Text, Paragraph } = Typography;

export default function Boost() {
  const router = useRouter();
  return (
    <div>
      <div style={{ maxWidth: "900px", margin: "auto" }}>
        <h3>
          <Icon name={"key"} style={{ marginRight: "5px" }} />{" "}
          {router.query.id != null
            ? "Edit Boost License in Shopping Cart"
            : "Buy a Boost License"}
        </h3>
        {router.query.id == null && (
          <p>
            <A href="https://doc.cocalc.com/licenses.html">
              <SiteName /> boost
            </A>{" "}
            is an addiiton to a Site License. Create a boost using the form
            below then add it to your <A href="/store/cart">shopping cart</A>.
          </p>
        )}
        <CreateBooster />
      </div>
    </div>
  );
}

// Note -- the back and forth between moment and Date below
// is a *workaround* because of some sort of bug in moment/antd/react.

function CreateBooster() {
  const [cost, setCost] = useState<Cost | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(false);
  const [cartError, setCartError] = useState<string>("");
  const [showExplanations, setShowExplanations] = useState<boolean>(true);
  const [shadowMember, setShadowMember] = useState<boolean | null>(null);
  const [form] = Form.useForm();
  const router = useRouter();
  // if we "edit", we don't have to check the confirmation
  const [confirmWarning, setConfirmWarning] = useState<boolean>(
    router.query.id != null
  );

  function onChange() {
    const conf = { ...form.getFieldsValue(true), boost: true };
    setCost(computeCost(conf));
  }

  useEffect(() => {
    const store_site_license_show_explanations = get_local_storage(
      "store_site_license_show_explanations"
    );
    if (store_site_license_show_explanations != null) {
      setShowExplanations(!!store_site_license_show_explanations);
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

  function memberExplanation(): JSX.Element | undefined {
    if (!showExplanations) return;
    return (
      <>
        The state of Member Hosting must match the corresponding Site License
        you want to boost.
      </>
    );
  }

  function idleTimeoutExplanation(): JSX.Element | undefined {
    if (!showExplanations) return;
    return (
      <>
        The Idle timeout of this Boost license must match the corresponding Site
        License you want to boost.
      </>
    );
  }

  function uptimeOptions(): JSX.Element[] {
    const ret: JSX.Element[] = [];
    for (const [key, it] of Object.entries(LicenseIdleTimeouts)) {
      ret.push(
        <Radio.Button key={key} value={key}>
          {it.label}
        </Radio.Button>
      );
    }
    ret.push(
      <Radio.Button key={"always_running"} value={"always_running"}>
        Always running
      </Radio.Button>
    );
    return ret;
  }

  function renderConfirmation() {
    return (
      <Form.Item wrapperCol={{ offset: 4, span: 16 }}>
        <div
          style={{
            border: confirmWarning ? "1px solid gray" : "3px solid red",
            borderRadius: "5px",
            padding: "10px",
            margin: confirmWarning ? "2px" : 0, // compensate border with from above
          }}
        >
          <Paragraph
            style={{
              opacity: confirmWarning ? 0.5 : 1,
            }}
          >
            Boost licenses only work in combination with regular Site Licenses.
            The intention of a Boost License is to increase how much resources
            your project can use, without having to purchase a new license. For
            example, it's perfectly fine if you need such a boost only for a
            couple of days, while otherwise you are happy with a smaller license
            as part of an ongoing subscription. The following conditions must be
            met in order to benefit from an activated boost license:
            <ul>
              <li>
                <Text strong>Activated Site License</Text>: the regular Site
                Licenses must be applied to the project and actively providing
                upgrades. This is evalulated each time a project starts. Boosts
                are added on top of this!
              </li>
              <li>
                <Text strong>Matching Configuration</Text>: there are different
                hosting qualities ("Member Hosting") and "Idle Timeout"
                durations. A booster only works for a site license with a
                matching upgrade quality.
              </li>
            </ul>
            Besides that – just like with regular licenses – you can't exceed
            the run limit, the boost license must be valid, and combining all
            upgrades and boosts together, you cannot exceed the overall upgrade
            limits. If you need vastly more resources, consider purchasing a{" "}
            <Link href={"./dedicated"} scroll={false}>
              Dedicated VM
            </Link>
            .
          </Paragraph>
          <div>
            <Paragraph
              style={{
                marginTop: "20px",
                textAlign: "center",
                fontWeight: confirmWarning ? "inherit" : "bold",
                cursor: "pointer",
              }}
              onClick={() => setConfirmWarning(!confirmWarning)}
            >
              Yes, I understand:{" "}
              <Switch onChange={setConfirmWarning} checked={confirmWarning} />
            </Paragraph>
          </div>
        </div>
      </Form.Item>
    );
  }

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
        {renderConfirmation()}
        <Form.Item wrapperCol={{ offset: 0, span: 24 }}>
          <div style={{ float: "right" }}>
            <Switch
              checked={showExplanations}
              onChange={(show) => {
                setShowExplanations(show);
                // ugly and ignores basePath -- change later:
                set_local_storage(
                  "store_site_license_show_explanations",
                  show ? "t" : ""
                );
              }}
            />{" "}
            Show explanations
          </div>
        </Form.Item>
        {/* Hidden form item, used to disambiguate between boost and regular licenses */}
        <Form.Item name="type" initialValue={"boost"} noStyle>
          <Input type="hidden" />
        </Form.Item>
        <Divider plain>Usage and Duration</Divider>
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
          <Radio.Group disabled={!confirmWarning}>
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
            disabled={!confirmWarning}
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
                maxDaysInFuture={365 * 4}
                style={{ margin: "5px 0 30px", textAlign: "center" }}
                onChange={(range) => {
                  form.setFieldsValue({ range });
                  onChange();
                }}
              />
            ) : null
          }
        </Form.Item>
        <Divider plain>Matching Site License Configuration</Divider>
        <Form.Item
          initialValue={true}
          label="Member hosting"
          name="member"
          valuePropName="checked"
          dependencies={["uptime"]}
          rules={[
            ({ getFieldValue, setFieldsValue }) => ({
              validator: (_, value) => {
                // we force member true if the uptime is higher than medium
                const uptime = getFieldValue("uptime");
                if (requiresMemberhosting(uptime)) {
                  if (value !== true) {
                    setShadowMember(value);
                    setFieldsValue({ member: true });
                  }
                } else {
                  // if the user toggles back to a lower idle timeout,
                  // we use shadowMember to restore the previous member value.
                  if (shadowMember != null) {
                    setFieldsValue({ member: shadowMember });
                    setShadowMember(null);
                  }
                }
              },
            }),
          ]}
          extra={memberExplanation()}
        >
          <Checkbox
            disabled={
              !confirmWarning ||
              requiresMemberhosting(form.getFieldValue("uptime"))
            }
          >
            Run project on a much better host with network access
          </Checkbox>
        </Form.Item>
        <Form.Item
          initialValue="short"
          name="uptime"
          label="Idle timeout"
          valuePropName="uptime"
          extra={idleTimeoutExplanation()}
        >
          <Radio.Group
            disabled={!confirmWarning}
            defaultValue={"short"}
            onChange={(e) => {
              form.setFieldsValue({ uptime: e.target.value });
              onChange();
            }}
          >
            {uptimeOptions()}
          </Radio.Group>
        </Form.Item>
        <Divider plain>Boost</Divider>
        <Form.Item
          label="GB shared RAM"
          name="ram"
          initialValue={0}
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
            disabled={!confirmWarning}
            min={0}
            max={16}
            onChange={(ram) => {
              form.setFieldsValue({ ram });
              onChange();
            }}
            units={"GB RAM"}
            presets={[0, 2, 4, 8, 12, 16]}
          />
        </Form.Item>{" "}
        <Form.Item
          label="Shared CPUs"
          name="cpu"
          initialValue={0}
          extra={
            showExplanations ? (
              <>
                <A href="https://cloud.google.com/compute/docs/faq#virtualcpu">
                  Google cloud vCPU's.
                </A>{" "}
                To keep prices low, these vCPU's may be shared with other
                projects, though member hosting very significantly reduces
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
            disabled={!confirmWarning}
            min={0}
            max={3}
            onChange={(cpu) => {
              form.setFieldsValue({ cpu });
              onChange();
            }}
            units={"vCPU"}
            presets={[0, 1, 2, 3]}
          />
        </Form.Item>
        <Form.Item
          label="GB disk space"
          name="disk"
          initialValue={0}
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
            disabled={!confirmWarning}
            min={0}
            max={15}
            onChange={(disk) => {
              form.setFieldsValue({ disk });
              onChange();
            }}
            units={"GB Disk"}
            presets={[0, 4, 8, 10, 15]}
          />
        </Form.Item>
        <Divider plain>
          Maximum number of simultaneously boosted projects
        </Divider>
        <Form.Item
          label="Run Limit"
          name="run_limit"
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
                ,{" "}
                <b>
                  <i>
                    the run limit is typically 2 more than the number of
                    students
                  </i>
                </b>
                .
              </div>
            ) : undefined
          }
        >
          <EditRunLimit
            disabled={!confirmWarning}
            onChange={(run_limit) => {
              form.setFieldsValue({ run_limit });
              onChange();
            }}
          />
        </Form.Item>
        <Divider plain>Customizable Identifications</Divider>
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
        </Form.Item>
        <Form.Item wrapperCol={{ offset: 0, span: 24 }}>
          <AddBox
            cost={cost}
            router={router}
            form={form}
            cartError={cartError}
            setCartError={setCartError}
          />
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

export function EditRunLimit({
  value,
  onChange,
  disabled = false,
}: {
  value?;
  onChange?;
  disabled?;
}) {
  return (
    <IntegerSlider
      disabled={disabled}
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
