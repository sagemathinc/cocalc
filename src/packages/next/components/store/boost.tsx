/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Create a new site license.
*/
import { Icon } from "@cocalc/frontend/components/icon";
import { get_local_storage } from "@cocalc/frontend/misc/local-storage";
import { CostInputPeriod } from "@cocalc/util/licenses/purchase/types";
import { Form, Input, Switch, Typography } from "antd";
import A from "components/misc/A";
import Loading from "components/share/loading";
import SiteName from "components/share/site-name";
import apiPost from "lib/api/post";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { AddBox } from "./add-box";
import { MemberHostingAndIdleTimeout } from "./member-idletime";
import { QuotaConfig } from "./quota-config";
import { Reset } from "./reset";
import { RunLimit } from "./run-limit";
import { computeCost } from "./site-license-cost";
import { TitleDescription } from "./title-description";
import { ToggleExplanations } from "./toggle-explanations";
import { UsageAndDuration } from "./usage-and-duration";
import { getType } from "./util";

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
  const [cost, setCost] = useState<CostInputPeriod | undefined>(undefined);
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

  // most likely, user will go to the cart next
  useEffect(() => {
    router.prefetch("/store/cart");
  }, []);

  function onChange() {
    const conf = { ...form.getFieldsValue(true) };
    conf.type = "boost";
    setCost(computeCost(conf));
  }

  async function loadItem(item) {
    const type = getType(item);
    console.log("loaditem boost", type, item);
    if (type !== "boost") {
      throw new Error(`cannot deal with type ${type}`);
    }
    if (item.product == "site-license") {
      form.setFieldsValue({ ...item.description, type });
    }
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
          await loadItem(item);
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
            ellipsis={
              confirmWarning
                ? { rows: 2, expandable: true, symbol: "more…" }
                : false
            }
            style={{
              opacity: confirmWarning ? 0.75 : 1,
            }}
          >
            Boost licenses only work in combination with regular Site Licenses.
            The intention of a Boost License is to increase how much resources
            your project can use, without having to purchase a new regular
            license. For example, it's perfectly fine if you need such a boost
            only for a couple of days, while otherwise you are happy with a
            smaller license as part of an ongoing subscription. The following
            conditions must be met in order to benefit from an activated boost
            license:
            <ul>
              <li>
                <Text strong>Active Site License</Text>: the regular Site
                License(s) must be applied to the project and actively providing
                upgrades. This is evalulated each time a project starts. Boosts
                are only adding more resources on top of what they provide!
              </li>
              <li>
                <Text strong>Matching Configuration</Text>: the type of hosting
                quality ("Member Hosting") and "Idle Timeout" duration must be
                the same. A booster only works for a site license with a
                matching upgrade quality.
              </li>
            </ul>
            Besides that – just like a regular license – you can't exceed the
            run limit, the boost license must be valid, and combining all
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
        <ToggleExplanations
          showExplanations={showExplanations}
          setShowExplanations={setShowExplanations}
        />
        {/* Hidden form item, used to disambiguate between boost and regular licenses */}
        <Form.Item name="type" initialValue={"boost"} noStyle>
          <Input type="hidden" />
        </Form.Item>
        <UsageAndDuration
          showExplanations={showExplanations}
          form={form}
          onChange={onChange}
          disabled={!confirmWarning}
        />
        <MemberHostingAndIdleTimeout
          showExplanations={showExplanations}
          form={form}
          onChange={onChange}
          shadowMember={shadowMember}
          setShadowMember={setShadowMember}
          boost={true}
          disabled={!confirmWarning}
        />
        <QuotaConfig
          boost={true}
          form={form}
          onChange={onChange}
          disabled={!confirmWarning}
          showExplanations={showExplanations}
        />
        <RunLimit
          showExplanations={showExplanations}
          form={form}
          onChange={onChange}
          boost={true}
          disabled={!confirmWarning}
        />
        <TitleDescription
          showExplanations={showExplanations}
          disabled={!confirmWarning}
        />
        <Reset
          addBox={
            <AddBox
              cost={cost}
              form={form}
              cartError={cartError}
              setCartError={setCartError}
              router={router}
            />
          }
          form={form}
          onChange={onChange}
          router={router}
        />
      </Form>
    </div>
  );
}
