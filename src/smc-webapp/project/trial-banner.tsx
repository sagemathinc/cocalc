/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as immutable from "immutable";
import * as humanizeList from "humanize-list";
import { server_time } from "../frame-editors/generic/client";
import {
  Rendered,
  Component,
  React,
  rclass,
  rtypes,
  redux,
} from "../app-framework";
const { Alert } = require("react-bootstrap");
import { Icon, A } from "../r_misc";
const trial_url = "https://doc.cocalc.com/trial.html";

interface TrialBannerProps {
  project_id: string;
  other_settings: immutable.Map<string, any>;
  is_anonymous: boolean;
  project_map: immutable.Map<string, any>;
  get_total_project_quotas: Function;
  date_when_course_payment_required: Function;
  project_log: any;
  is_commercial: boolean;
  free_warning_closed: boolean;
}

class TrialBannerComponent extends Component<TrialBannerProps> {
  displayName = "TrialProjectBanner";

  static reduxProps({ name }) {
    return {
      account: {
        other_settings: rtypes.immutable.Map,
        is_anonymous: rtypes.bool,
      },
      // get_total_project_quotas relys on this data
      // Will be removed by #1084
      projects: {
        project_map: rtypes.immutable.Map,
        get_total_project_quotas: rtypes.func,
        date_when_course_payment_required: rtypes.func,
      },
      customize: {
        is_commercial: rtypes.bool,
      },
      [name]: {
        free_warning_closed: rtypes.bool,
        project_log: rtypes.immutable,
      },
    };
  }

  public shouldComponentUpdate(next) {
    return (
      this.props.free_warning_closed != next.free_warning_closed ||
      this.props.project_map?.get(this.props.project_id) !=
        next.project_map?.get(this.props.project_id) ||
      this.props.other_settings?.get("no_free_warnings") !=
        next.other_settings?.get("no_free_warnings")
    );
  }

  private render_dismiss() {
    return; // disabled
    //dismiss_styles ={
    //    cursor     : 'pointer',
    //    display    : 'inline-block',
    //    float      : 'right',
    //    fontWeight : 700
    //    top        : -4
    //    fontSize   : "13pt",
    //    color      : 'grey',
    //    position   : 'relative',
    //    height     : 0}
    //return (<a style={dismiss_styles} onClick={this.props.actions(project_id: this.props.project_id).close_free_warning}>×</a>)
  }

  private message(host: boolean, internet: boolean, color): Rendered {
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
            redux
              .getProjectActions(this.props.project_id)
              .set_active_tab("settings");
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

  private render_learn_more(color): Rendered {
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

  public render() {
    if (this.props.other_settings?.get("no_free_warnings")) {
      return null;
    }
    if (!this.props.is_commercial) {
      return null;
    }
    if (this.props.is_anonymous) {
      // No need to provide all these warnings and scare anonymous users, who are just
      // playing around for the first time (and probably wouldn't read this, and should
      // assume strong limitations since they didn't even make an account).
      return null;
    }
    if (this.props.free_warning_closed) {
      return null;
    }
    const pay: boolean = !!this.props.date_when_course_payment_required(
      this.props.project_id
    );
    if (pay) {
      return null;
    }
    const quotas = this.props.get_total_project_quotas(this.props.project_id);
    if (quotas == null) {
      return null;
    }
    const host: boolean = !quotas.member_host;
    const internet: boolean = !quotas.network;
    if (!host && !internet) {
      return null;
    }

    // we want this to be between 10 to 14 and growing over time (weeks)
    const proj_created = this.props.project_map.getIn(
      [this.props.project_id, "created"],
      new Date(0)
    );

    const min_fontsize = 10;
    const age_ms: number = server_time().getTime() - proj_created.getTime();
    const age_days = age_ms / (24 * 60 * 60 * 1000);
    const font_size = Math.min(14, min_fontsize + age_days / 15);
    const styles: React.CSSProperties = {
      padding: "5px 10px",
      marginBottom: 0,
      fontSize: font_size + "pt",
      borderRadius: 0,
      marginTop: "-3px",
    };
    // turns red after about 1 month (2 * 15, see above)
    if (host && font_size > min_fontsize + 2) {
      styles.color = "white";
      styles.background = "red";
    }

    const mesg = this.message(host, internet, styles.color);

    return (
      <Alert bsStyle="warning" style={styles}>
        <Icon
          name="exclamation-triangle"
          style={{ float: "right", marginTop: "3px" }}
        />
        <Icon name="exclamation-triangle" /> {mesg}
        {this.render_learn_more(styles.color)}
        {this.render_dismiss()}
      </Alert>
    );
  }
}

export const TrialBanner = rclass(TrialBannerComponent);
