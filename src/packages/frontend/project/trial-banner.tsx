/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert, Tag } from "antd";
import humanizeList from "humanize-list";
import { join } from "path";

import { CSS, React, useMemo, useState } from "@cocalc/frontend/app-framework";
import { A, Icon, Paragraph } from "@cocalc/frontend/components";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import {
  SiteLicenseInput,
  useManagedLicenses,
} from "@cocalc/frontend/site-licenses/input";
import { BuyLicenseForProject } from "@cocalc/frontend/site-licenses/purchase/buy-license-for-project";
import {
  BANNER_NON_DISMISSABLE_DAYS,
  EVALUATION_PERIOD_DAYS,
  LICENSE_MIN_PRICE,
} from "@cocalc/util/consts/billing";
import { server_time } from "@cocalc/util/relative-time";
import { COLORS, DOC_URL } from "@cocalc/util/theme";
import { useAllowedFreeProjectToRun } from "./client-side-throttle";
import { applyLicense } from "./settings/site-license";

export const DOC_TRIAL = "https://doc.cocalc.com/trial.html";

// explains implications for having no internet and/or no member hosting
export const A_STYLE: CSS = {
  cursor: "pointer",
  fontWeight: "bold",
} as const;

const A_STYLE_ELEVATED: CSS = {
  ...A_STYLE,
  color: "white",
} as const;

export const ALERT_STYLE: CSS = {
  paddingTop: "0px",
  paddingLeft: "10px",
  paddingRight: "5px",
  paddingBottom: "5px",
  marginBottom: 0,
  fontSize: "9pt",
  borderRadius: 0,
  lineHeight: "80%",
} as const;

const ALERT_STYLE_ELEVATED: CSS = {
  ...ALERT_STYLE,
  color: "white",
  background: COLORS.ORANGE_WARN,
  fontSize: "11pt",
} as const;

const ALERT_STYLE_EXPIRED: CSS = {
  ...ALERT_STYLE_ELEVATED,
  background: COLORS.ANTD_RED,
} as const;

interface BannerProps {
  project_id: string;
  projectSiteLicenses: string[];
  host: boolean;
  internet: boolean;
  projectIsRunning: boolean;
  projectCreatedTS?: Date;
}

// string and URLs
export const NO_INTERNET =
  "you can't install packages, clone from GitHub, or download datasets";
const NO_HOST = ["expect slower performance"];
const INET_QUOTA =
  "https://doc.cocalc.com/billing.html#what-exactly-is-the-internet-access-quota";
const MEMBER_QUOTA =
  "https://doc.cocalc.com/billing.html#what-is-member-hosting";
// const ADD_LICENSE = "https://doc.cocalc.com/project-settings.html#project-add-license";
export const BUY_A_LICENSE_URL = join(appBasePath, "/store/site-license");

export const TrialBanner: React.FC<BannerProps> = React.memo(
  (props: BannerProps) => {
    const {
      host,
      internet,
      project_id,
      projectCreatedTS,
      projectSiteLicenses,
      projectIsRunning,
    } = props;

    const [showAddLicense, setShowAddLicense] = useState<boolean>(false);
    const managedLicenses = useManagedLicenses();
    const allow_run = useAllowedFreeProjectToRun(project_id);

    const projectAgeDays = useMemo(() => {
      // timestamp, when this project was created. won't change over time.
      const projCreatedTS = projectCreatedTS ?? new Date(0);
      const age_ms: number = server_time().getTime() - projCreatedTS.getTime();
      return age_ms / (24 * 60 * 60 * 1000);
    }, [projectCreatedTS]);

    // when to show the more intimidating red banner:
    // after $ELEVATED_DAYS days
    // but not if there are already any licenses applied to the project
    // or if user manages at least one license
    const no_licenses =
      projectSiteLicenses.length === 0 && managedLicenses?.size === 0;
    const elevated = projectAgeDays >= EVALUATION_PERIOD_DAYS && no_licenses;
    const expired =
      projectAgeDays >= BANNER_NON_DISMISSABLE_DAYS && no_licenses;

    const style = expired
      ? ALERT_STYLE_EXPIRED
      : elevated
      ? ALERT_STYLE_ELEVATED
      : ALERT_STYLE;
    const a_style = elevated ? A_STYLE_ELEVATED : A_STYLE;

    const trial_project = no_licenses ? (
      <A href={DOC_URL} style={{ ...a_style, paddingRight: ".5em" }}>
        Hello <Icon name="hand" />
      </A>
    ) : (
      <strong>No upgrades</strong>
    );

    function renderBuyAndUpgrade(text: string = "with a license"): JSX.Element {
      return (
        <>
          <BuyLicenseForProject
            project_id={project_id}
            buyText={text}
            voucherText={"redeem a voucher"}
            asLink={true}
            style={{ padding: 0, fontSize: style.fontSize, ...a_style }}
          />
          . Price starts at {LICENSE_MIN_PRICE}. Then,{" "}
          <a style={a_style} onClick={() => setShowAddLicense(true)}>
            apply it to this project
          </a>
        </>
      );
    }

    function renderMessage(): JSX.Element | undefined {
      if (allow_run === false) {
        return (
          <span>
            There are too many free trial projects running right now.
            <br />
            Try again later or {renderBuyAndUpgrade()}.
          </span>
        );
      }

      if (host && internet) {
        return (
          <span>
            {trial_project} You can improve hosting quality and get internet
            access {renderBuyAndUpgrade()}.
            <br />
            Otherwise, {humanizeList([...NO_HOST, NO_INTERNET])}
            {"."}
          </span>
        );
      } else if (host) {
        return (
          <span>
            <strong>Low-grade hosting</strong> - upgrade to{" "}
            <A href={MEMBER_QUOTA} style={a_style}>
              Member Hosting
            </A>{" "}
            or {humanizeList(NO_HOST)}
            {"."}
            <br />
            {renderBuyAndUpgrade("Buy a license")}
          </span>
        );
      } else if (internet) {
        return (
          <span>
            <strong>No internet access</strong> – upgrade{" "}
            <A href={INET_QUOTA} style={a_style}>
              Internet Access
            </A>{" "}
            or {NO_INTERNET}
            {"."}
            <br />
            {renderBuyAndUpgrade("Buy a license")}
          </span>
        );
      }
    }

    function renderLearnMore(color): JSX.Element {
      const a_style_more = {
        ...a_style,
        ...{ fontWeight: "bold" as "bold", color: color },
      };
      return (
        <>
          {" – "}
          <span style={{ fontSize: style.fontSize }}>
            <A href={DOC_TRIAL} style={a_style_more}>
              more info
            </A>
            {"..."}
          </span>
        </>
      );
    }

    // allow users to close the banner, if there is either internet or host upgrade – or if user has licenses (past customer, upgrades by someone else, etc.)
    const closable =
      !host ||
      !internet ||
      !no_licenses ||
      projectAgeDays < BANNER_NON_DISMISSABLE_DAYS;

    // don't show the banner if project is not running.
    // https://github.com/sagemathinc/cocalc/issues/6496
    // UNLESS it is a free project and not allowed to run
    // (banner must be visible when stopped, obviously)
    if (!projectIsRunning && allow_run !== false) {
      return null;
    }

    return (
      <Alert
        type="warning"
        closable={closable}
        closeIcon={
          closable ? (
            <Tag
              style={{ marginTop: "10px", fontSize: style.fontSize }}
              color="#faad14"
            >
              <Icon name="times" /> Dismiss
            </Tag>
          ) : undefined
        }
        style={style}
        banner={true}
        showIcon={!closable || (internet && host)}
        icon={
          <Icon
            name="exclamation-triangle"
            style={{
              marginTop: "12px",
              color: expired ? "white" : elevated ? "black" : undefined,
            }}
          />
        }
        description={
          <>
            <Paragraph
              style={{
                ...style,
                margin: 0,
                padding: 0,
              }}
            >
              {renderMessage()} {renderLearnMore(style.color)}
            </Paragraph>
            {showAddLicense && (
              <BannerApplySiteLicense
                project_id={project_id}
                projectSiteLicenses={projectSiteLicenses}
                setShowAddLicense={setShowAddLicense}
              />
            )}
          </>
        }
      />
    );
  }
);

interface ApplyLicenseProps {
  projectSiteLicenses: string[];
  project_id: string;
  setShowAddLicense: (show: boolean) => void;
}

export const BannerApplySiteLicense: React.FC<ApplyLicenseProps> = (
  props: ApplyLicenseProps
) => {
  const { projectSiteLicenses, project_id, setShowAddLicense } = props;

  // NOTE: we show this dialog even if user does not manage any licenses,
  // because the user could have one via another channel and just wants to add it directly via copy/paste.
  return (
    <>
      <br />
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          flex: "1 0 auto",
        }}
      >
        <div
          style={{
            margin: "10px 10px 10px 0",
            verticalAlign: "bottom",
            display: "flex",
            fontWeight: "bold",
            whiteSpace: "nowrap",
          }}
        >
          Select a license:
        </div>
        <SiteLicenseInput
          style={{
            display: "flex",
            flexDirection: "column",
            flex: "1 0 auto",
          }}
          exclude={projectSiteLicenses}
          onSave={(license_id) => {
            setShowAddLicense(false);
            applyLicense({ project_id, license_id });
          }}
          onCancel={() => setShowAddLicense(false)}
          extraButtons={
            <BuyLicenseForProject project_id={project_id} size={"middle"} />
          }
        />
      </div>
    </>
  );
};
