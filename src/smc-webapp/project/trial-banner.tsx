/*
 * Copyright 2020 Sagemath, Inc.
 */

import * as immutable from "immutable";
import * as humanizeList from "humanize-list";
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
  free_warning_extra_shown: boolean;
  free_warning_closed: boolean;
  project_log: any;
  is_commercial: boolean;
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
        free_warning_extra_shown: rtypes.bool,
        free_warning_closed: rtypes.bool,
        project_log: rtypes.immutable,
      },
    };
  }

  public shouldComponentUpdate(next) {
    return (
      this.props.free_warning_extra_shown != next.free_warning_extra_shown ||
      this.props.free_warning_closed != next.free_warning_closed ||
      this.props.project_map?.get(this.props.project_id) !=
        next.project_map?.get(this.props.project_id) ||
      this.props.other_settings?.get("no_free_warnings") !=
        next.other_settings?.get("no_free_warnings")
    );
  }

  private extra(host, internet): Rendered {
    if (!this.props.free_warning_extra_shown) {
      return undefined;
    }
    return (
      <div>
        {host && (
          <span>
            This project runs on a heavily loaded server that may be unavailable
            during peak hours and is rebooted at least once a day.
            <br /> Upgrade your project to run on a members-only server for more
            reliability and faster code execution.
          </span>
        )}

        {internet && (
          <span>
            <br /> This project does not have external network access, so you
            cannot install software or download data from external websites.
          </span>
        )}
        <ul>
          <li style={{ lineHeight: "32px" }}>
            Upgrade <em>this</em> project in{" "}
            <a
              style={{ cursor: "pointer" }}
              onClick={() =>
                redux.getActions("page").set_active_tab("settings")
              }
            >
              Project Settings
            </a>
          </li>
          <li style={{ lineHeight: "32px" }}>
            Visit{" "}
            <a
              style={{ cursor: "pointer" }}
              onClick={() => {
                redux.getActions("page").set_active_tab("account");
                redux.getActions("account").set_active_tab("billing");
              }}
            >
              Billing
            </a>{" "}
            to <em>subscribe</em> to a plan
          </li>
        </ul>
      </div>
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

  private message(host: boolean, internet: boolean): Rendered {
    // implications for having no internet and/or no member hosting
    const trial_project = (
      <strong>
        <A href={trial_url}>Trial Project</A>
      </strong>
    );
    const no_internet =
      "you can't install software packages, connect to GitHub, or send email notifications";
    const no_host = ["expect poor performance", "random interruptions"];
    const inetquota =
      "https://doc.cocalc.com/billing.html#what-exactly-is-the-internet-access-quota";
    const memberquota =
      "https://doc.cocalc.com/billing.html#what-is-member-hosting";
    const upgrade = (
      <a
        style={{ cursor: "pointer" }}
        onClick={() => {
          redux.getActions("page").set_active_tab("account");
          redux.getActions("account").set_active_tab("billing");
        }}
      >
        get upgrades
      </a>
    );
    if (host && internet) {
      return (
        <span>
          {trial_project} – {upgrade} or{" "}
          {humanizeList([...no_host, no_internet])}
          {"."}
        </span>
      );
    } else if (host) {
      return (
        <span>
          {trial_project} – Upgrade <A href={memberquota}>Member Hosting</A> or{" "}
          {humanizeList(no_host)}
          {"."}
        </span>
      );
    } else if (internet) {
      return (
        <span>
          <strong>No internet access</strong> – Upgrade{" "}
          <A href={inetquota}>Internet Access</A> or {no_internet}
          {"."}
        </span>
      );
    }
  }

  private render_learn_more(color): Rendered {
    return (
      // <>
      //   {" "}
      //   &mdash;{" "}
      //   <A
      //     href={trial_url}
      //     style={{ fontWeight: "bold", color: color, cursor: "pointer" }}
      //   >
      //     more info
      //   </A>
      //   {"..."}
      // </>

      <a
        onClick={() =>
          redux
            .getProjectActions(this.props.project_id)
            .show_extra_free_warning()
        }
        style={{ color: color, cursor: "pointer" }}
      >
        {" "}
        learn more...
      </a>
    );
  }

  public render(): Rendered {
    if (this.props.other_settings?.get("no_free_warnings")) {
      return undefined;
    }
    if (!this.props.is_commercial) {
      return undefined;
    }
    if (this.props.is_anonymous) {
      // No need to provide all these warnings and scare anonymous users, who are just
      // playing around for the first time (and probably wouldn't read this, and should
      // assume strong limitations since they didn't even make an account).
      return undefined;
    }
    if (this.props.free_warning_closed) {
      return undefined;
    }
    const pay: boolean = !!this.props.date_when_course_payment_required(
      this.props.project_id
    );
    if (pay) {
      return undefined;
    }
    const quotas = this.props.get_total_project_quotas(this.props.project_id);
    if (quotas == null) {
      return undefined;
    }
    const host: boolean = !quotas.member_host;
    const internet: boolean = !quotas.network;
    if (!host && !internet) {
      return undefined;
    }

    const font_size: number = Math.min(
      18,
      10 + (this.props.project_log?.size ?? 0) / 30
    );
    const styles: React.CSSProperties = {
      padding: "5px 10px",
      marginBottom: 0,
      fontSize: font_size + "pt",
    };
    if (host && font_size > 11) {
      styles.color = "white";
      styles.background = "red";
    }

    const mesg = this.message(host, internet);

    return (
      <Alert bsStyle="warning" style={styles}>
        <Icon
          name="exclamation-triangle"
          style={{ float: "right", marginTop: "3px" }}
        />
        <Icon name="exclamation-triangle" /> {mesg}
        {this.render_learn_more(styles.color)}
        {this.render_dismiss()}
        {this.extra(host, internet)}
      </Alert>
    );
  }
}

export const TrialBanner = rclass(TrialBannerComponent);
