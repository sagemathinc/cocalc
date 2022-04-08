/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Create a new site license.
*/
import { Icon } from "@cocalc/frontend/components/icon";
import { get_local_storage } from "@cocalc/frontend/misc/local-storage";
import { endOfDay, startOfDay } from "@cocalc/util/stripe/timecalcs";
import { Divider, Form, Input, Radio, Space } from "antd";
import A from "components/misc/A";
import DateRange from "components/misc/date-range";
import IntegerSlider from "components/misc/integer-slider";
import Loading from "components/share/loading";
import SiteName from "components/share/site-name";
import apiPost from "lib/api/post";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { AddBox } from "./add-box";
import { MemberHostingAndIdleTimeout } from "./member-idletime";
import { Reset } from "./reset";
import { RunLimit } from "./run-limit";
import { computeCost, Cost } from "./site-license-cost";
import { TitleDescription } from "./title-description";
import { ToggleExplanations } from "./toggle-explanations";

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
  const [shadowMember, setShadowMember] = useState<boolean | null>(null);
  const [form] = Form.useForm();
  const router = useRouter();

  function onChange() {
    setCost(computeCost(form.getFieldsValue(true)));
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
        try {
          setLoading(true);
          const item = await apiPost("/shopping/cart/get", { id });
          if (item.product == "site-license") {
            form.setFieldsValue(item.description);
          }
        } catch (err) {
          setCartError(err.message);
        } finally {
          setLoading(false);
        }
        onChange();
      })();
    }
    onChange();
  }, []);

  if (loading) {
    return <Loading large center />;
  }

  const addBox = (
    <AddBox
      cost={cost}
      router={router}
      form={form}
      cartError={cartError}
      setCartError={setCartError}
    />
  );

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
        <ToggleExplanations
          showExplanations={showExplanations}
          setShowExplanations={setShowExplanations}
        />
        {/* Hidden form item, used to disambiguate between boost and regular licenses */}
        <Form.Item name="type" initialValue={"regular"} noStyle>
          <Input type="hidden" />
        </Form.Item>
        {renderUsageAndDuration({ showExplanations, form, onChange })}
        <Divider plain>Quota upgrades</Divider>
        <Form.Item
          label="GB shared RAM"
          name="ram"
          initialValue={2}
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
            onChange={(ram) => {
              form.setFieldsValue({ ram });
              onChange();
            }}
            units={"GB RAM"}
            presets={[1, 2, 3, 4, 8, 16]}
          />
        </Form.Item>{" "}
        <Form.Item
          label="Shared CPUs"
          name="cpu"
          initialValue={1}
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
            min={1}
            max={3}
            onChange={(cpu) => {
              form.setFieldsValue({ cpu });
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
                  dedicated disks
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
        <RunLimit
          showExplanations={showExplanations}
          form={form}
          onChange={onChange}
        />
        <MemberHostingAndIdleTimeout
          showExplanations={showExplanations}
          form={form}
          onChange={onChange}
          shadowMember={shadowMember}
          setShadowMember={setShadowMember}
        />
        <TitleDescription showExplanations={showExplanations} />
        <Reset
          addBox={addBox}
          form={form}
          onChange={onChange}
          router={router}
        />
      </Form>
    </div>
  );
}

export function renderUsageAndDuration({
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
