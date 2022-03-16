/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  CSS,
  React,
  redux,
  useMemo,
  useStore,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { A, Icon } from "@cocalc/frontend/components";
import { server_time } from "@cocalc/frontend/frame-editors/generic/client";
import { Alert } from "antd";
import humanizeList from "humanize-list";
import { allow_project_to_run } from "./client-side-throttle";

export const DOC_TRIAL = "https://doc.cocalc.com/trial.html";

const ELEVATED_DAYS = 10;

// explains implications for having no internet and/or no member hosting
const A_STYLE: CSS = {
  cursor: "pointer",
  fontWeight: "bold",
} as const;

const A_STYLE_ELEVATED: CSS = {
  ...A_STYLE,
  color: "white",
};

const ALERT_STYLE: CSS = {
  padding: "5px 10px",
  marginBottom: 0,
  fontSize: "12pt",
  borderRadius: 0,
} as const;

const ALERT_STYLE_ELEVATED: CSS = {
  ...ALERT_STYLE,
  color: "white",
  background: "red",
} as const;

interface Props {
  project_id: string;
}

export const TrialBanner: React.FC<Props> = React.memo(({ project_id }) => {
  const other_settings = useTypedRedux("account", "other_settings");
  const is_anonymous = useTypedRedux("account", "is_anonymous");
  const project_map = useTypedRedux("projects", "project_map");
  const projects_store = useStore("projects");
  const total_project_quotas = useMemo(
    () => projects_store.get_total_project_quotas(project_id),
    [project_map, project_id]
  );
  const pay = useMemo(
    () => projects_store.date_when_course_payment_required(project_id),
    [project_map, project_id]
  );
  const is_commercial = useTypedRedux("customize", "is_commercial");

  // note: closing this is currently disabled.
  const free_warning_closed = useTypedRedux(
    { project_id },
    "free_warning_closed"
  );

  // paying usres are allowed to have a setting to hide banner unconditionally
  if (other_settings?.get("no_free_warnings")) {
    return null;
  }
  if (!is_commercial) {
    return null;
  }
  if (is_anonymous) {
    // No need to provide all these warnings and scare anonymous users, who are just
    // playing around for the first time (and probably wouldn't read this, and should
    // assume strong limitations since they didn't even make an account).
    return null;
  }
  if (free_warning_closed) {
    return null;
  }
  if (pay) {
    return null;
  }
  if (total_project_quotas == null) {
    return null;
  }
  const host: boolean = !total_project_quotas.member_host;
  const internet: boolean = !total_project_quotas.network;
  if (!host && !internet) {
    return null;
  }

  const proj_created =
    project_map?.getIn([project_id, "created"]) ?? new Date(0);

  return (
    <TrialBannerComponent
      project_id={project_id}
      proj_created={proj_created.getTime()}
      host={host}
      internet={internet}
    />
  );
});

interface BannerProps {
  project_id: string;
  host: boolean;
  internet: boolean;
  proj_created: number; // timestamp when project started
}

// string and URLs
const NO_INTERNET =
  "you can't install packages, clone from GitHub, or download datasets";
const NO_HOST = ["expect VERY bad performance (e.g., 10 times slower!)"];
const INET_QUOTA =
  "https://doc.cocalc.com/billing.html#what-exactly-is-the-internet-access-quota";
const MEMBER_QUOTA =
  "https://doc.cocalc.com/billing.html#what-is-member-hosting";
const ADD_LICENSE =
  "https://doc.cocalc.com/project-settings.html#project-add-license";

const TrialBannerComponent: React.FC<BannerProps> = React.memo(
  (props: BannerProps) => {
    const { host, internet, project_id, proj_created } = props;

    const age_ms: number = server_time().getTime() - proj_created;
    const ageDays = age_ms / (24 * 60 * 60 * 1000);

    const elevated = ageDays >= ELEVATED_DAYS;
    const style = elevated ? ALERT_STYLE_ELEVATED : ALERT_STYLE;
    const a_style = elevated ? A_STYLE_ELEVATED : A_STYLE;

    const trial_project = (
      <strong>
        <A href={DOC_TRIAL} style={a_style}>
          Free Trial (Day {Math.floor(ageDays)})
        </A>
      </strong>
    );

    function renderMessage(): JSX.Element | undefined {
      const buy_and_upgrade = (
        <>
          <a
            style={a_style}
            onClick={() => {
              redux.getActions("page").set_active_tab("account");
              const account_actions = redux.getActions("account");
              account_actions.set_show_purchase_form(true);
              account_actions.set_active_tab("licenses");
            }}
          >
            <u>buy a license</u> (starting at about $3/month)
          </a>{" "}
          and then{" "}
          <A style={a_style} href={ADD_LICENSE}>
            <u>apply it to this project</u>
          </A>
        </>
      );

      const allow_run = allow_project_to_run(project_id);
      if (!allow_run) {
        return (
          <span>
            {trial_project} - There are too many free trial projects running
            right now. Try again later or {buy_and_upgrade}.
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
            {trial_project} – upgrade to{" "}
            <A href={MEMBER_QUOTA} style={a_style}>
              <u>Member Hosting</u>
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
              <u>Internet Access</u>
            </A>{" "}
            or {NO_INTERNET}
            {"."}
          </span>
        );
      }
    }

    function renderLearnMore(color): JSX.Element {
      const style = {
        ...a_style,
        ...{ fontWeight: "bold" as "bold", color: color },
      };
      return (
        <>
          {" – "}
          <A href={DOC_TRIAL} style={style}>
            <u>more info</u>
          </A>
          {"..."}
        </>
      );
    }

    return (
      <Alert
        type="warning"
        style={style}
        icon={
          <Icon
            name="exclamation-triangle"
            style={{ float: "right", marginTop: "3px" }}
          />
        }
        description={
          <>
            <Icon name="exclamation-triangle" /> {renderMessage()}{" "}
            {renderLearnMore(style.color)}
          </>
        }
      />
    );
  }
);
