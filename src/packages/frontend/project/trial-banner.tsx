/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Modal, Space, Tag, Tooltip } from "antd";
import humanizeList from "humanize-list";
import { useInterval } from "react-interval-hook";
import {
  CSS,
  React,
  redux,
  useForceUpdate,
  useMemo,
  useRef,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { A, Icon, Paragraph } from "@cocalc/frontend/components";
import { TimeAmount } from "@cocalc/frontend/editors/stopwatch/time";
import { open_new_tab } from "@cocalc/frontend/misc";
import {
  SiteLicenseInput,
  useManagedLicenses,
} from "@cocalc/frontend/site-licenses/input";
import { BuyLicenseForProject } from "@cocalc/frontend/site-licenses/purchase/buy-license-for-project";
import track from "@cocalc/frontend/user-tracking";
import {
  BANNER_NON_DISMISSABLE_DAYS,
  EVALUATION_PERIOD_DAYS,
  LICENSE_MIN_PRICE,
} from "@cocalc/util/consts/billing";
import { server_time } from "@cocalc/util/misc";
import { COLORS, DOC_URL } from "@cocalc/util/theme";
import { useAllowedFreeProjectToRun } from "./client-side-throttle";
import { useProjectContext } from "./context";
import { applyLicense } from "./settings/site-license";
import { CallToSupport, BUY_A_LICENSE_URL } from "./call-to-support";

export const DOC_TRIAL = "https://doc.cocalc.com/trial.html";

const TRACK_KEY = "trial_banner";

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
  paddingTop: "5px",
  paddingLeft: "10px",
  paddingRight: "5px",
  paddingBottom: "5px",
  marginBottom: 0,
  fontSize: "9pt",
  borderRadius: 0,
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
  // noMemberHosting = true means they do NOT have member hosting
  noMemberHosting: boolean;
  // noInternet = true means they do NOT have internet access (yes, this is backwards)
  noInternet: boolean;
  projectIsRunning: boolean;
  projectCreatedTS?: Date;
  // true if have a paid for compute server
  hasComputeServers: boolean;
}

// string and URLs
export const NO_INTERNET = "can't install packages or download datasets";
const NO_HOST = ["expect slower performance"];
const INET_QUOTA =
  "https://doc.cocalc.com/billing.html#what-exactly-is-the-internet-access-quota";
const MEMBER_QUOTA =
  "https://doc.cocalc.com/billing.html#what-is-member-hosting";
// const ADD_LICENSE = "https://doc.cocalc.com/project-settings.html#project-add-license";

export const TrialBanner: React.FC<BannerProps> = React.memo(
  (props: BannerProps) => {
    const {
      noMemberHosting,
      noInternet,
      project_id,
      projectCreatedTS,
      projectSiteLicenses,
      projectIsRunning,
      hasComputeServers,
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

    // function renderComputeServer() {
    //   return (
    //     <a
    //       style={a_style}
    //       onClick={() => {
    //         const actions = redux.getProjectActions(project_id);
    //         actions.setState({ create_compute_server: true });
    //         actions.set_active_tab("servers", {
    //           change_history: true,
    //         });
    //       }}
    //     >
    //       using a compute server
    //     </a>
    //   );
    // }

    function renderBuyAndUpgrade(text: string = "with a license"): React.JSX.Element {
      return (
        <>
          <BuyLicenseForProject
            project_id={project_id}
            buyText={text}
            voucherText={"by redeeming a voucher"}
            asLink={true}
            style={{ padding: 0, fontSize: style.fontSize, ...a_style }}
          />
          .<br />
          Prices start at {LICENSE_MIN_PRICE}.{" "}
          <a style={a_style} onClick={() => setShowAddLicense(true)}>
            Apply your license to this project
          </a>
        </>
      );
    }

    function renderMessage(): React.JSX.Element | undefined {
      if (allow_run === false) {
        return (
          <span>
            There are too many free trial projects running right now.
            <br />
            Try again later or {renderBuyAndUpgrade()}.
          </span>
        );
      }

      if (noMemberHosting && noInternet) {
        return (
          <span>
            {trial_project} You can improve hosting quality and get internet
            access {/* {renderComputeServer()} */} or {renderBuyAndUpgrade()}.
            <br />
            Otherwise, {humanizeList([...NO_HOST, NO_INTERNET])}
            {"."}
            {hasComputeServers && (
              <>&nbsp; NOTE: Compute servers always have internet access.</>
            )}
          </span>
        );
      } else if (noMemberHosting) {
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
      } else if (noInternet) {
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
            {hasComputeServers && (
              <>&npsp;NOTE: Compute servers always have internet access.</>
            )}
          </span>
        );
      }
    }

    function renderLearnMore(color): React.JSX.Element {
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
      hasComputeServers ||
      !noMemberHosting ||
      !noInternet ||
      !no_licenses ||
      projectAgeDays < BANNER_NON_DISMISSABLE_DAYS;

    // don't show the banner if project is not running.
    // https://github.com/sagemathinc/cocalc/issues/6496
    // UNLESS it is a free project and not allowed to run
    // (banner must be visible when stopped, obviously)
    if (!projectIsRunning && allow_run !== false) {
      return null;
    }

    function renderClose() {
      return (
        <Tag
          style={{ marginTop: "10px", fontSize: style.fontSize }}
          color="#faad14"
        >
          <Icon name="times" /> Dismiss
        </Tag>
      );
    }

    function renderCountDown() {
      if (closable) return;

      return <CountdownProject fontSize={style.fontSize} />;
    }

    return (
      <Alert
        type="warning"
        closable={closable}
        closeIcon={renderClose()}
        style={style}
        banner={true}
        showIcon={!closable || (noInternet && noMemberHosting)}
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
              {renderCountDown()}
              {renderMessage()} {renderLearnMore(style.color)}
            </Paragraph>
            {showAddLicense ? (
              <BannerApplySiteLicense
                project_id={project_id}
                projectSiteLicenses={projectSiteLicenses}
                setShowAddLicense={setShowAddLicense}
              />
            ) : undefined}
          </>
        }
      />
    );
  },
);

interface ApplyLicenseProps {
  projectSiteLicenses: string[];
  project_id: string;
  setShowAddLicense: (show: boolean) => void;
}

export const BannerApplySiteLicense: React.FC<ApplyLicenseProps> = (
  props: ApplyLicenseProps,
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

interface CountdownProjectProps {
  fontSize: CSS["fontSize"];
}

function CountdownProject({ fontSize }: CountdownProjectProps) {
  const { status, project, project_id, actions } = useProjectContext();
  const limit_min = useTypedRedux("customize", "limit_free_project_uptime");
  const [showInfo, setShowInfo] = useState<boolean>(false);
  const openFiles = useTypedRedux({ project_id }, "open_files_order");
  const triggered = useRef<boolean>(false);
  const update = useForceUpdate();
  useInterval(update, 1000);

  if (
    status.get("state") !== "running" ||
    project == null ||
    limit_min == null ||
    limit_min <= 0
  ) {
    return null;
  }

  // start_ts is e.g. 1508576664416
  const start_ts = project.getIn(["status", "start_ts"]);
  if (start_ts == null && !showInfo) {
    return null;
  }

  const shutdown_ts = start_ts + 1000 * 60 * limit_min;
  const countdown = shutdown_ts - server_time().getTime();
  const countdown0 = countdown > 0 ? countdown : 0;

  if (countdown < 0 && !triggered.current) {
    triggered.current = true;

    // This closes all tabs and then stops the project.
    openFiles.map((path) => actions?.close_tab(path));
    redux.getActions("projects").stop_project(project_id);
    track(TRACK_KEY, { what: "shutdown", project_id });
  }

  function renderInfo() {
    return (
      <Modal
        title={
          <Space>
            <Icon name="hand-stop" /> Automatic Project Shutdown
          </Space>
        }
        open={showInfo}
        onOk={() => open_new_tab(BUY_A_LICENSE_URL)}
        onCancel={() => setShowInfo(false)}
      >
        <Paragraph>
          <A href={"https://doc.cocalc.com/trial.html"}>Trial projects</A> have
          a maximum uptime of {limit_min} minutes. After that period, the
          project will stop and interrupt your work.
        </Paragraph>
        <Paragraph strong>
          This shutdown timer only exists for projects without any upgrades!
        </Paragraph>
        <CallToSupport />
      </Modal>
    );
  }

  return (
    <>
      {renderInfo()}
      <Tooltip title="Automatic Project Shutdown: click for details...">
        <Tag
          style={{
            marginTop: "5px",
            fontSize,
            float: "right",
            fontWeight: "bold",
            cursor: "pointer",
          }}
          color={"red"}
          onClick={() => {
            setShowInfo(true);
            track(TRACK_KEY, { what: "countdown-click", project_id });
          }}
        >
          <TimeAmount
            key={"time"}
            amount={countdown0}
            compact={true}
            showIcon={true}
            countdown={countdown0}
            style={{ color: COLORS.ANTD_RED }}
          />
        </Tag>
      </Tooltip>
    </>
  );
}
