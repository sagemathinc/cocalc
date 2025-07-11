/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Create a new site license.
*/
import { Form, Input } from "antd";
import { isEmpty } from "lodash";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";

import { Icon } from "@cocalc/frontend/components/icon";
import { get_local_storage } from "@cocalc/frontend/misc/local-storage";
import { CostInputPeriod } from "@cocalc/util/licenses/purchase/types";
import { computeCost } from "@cocalc/util/licenses/store/compute-cost";
import { Paragraph, Title } from "components/misc";
import A from "components/misc/A";
import Loading from "components/share/loading";
import SiteName from "components/share/site-name";
import apiPost from "lib/api/post";
import { MAX_WIDTH } from "lib/config";
import { useScrollY } from "lib/use-scroll-y";
import { AddBox } from "./add-box";
import { ApplyLicenseToProject } from "./apply-license-to-project";
import { InfoBar } from "./cost-info-bar";
import { IdleTimeout } from "./member-idletime";
import { QuotaConfig } from "./quota-config";
import { PRESETS, PRESET_MATCH_FIELDS, Preset } from "./quota-config-presets";
import { decodeFormValues, encodeFormValues } from "./quota-query-params";
import { RunLimit } from "./run-limit";
import { SignInToPurchase } from "./sign-in-to-purchase";
import { TitleDescription } from "./title-description";
import { ToggleExplanations } from "./toggle-explanations";
import { LicenseType } from "./types";
import { UsageAndDuration } from "./usage-and-duration";

const DEFAULT_PRESET: Preset = "standard";

const STYLE: React.CSSProperties = {
  marginTop: "15px",
  maxWidth: MAX_WIDTH,
  margin: "auto",
  border: "1px solid #ddd",
  padding: "15px",
} as const;

interface Props {
  noAccount: boolean;
  type: LicenseType;
}

// depending on the type, this either purchases a license with all settings,
// or a license for a course with a subset of controls.
export default function SiteLicense({ noAccount, type }: Props) {
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
      <Title level={3} ref={headerRef}>
        <Icon name={"key"} style={{ marginRight: "5px" }} />{" "}
        {router.query.id != null
          ? "Edit License in Shopping Cart"
          : type === "course"
          ? "Purchase a License for a Course"
          : "Configure a License"}
      </Title>
      {router.query.id == null && (
        <>
          {type === "license" && (
            <div>
              <Paragraph style={{ fontSize: "12pt" }}>
                <A href="https://doc.cocalc.com/licenses.html">
                  <SiteName /> licenses
                </A>{" "}
                allow you to upgrade projects to run more quickly, have network
                access, more disk space and memory. Licenses cover a wide range
                of use cases, ranging from a single hobbyist project to
                thousands of simultaneous users across a large organization.
              </Paragraph>

              <Paragraph style={{ fontSize: "12pt" }}>
                Create a license using the form below then add it to your{" "}
                <A href="/store/cart">shopping cart</A>. If you aren't sure
                exactly what to buy, you can always edit your licenses later.
                Subscriptions are also flexible and can be{" "}
                <A
                  href="https://doc.cocalc.com/account/purchases.html#recent-updates-to-subscriptions"
                  external
                >
                  edited at any time.{" "}
                </A>
              </Paragraph>
            </div>
          )}
          {type === "course" && (
            <div>
              <Paragraph style={{ fontSize: "12pt" }}>
                When you teach your course on CoCalc, you benefit from a
                managed, reliable platform used by tens of thousands of students
                since 2013. Each student works in an isolated workspace
                (project), with options for group work. File-based assignments
                are handed out to students and collected when completed. You can
                easily monitor progress, review editing history, and assist
                students directly. For more information, please consult the{" "}
                <A href={"https://doc.cocalc.com/teaching-instructors.html"}>
                  instructor guide
                </A>
                .
              </Paragraph>
            </div>
          )}
        </>
      )}
      <CreateSiteLicense
        showInfoBar={scrollY > offsetHeader}
        noAccount={noAccount}
        type={type}
      />
    </>
  );
}

// Note -- the back and forth between moment and Date below
// is a *workaround* because of some sort of bug in moment/antd/react.

function CreateSiteLicense({
  showInfoBar = false,
  noAccount = false,
  type,
}: {
  type: LicenseType;
  noAccount: boolean;
  showInfoBar: boolean;
}) {
  const [cost, setCost] = useState<CostInputPeriod | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(false);
  const [cartError, setCartError] = useState<string>("");
  const [showExplanations, setShowExplanations] = useState<boolean>(false);
  const [configMode, setConfigMode] = useState<"preset" | "expert">("preset");
  const [form] = Form.useForm();
  const router = useRouter();

  const [preset, setPreset] = useState<Preset | null>(DEFAULT_PRESET);
  const [presetAdjusted, setPresetAdjusted] = useState<boolean>(false);

  /**
   * Utility function to match current license configuration to a particular preset. If none is
   * found, this function returns undefined.
   */
  function findPreset() {
    const currentConfiguration = form.getFieldsValue(
      Object.keys(PRESET_MATCH_FIELDS),
    );

    let foundPreset: Preset | undefined;

    Object.keys(PRESETS).some((p) => {
      const presetMatches = Object.keys(PRESET_MATCH_FIELDS).every(
        (formField) =>
          PRESETS[p][formField] === currentConfiguration[formField],
      );

      if (presetMatches) {
        foundPreset = p as Preset;
      }

      return presetMatches;
    });

    return foundPreset;
  }

  function onLicenseChange() {
    const vals = form.getFieldsValue(true);
    // console.log("form vals=", vals);
    encodeFormValues(router, vals, "regular");
    setCost(computeCost(vals));

    const foundPreset = findPreset();

    if (foundPreset) {
      setPresetAdjusted(false);
      setPreset(foundPreset);
    } else {
      setPresetAdjusted(true);
    }
  }

  useEffect(() => {
    const store_site_license_show_explanations = get_local_storage(
      "store_site_license_show_explanations",
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
        onLicenseChange();
      })();
    } else {
      const vals = decodeFormValues(router, "regular");
      const dflt = PRESETS[DEFAULT_PRESET];
      if (isEmpty(vals)) {
        form.setFieldsValue({
          ...dflt,
        });
      } else {
        // we have to make sure cpu, mem and disk are set, otherwise there is no "cost"
        form.setFieldsValue({
          ...dflt,
          ...vals,
        });
      }
    }
    onLicenseChange();
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
      type={type}
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
        labelCol={{ span: 3 }}
        wrapperCol={{ span: 21 }}
        autoComplete="off"
        onValuesChange={onLicenseChange}
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
          onChange={onLicenseChange}
          type={type}
        />
        <RunLimit
          type={type}
          showExplanations={showExplanations}
          form={form}
          onChange={onLicenseChange}
        />
        <QuotaConfig
          boost={false}
          form={form}
          onChange={onLicenseChange}
          showExplanations={showExplanations}
          configMode={configMode}
          setConfigMode={setConfigMode}
          preset={preset}
          setPreset={setPreset}
          presetAdjusted={presetAdjusted}
        />
        {configMode === "expert" ? (
          <IdleTimeout
            showExplanations={showExplanations}
            form={form}
            onChange={onLicenseChange}
          />
        ) : undefined}
        <TitleDescription showExplanations={showExplanations} form={form} />
      </Form>
    </div>
  );
}
