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
import { CostInputPeriod, User } from "@cocalc/util/licenses/purchase/types";
import { computeCost } from "@cocalc/util/licenses/store/compute-cost";
import type { LicenseSource } from "@cocalc/util/upgrades/shopping";
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
import {
  SITE_LICENSE,
  PRESET_MATCH_FIELDS,
  Preset,
  COURSE,
} from "./quota-config-presets";
import {
  decodeFormValues,
  encodeFormValues,
  setAllowUrlEncoding,
} from "./quota-query-params";
import { RunLimit } from "./run-limit";
import { SignInToPurchase } from "./sign-in-to-purchase";
import { TitleDescription } from "./title-description";
import { ToggleExplanations } from "./toggle-explanations";
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
  source: LicenseSource;
}

// depending on the type, this either purchases a license with all settings,
// or a license for a course with a subset of controls.
export default function SiteLicense({ noAccount, source }: Props) {
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
        <Icon
          name={source === "course" ? "graduation-cap" : "key"}
          style={{ marginRight: "5px" }}
        />{" "}
        {router.query.id != null
          ? "Edit License in Shopping Cart"
          : source === "course"
            ? "Purchase a License for a Course"
            : "Configure a License"}
      </Title>
      {router.query.id == null && (
        <>
          {source === "site-license" && (
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
          {source === "course" && (
            <div>
              <Paragraph style={{ fontSize: "12pt" }}>
                Teaching with CoCalc makes your course management effortless.
                Students work in their own secure spaces where you can
                distribute assignments, track their progress in real-time, and
                provide help directly within their work environment. No software
                installation required for students – everything runs in the
                browser. Used by thousands of instructors since 2013. Learn more
                in our{" "}
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
        source={source}
      />
    </>
  );
}

// Note -- the back and forth between moment and Date below
// is a *workaround* because of some sort of bug in moment/antd/react.

function CreateSiteLicense({
  showInfoBar = false,
  noAccount = false,
  source,
}: {
  source: LicenseSource;
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
  const [initializing, setInitializing] = useState<boolean>(true);

  const presets = source === "course" ? COURSE : SITE_LICENSE;

  /**
   * Utility function to match current license configuration to a particular preset. If none is
   * found, this function returns undefined.
   */
  function findPreset(configuration?: any) {
    const currentConfiguration =
      configuration || form.getFieldsValue(Object.keys(PRESET_MATCH_FIELDS));

    let foundPreset: Preset | undefined;

    Object.keys(presets).some((p) => {
      const presetMatches = Object.keys(PRESET_MATCH_FIELDS).every(
        (formField) => {
          const presetValue = presets[p][formField];
          const configValue = currentConfiguration[formField];
          return presetValue === configValue;
        },
      );

      if (presetMatches) {
        foundPreset = p as Preset;
      }

      return presetMatches;
    });

    return foundPreset;
  }

  function onLicenseChange(skipUrlUpdate = false) {
    const vals = form.getFieldsValue(true);
    // console.log("form vals=", vals);
    // Don't encode URL during component initialization to prevent overwriting URL parameters
    if (!skipUrlUpdate && !initializing) {
      encodeFormValues(router, vals, "regular");
    }
    setCost(computeCost(vals));

    const foundPreset = findPreset();

    if (foundPreset) {
      setPresetAdjusted(false);
      setPreset(foundPreset);

      // For course source, ensure period and user are always correct
      if (source === "course") {
        const currentVals = form.getFieldsValue();
        if (currentVals.period !== "range" || currentVals.user !== "academic") {
          const correctedValues = {
            ...currentVals,
            period: "range",
            user: "academic",
          };
          form.setFieldsValue(correctedValues);
          setCost(computeCost(correctedValues));
          encodeFormValues(router, correctedValues, "regular");
        }
      }
    } else {
      // If no preset matches, we set the preset to "standard" in the "course" case
      if (source === "course") {
        // For course source, force standard preset if no match found
        setPreset("standard");
        setPresetAdjusted(false);
        setConfigMode("preset");
        // Set form values to match standard preset
        const standardPreset = presets["standard"];
        const newValues = {
          period: "range",
          user: "academic",
          cpu: standardPreset.cpu,
          ram: standardPreset.ram,
          disk: standardPreset.disk,
          uptime: standardPreset.uptime,
          member: standardPreset.member,
        };
        form.setFieldsValue(newValues);
        // Recalculate cost with new values
        setCost(computeCost({ ...vals, ...newValues }));
        encodeFormValues(router, { ...vals, ...newValues }, "regular");
      } else {
        setPresetAdjusted(true);
      }
    }
  }

  useEffect(() => {
    // Disable URL encoding during initialization
    setAllowUrlEncoding(false);

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
      const defaultPreset = presets[DEFAULT_PRESET];
      // Only use the configuration fields from the default preset, not the entire object
      const defaultConfig = {
        cpu: defaultPreset.cpu,
        ram: defaultPreset.ram,
        disk: defaultPreset.disk,
        uptime: defaultPreset.uptime,
        member: defaultPreset.member,
        // Add other form fields that might be needed
        period: source === "course" ? "range" : "monthly",
        user: source === "course" ? "academic" : "business",
      };
      if (isEmpty(vals)) {
        const fullConfig = {
          ...defaultConfig,
          type: "quota" as const,
          run_limit: source === "site-license" ? 1 : 25,
          range: [undefined, undefined] as [Date | undefined, Date | undefined],
          always_running: false,
          user: (source === "course" ? "academic" : "business") as User,
          period: (source === "course" ? "range" : "monthly") as
            | "range"
            | "monthly"
            | "yearly",
        };
        form.setFieldsValue(fullConfig);
        // Calculate cost with the complete configuration
        setCost(computeCost(fullConfig));
        // For site-license, also set the preset to standard since we're using default config
        if (source === "site-license") {
          setPreset(DEFAULT_PRESET);
          setPresetAdjusted(false);
        }
      } else {
        // we have to make sure cpu, mem and disk are set, otherwise there is no "cost"
        // For URL params, vals should override defaultConfig, not the other way around
        const formValues = {
          ...defaultConfig,
          ...vals, // URL parameters take precedence
        };
        form.setFieldsValue(formValues);

        // For source==course, check preset with the actual values we're setting
        if (source === "course") {
          const foundPreset = findPreset(formValues);
          if (foundPreset) {
            setPreset(foundPreset);
            setPresetAdjusted(false);
            // Ensure period and user are correct for course
            if (
              formValues.period !== "range" ||
              formValues.user !== "academic"
            ) {
              // Only set the corrected fields to preserve other form values like range
              form.setFieldsValue({
                period: "range",
                user: "academic",
              });
            }
          } else {
            // None of the presets match, configure the form according to the standard preset
            setPreset("standard");
            setPresetAdjusted(false);
            setConfigMode("preset");
            const standardPreset = presets["standard"];
            const newValues = {
              ...formValues,
              period: "range",
              user: "academic",
              cpu: standardPreset.cpu,
              ram: standardPreset.ram,
              disk: standardPreset.disk,
              uptime: standardPreset.uptime,
              member: standardPreset.member,
            };
            form.setFieldsValue(newValues);
          }

          // In both cases: calculate cost for the preset we found
          setCost(computeCost(form.getFieldsValue(true)));

          // Don't call onLicenseChange for course source since we handled everything above
        } else {
          // For source==site-license, we still need onLicenseChange to set cost and preset
          onLicenseChange(true);
        }
      }
      // Mark initialization as complete and enable URL encoding
      setInitializing(false);
      setAllowUrlEncoding(true);
    }
  }, [source, router.asPath]);

  // Update the form source field when the source prop changes
  useEffect(() => {
    form.setFieldValue("source", source);
  }, [source]);

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
      source={source}
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
        {/* Hidden form item to track which page (license or course) created this license */}
        <Form.Item name="source" initialValue={source} noStyle>
          <Input type="hidden" />
        </Form.Item>
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
          source={source}
        />
        <RunLimit
          source={source}
          showExplanations={showExplanations}
          form={form}
          onChange={onLicenseChange}
        />
        <QuotaConfig
          source={source}
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
        {configMode === "expert" && source !== "course" ? (
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
