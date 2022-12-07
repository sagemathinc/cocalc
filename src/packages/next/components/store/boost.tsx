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
import { CostInputPeriod } from "@cocalc/util/licenses/purchase/types";
import { COLORS } from "@cocalc/util/theme";
import { Form, Input, Space, Switch, Typography } from "antd";
import A from "components/misc/A";
import Loading from "components/share/loading";
import apiPost from "lib/api/post";
import { MAX_WIDTH } from "lib/config";
import { useScrollY } from "lib/use-scroll-y";
import { isEmpty } from "lodash";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { AddBox } from "./add-box";
import { ApplyLicenseToProject } from "./apply-license-to-project";
import { computeCost } from "./compute-cost";
import { InfoBar } from "./cost-info-bar";
import { MemberHostingAndIdleTimeout } from "./member-idletime";
import { QuotaConfig } from "./quota-config";
import { decodeFormValues, encodeFormValues } from "./quota-query-params";
import { Reset } from "./reset";
import { RunLimit } from "./run-limit";
import { SignInToPurchase } from "./sign-in-to-purchase";
import { TitleDescription } from "./title-description";
import { ToggleExplanations } from "./toggle-explanations";
import { UsageAndDuration } from "./usage-and-duration";
import { getType } from "./util";

const { Text, Paragraph } = Typography;

interface Props {
  noAccount: boolean;
}

export default function Boost(props: Props) {
  const { noAccount } = props;
  const router = useRouter();
  const headerRef = useRef<HTMLHeadingElement>(null);

  // most likely, user will go to the cart next
  useEffect(() => {
    router.prefetch("/store/cart");
  }, []);

  const [offsetHeader, setOffsetHeader] = useState(0);
  const scrollY = useScrollY();

  useEffect(() => {
    if (headerRef.current) {
      setOffsetHeader(headerRef.current.offsetTop);
    }
  }, []);

  return (
    <>
      <h3 ref={headerRef}>
        <Icon name={"rocket"} style={{ marginRight: "5px" }} />{" "}
        {router.query.id != null
          ? "Edit License Booster in Shopping Cart"
          : "Buy a License Booster"}
      </h3>
      {router.query.id == null && (
        <Space direction="vertical" style={{ marginBottom: "20px" }}>
          <Typography>
            A License Booster adds additional quotas to an already existing,
            valid and currently active regular Site License. A common use case
            is to increase the memory limit after you already bought a Site
            License. Create a boost using the form below then add it to your{" "}
            <A href="/store/cart">shopping cart</A>.
          </Typography>
          <Typography>
            <Icon name="lightbulb" style={{ color: COLORS.ANTD_ORANGE }} /> If
            you are teaching a course and have to cover more students, you need
            to get an additional <A href="./site-license">Site License</A> with
            a "Run Limit" matching the number of additional of students.
          </Typography>
        </Space>
      )}
      <CreateBooster
        showInfoBar={scrollY > offsetHeader}
        noAccount={noAccount}
      />
    </>
  );
}

// Note -- the back and forth between moment and Date below
// is a *workaround* because of some sort of bug in moment/antd/react.

function CreateBooster({ showInfoBar = false, noAccount = false }) {
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

  const LS_BOOST_CONFIRM_KEY = "store_boost_confirm";

  function confirmBoostWarning(confirmed: boolean) {
    setConfirmWarning(confirmed);
    set_local_storage(LS_BOOST_CONFIRM_KEY, confirmed ? "t" : "");
  }

  // most likely, user will go to the cart next
  useEffect(() => {
    router.prefetch("/store/cart");
  }, []);

  function onChange() {
    const vals = form.getFieldsValue(true);
    encodeFormValues(router, vals, "boost");
    const conf = { ...vals };
    conf.type = "boost";
    conf.boost = true;
    setCost(computeCost(conf));
  }

  async function loadItem(item) {
    const type = getType(item);
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
    const store_boost_confirm = get_local_storage(LS_BOOST_CONFIRM_KEY);
    if (store_boost_confirm != null) {
      setConfirmWarning(!!store_boost_confirm);
    }
    const { id } = router.query;
    if (!noAccount && id != null) {
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
    } else {
      const vals = decodeFormValues(router, "boost");
      if (!isEmpty(vals)) {
        form.setFieldsValue(vals);
      }
    }
    onChange();
  }, []);

  if (loading) {
    return <Loading large center />;
  }

  function renderConfirmationText() {
    return (
      <Paragraph
        ellipsis={
          confirmWarning ? { rows: 3, expandable: false, symbol: null } : false
        }
        style={{
          opacity: confirmWarning ? 0.75 : 1,
        }}
      >
        Boost licenses only work in combination with regular{" "}
        <A href="./site-license">Site Licenses</A>. The intention of a Boost
        License is to increase how much resources your project receives, without
        having to purchase yet another regular license. For example, you can
        increase just the RAM for some projects for a couple of days, while
        otherwise you are happy with a smaller license as part of an ongoing
        subscription. To cover more projects, e.g. additional students in a
        course, you need to get a regular{" "}
        <A href="./site-license">Site License</A>.
        <p>
          The following conditions must be met in order to benefit from an
          activated boost license:
        </p>
        <ul>
          <li>
            <Text strong>Active Site License</Text>: one or more{" "}
            <a href="/store/site-license">regular Site License(s)</a> must be
            applied to the project and actively providing upgrades. This is
            evaluated each time a project starts. Boosts are only adding more
            resources on top of what a regular license already provides!
          </li>
          <li>
            <Text strong>Matching Configuration</Text>: the type of hosting
            quality ("Member Hosting") and "Idle Timeout" duration must be the
            same. A booster only works for a site license with a matching
            upgrade quality.
          </li>
        </ul>
        Besides that – just like a regular license – you can't exceed the run
        limit; the boost license must be valid as well, and combining all
        upgrades and boosts together, you cannot exceed the overall upgrade
        limits. If you need vastly more resources, consider purchasing a{" "}
        <Link href={"./dedicated?type=vm"} scroll={false}>
          Dedicated VM
        </Link>
        .
      </Paragraph>
    );
  }

  function renderConfirmation() {
    return (
      <Form.Item wrapperCol={{ offset: 2, span: 20 }}>
        <div
          style={{
            border: confirmWarning ? "1px solid gray" : "3px solid red",
            borderRadius: "5px",
            padding: "10px",
            margin: confirmWarning ? "2px" : 0, // compensate border with from above
          }}
        >
          {renderConfirmationText()}
          <div>
            <Paragraph
              style={{
                marginTop: "20px",
                textAlign: "center",
                fontWeight: confirmWarning ? "inherit" : "bold",
                cursor: "pointer",
              }}
              onClick={() => confirmBoostWarning(!confirmWarning)}
            >
              <Switch onChange={confirmBoostWarning} checked={confirmWarning} />{" "}
              Yes, I understand
            </Paragraph>
          </div>
        </div>
      </Form.Item>
    );
  }

  return (
    <div>
      <InfoBar
        show={showInfoBar}
        cost={cost}
        router={router}
        form={form}
        cartError={cartError}
        setCartError={setCartError}
        noAccount={noAccount}
      />
      <ApplyLicenseToProject router={router} />
      <SignInToPurchase noAccount={noAccount} />
      <Form
        form={form}
        style={{
          marginTop: "15px",
          maxWidth: MAX_WIDTH,
          margin: "auto",
          border: "1px solid #ddd",
          padding: "15px",
        }}
        name="basic"
        labelCol={{ span: 6 }}
        wrapperCol={{ span: 18 }}
        autoComplete="off"
        onValuesChange={onChange}
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
        <RunLimit
          showExplanations={showExplanations}
          form={form}
          onChange={onChange}
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
              noAccount={noAccount}
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
