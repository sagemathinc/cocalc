/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert } from "antd";
import humanizeList from "humanize-list";
import { join } from "path";

import { CSS, React, useState } from "@cocalc/frontend/app-framework";
import { A, Icon } from "@cocalc/frontend/components";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { server_time } from "@cocalc/frontend/frame-editors/generic/client";
import {
  SiteLicenseInput,
  useManagedLicenses,
} from "@cocalc/frontend/site-licenses/input";
import { LICENSE_MIN_PRICE } from "@cocalc/util/consts/billing";
import { useAllowedFreeProjectToRun } from "./client-side-throttle";
import { applyLicense } from "./settings/site-license";

export const DOC_TRIAL = "https://doc.cocalc.com/trial.html";

const ELEVATED_DAYS = 10;

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
  padding: "5px 10px",
  marginBottom: 0,
  fontSize: "10pt",
  borderRadius: 0,
} as const;

const ALERT_STYLE_ELEVATED: CSS = {
  ...ALERT_STYLE,
  color: "white",
  background: "red",
  fontSize: "12pt",
} as const;

interface BannerProps {
  project_id: string;
  projectSiteLicenses: string[];
  host: boolean;
  internet: boolean;
  proj_created: number; // timestamp when project started
  projectIsRunning: boolean;
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
      proj_created,
      projectSiteLicenses,
      projectIsRunning,
    } = props;

    const [showAddLicense, setShowAddLicense] = useState<boolean>(false);
    const managedLicenses = useManagedLicenses();
    const allow_run = useAllowedFreeProjectToRun(project_id);

    const age_ms: number = server_time().getTime() - proj_created;
    const ageDays = age_ms / (24 * 60 * 60 * 1000);

    // when to show the more intimidating red banner:
    // after $ELEVATED_DAYS days
    // but not if there are already any licenses applied to the project
    // or if user manages at least one license
    const no_licenses =
      projectSiteLicenses.length === 0 && managedLicenses?.size === 0;
    const elevated = ageDays >= ELEVATED_DAYS && no_licenses;

    const style = elevated ? ALERT_STYLE_ELEVATED : ALERT_STYLE;
    const a_style = elevated ? A_STYLE_ELEVATED : A_STYLE;

    // If user has any licenses or there is a license applied to the project (even when expired), we no longer call this a "Trial"
    //       <strong>
    //         <A href={DOC_TRIAL} style={a_style}>
    //           Free Trial (Day {Math.floor(ageDays)})
    //         </A>
    //       </strong>
    const trial_project = no_licenses ? (
      "Welcome!"
    ) : (
      <strong>No upgrades</strong>
    );

    function renderMessage(): JSX.Element | undefined {
      const buy_and_upgrade = (
        <>
          <A style={a_style} href={BUY_A_LICENSE_URL}>
            you can buy a license
          </A>{" "}
          (starting at {LICENSE_MIN_PRICE}) and then{" "}
          <a style={a_style} onClick={() => setShowAddLicense(true)}>
            apply it to this project
          </a>
        </>
      );

      if (allow_run === false) {
        return (
          <span>
            {trial_project} - There are too many free trial projects running
            right now.
            <br />
            Try again later or {buy_and_upgrade}.
          </span>
        );
      }

      if (host && internet) {
        return (
          <span>
            {trial_project} – {buy_and_upgrade}.
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
    const closable = !host || !internet || !no_licenses;

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
        style={style}
        banner={true}
        showIcon={!closable || (internet && host)}
        icon={<Icon name="exclamation-triangle" style={{ marginTop: "7px" }} />}
        description={
          <>
            <span style={{ fontSize: style.fontSize }}>{renderMessage()}</span>{" "}
            {renderLearnMore(style.color)}
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
        />
      </div>
    </>
  );
};
