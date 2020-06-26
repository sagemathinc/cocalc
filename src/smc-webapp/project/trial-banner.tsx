/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as humanizeList from "humanize-list";
import { server_time } from "../frame-editors/generic/client";
import { React, redux, useMemo, useRedux, useStore } from "../app-framework";
const { Alert } = require("react-bootstrap");
import { Icon, A } from "../r_misc";
const trial_url = "https://doc.cocalc.com/trial.html";

interface Props {
  project_id: string;
}

export const TrialBanner: React.FC<Props> = React.memo(({ project_id }) => {
  const other_settings = useRedux(["account", "other_settings"]);
  const is_anonymous = useRedux(["account", "is_anonymous"]);
  const project_map = useRedux(["projects", "project_map"]);
  const projects_store = useStore("projects");
  const total_project_quotas = useMemo(
    () => projects_store.get_total_project_quotas(project_id),
    [project_map, project_id]
  );
  const pay = useMemo(
    () => projects_store.date_when_course_payment_required(project_id),
    [project_map, project_id]
  );
  const is_commercial = useRedux(["customize", "is_commercial"]);

  // note: closing this is currently disabled.
  const free_warning_closed = useRedux(["free_warning_closed"], project_id);

  function message(
    host: boolean,
    internet: boolean,
    color
  ): JSX.Element | undefined {
    // explains implications for having no internet and/or no member hosting
    const a_style: React.CSSProperties = {
      cursor: "pointer",
      color,
      fontWeight: "bold",
    };
    const trial_project = (
      <strong>
        <A href={trial_url} style={a_style}>
          Trial Project
        </A>
      </strong>
    );
    const no_internet =
      "you can't install Python packages, clone from GitHub, or download datasets";
    const no_host = ["expect poor performance", "random interruptions"];
    const inetquota =
      "https://doc.cocalc.com/billing.html#what-exactly-is-the-internet-access-quota";
    const memberquota =
      "https://doc.cocalc.com/billing.html#what-is-member-hosting";
    const buy_and_upgrade = (
      <>
        <a
          style={a_style}
          onClick={() => {
            redux.getActions("page").set_active_tab("account");
            redux.getActions("account").set_active_tab("billing");
          }}
        >
          buy a subscription
        </a>{" "}
        and{" "}
        <a
          style={a_style}
          onClick={() => {
            redux.getProjectActions(project_id).set_active_tab("settings");
          }}
        >
          apply upgrades
        </a>
      </>
    );
    if (host && internet) {
      return (
        <span>
          {trial_project} – {buy_and_upgrade} or{" "}
          {humanizeList([...no_host, no_internet])}
          {"."}
        </span>
      );
    } else if (host) {
      return (
        <span>
          {trial_project} – upgrade{" "}
          <A href={memberquota} style={a_style}>
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
          <A href={inetquota} style={a_style}>
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

  // we want this to be between 10 to 14 and growing over time (weeks)
  const proj_created = project_map.getIn([project_id, "created"], new Date(0));

  const min_fontsize = 10;
  const age_ms: number = server_time().getTime() - proj_created.getTime();
  const age_days = age_ms / (24 * 60 * 60 * 1000);
  const font_size = Math.min(14, min_fontsize + age_days / 15);
  const style: React.CSSProperties = {
    padding: "5px 10px",
    marginBottom: 0,
    fontSize: font_size + "pt",
    borderRadius: 0,
    marginTop: "-3px",
  };
  // turns red after about 1 month (2 * 15, see above)
  if (host && font_size > min_fontsize + 2) {
    style.color = "white";
    style.background = "red";
  }

  const mesg = message(host, internet, style.color);

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
