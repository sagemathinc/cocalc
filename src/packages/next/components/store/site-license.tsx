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
import { Form, Input } from "antd";
import A from "components/misc/A";
import Loading from "components/share/loading";
import SiteName from "components/share/site-name";
import apiPost from "lib/api/post";
import { MAX_WIDTH } from "lib/config";
import { useScrollY } from "lib/use-scroll-y";
import { isEmpty } from "lodash";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { AddBox } from "./add-box";
import { ApplyLicenseToProject } from "./apply-license-to-project";
import { computeCost } from "./compute-cost";
import { InfoBar } from "./cost-info-bar";
import { MemberHostingAndIdleTimeout } from "./member-idletime";
import { QuotaConfig } from "./quota-config";
import { PRESETS, Presets } from "./quota-config-presets";
import { Reset } from "./reset";
import { RunLimit } from "./run-limit";
import { SignInToPurchase } from "./sign-in-to-purchase";
import { TitleDescription } from "./title-description";
import { ToggleExplanations } from "./toggle-explanations";
import { UsageAndDuration } from "./usage-and-duration";
import { decodeFormValues, encodeFormValues } from "./util";

const STYLE: React.CSSProperties = {
  marginTop: "15px",
  maxWidth: MAX_WIDTH,
  margin: "auto",
  border: "1px solid #ddd",
  padding: "15px",
} as const;

interface Props {
  noAccount: boolean;
}

export default function SiteLicense(props: Props) {
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
        <Icon name={"key"} style={{ marginRight: "5px" }} />{" "}
        {router.query.id != null
          ? "Edit Site License in Shopping Cart"
          : "Buy a Quota Upgrades License"}
      </h3>
      {router.query.id == null && (
        <p>
          <A href="https://doc.cocalc.com/licenses.html">
            <SiteName /> site licenses
          </A>{" "}
          allow you to upgrade any number of projects to run more quickly, have
          network access, more disk space, memory, or run on a dedicated
          computer. Site licenses can be for a wide range of sizes, ranging from
          a single hobbyist project to thousands of simultaneous users across an
          entire department of school. Create a license using the form below
          then add it to your <A href="/store/cart">shopping cart</A>.
        </p>
      )}
      <CreateSiteLicense
        showInfoBar={scrollY > offsetHeader}
        noAccount={noAccount}
      />
    </>
  );
}

// Note -- the back and forth between moment and Date below
// is a *workaround* because of some sort of bug in moment/antd/react.

function CreateSiteLicense({ showInfoBar = false, noAccount = false }) {
  const [cost, setCost] = useState<CostInputPeriod | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(false);
  const [cartError, setCartError] = useState<string>("");
  const [showExplanations, setShowExplanations] = useState<boolean>(true);
  const [shadowMember, setShadowMember] = useState<boolean | null>(null);
  const [configMode, setConfigMode] = useState<"preset" | "expert">("preset");
  const [form] = Form.useForm();
  const router = useRouter();

  const [preset, setPreset] = useState<Presets | null>("standard");
  const [presetAdjusted, setPresetAdjusted] = useState<boolean>(false);

  function onChange() {
    const vals = form.getFieldsValue(true);
    encodeFormValues(router, vals);
    setCost(computeCost(vals));
  }

  useEffect(() => {
    const store_site_license_show_explanations = get_local_storage(
      "store_site_license_show_explanations"
    );
    if (store_site_license_show_explanations != null) {
      setShowExplanations(!!store_site_license_show_explanations);
    }

    const { id } = router.query;
    if (!noAccount && id != null) {
      // editing something in the shopping cart
      (async () => {
        try {
          setLoading(true);
          const item = await apiPost("/shopping/cart/get", { id });
          if (item.product == "site-license") {
            form.setFieldsValue({ ...item.description, type: "regular" });
          }
        } catch (err) {
          setCartError(err.message);
        } finally {
          setLoading(false);
        }
        onChange();
      })();
    } else {
      const vals = decodeFormValues(router, "regular");
      if (isEmpty(vals)) {
        const { cpu, ram, disk } = PRESETS["standard"];
        form.setFieldsValue({ cpu, ram, disk, preset: "standard" });
      } else {
        form.setFieldsValue(vals);
        setConfigMode("expert");
        setPresetAdjusted(true);
      }
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
      noAccount={noAccount}
    />
  );

  return (
    <div>
      <ApplyLicenseToProject router={router} />
      <SignInToPurchase noAccount={noAccount} />
      <InfoBar
        show={showInfoBar}
        cost={cost}
        router={router}
        form={form}
        cartError={cartError}
        setCartError={setCartError}
        noAccount={noAccount}
      />
      <Form
        form={form}
        style={STYLE}
        name="basic"
        labelCol={{ span: 6 }}
        wrapperCol={{ span: 18 }}
        autoComplete="off"
        onValuesChange={onChange}
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
        <UsageAndDuration
          showExplanations={showExplanations}
          form={form}
          onChange={onChange}
        />
        <RunLimit
          showExplanations={showExplanations}
          form={form}
          onChange={onChange}
        />
        <QuotaConfig
          boost={false}
          form={form}
          onChange={onChange}
          showExplanations={showExplanations}
          configMode={configMode}
          setConfigMode={setConfigMode}
          preset={preset}
          setPreset={setPreset}
          presetAdjusted={presetAdjusted}
          setPresetAdjusted={setPresetAdjusted}
        />
        <MemberHostingAndIdleTimeout
          showExplanations={showExplanations}
          form={form}
          onChange={onChange}
          shadowMember={shadowMember}
          setShadowMember={setShadowMember}
          setPresetAdjusted={setPresetAdjusted}
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
