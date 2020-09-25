/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as humanizeList from "humanize-list";
import { server_time } from "../frame-editors/generic/client";
import {
  CSS,
  React,
  redux,
  useMemo,
  useTypedRedux,
  useStore,
} from "../app-framework";
const { Alert } = require("react-bootstrap");
import { Icon, A } from "../r_misc";
const trial_url = "https://doc.cocalc.com/trial.html";
import { allow_project_to_run } from "./client-side-throttle";

// explains implications for having no internet and/or no member hosting
const A_STYLE = {
  cursor: "pointer",
  color: "white",
  fontWeight: "bold",
} as CSS;

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

  function message(host: boolean, internet: boolean): JSX.Element | undefined {
    const allow_run = allow_project_to_run(project_id);

    const proj_created =
      project_map?.getIn([project_id, "created"]) ?? new Date(0);
    const age_ms: number = server_time().getTime() - proj_created.getTime();
    const age_days = age_ms / (24 * 60 * 60 * 1000);

    const trial_project = (
      <strong>
        <A href={trial_url} style={A_STYLE}>
          Free Trial (Day {Math.floor(age_days)})
        </A>
      </strong>
    );
    const no_internet =
      "you can't install packages, clone from GitHub, or download datasets";
    const no_host = ["expect VERY bad performance (e.g., 10 times slower!)"];
    const inetquota =
      "https://doc.cocalc.com/billing.html#what-exactly-is-the-internet-access-quota";
    const memberquota =
      "https://doc.cocalc.com/billing.html#what-is-member-hosting";
    const buy_and_upgrade = (
      <>
        <a
          style={A_STYLE}
          onClick={() => {
            redux.getActions("page").set_active_tab("account");
            redux.getActions("account").set_active_tab("licenses");
          }}
        >
          <u>buy a license</u> (starting at about $3/month!)
        </a>{" "}
        and{" "}
        <a
          style={A_STYLE}
          onClick={() => {
            redux.getProjectActions(project_id).set_active_tab("settings");
          }}
        >
          <u>apply it to this project</u>
        </a>
      </>
    );
    if (!allow_run) {
      return (
        <span>
          {trial_project} - There are too many free trial projects running right
          now. Try again later or {buy_and_upgrade}.
        </span>
      );
    }
    if (host && internet) {
      return (
        <span>
          {trial_project} – {buy_and_upgrade}.
          <br />
          Otherwise, {humanizeList([...no_host, no_internet])}
          {"."}
        </span>
      );
    } else if (host) {
      return (
        <span>
          {trial_project} – upgrade to{" "}
          <A href={memberquota} style={A_STYLE}>
            Member Hosting
          </A>{" "}
          or {humanizeList(no_host)}
          {"."}
        </span>
      );
    } else if (internet) {
      return (
        <span>
          <strong>No internet access</strong> – upgrade{" "}
          <A href={inetquota} style={A_STYLE}>
            Internet Access
          </A>{" "}
          or {no_internet}
          {"."}
        </span>
      );
    }
  }

  function render_learn_more(color): JSX.Element {
    return (
      <>
        {" – "}
        <A
          href={trial_url}
          style={{ fontWeight: "bold", color: color, cursor: "pointer" }}
        >
          more info
        </A>
        {"..."}
      </>
    );
  }

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

  const style = {
    padding: "5px 10px",
    marginBottom: 0,
    fontSize: "12pt",
    borderRadius: 0,
    color: "white",
    background: "red",
  } as CSS;

  const mesg = message(host, internet);

  return (
    <Alert bsStyle="warning" style={style}>
      <Icon
        name="exclamation-triangle"
        style={{ float: "right", marginTop: "3px" }}
      />
      <Icon name="exclamation-triangle" /> {mesg}
      {render_learn_more(style.color)}
    </Alert>
  );
});
