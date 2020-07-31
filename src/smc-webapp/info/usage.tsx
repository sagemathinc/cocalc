/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Component, React, rclass, rtypes, Rendered } from "../app-framework";
import { Icon, Loading, TimeAgo } from "../r_misc";
import { ProgressBar, Table } from "react-bootstrap";
import { RECENT_TIMES_KEY } from "smc-util/schema";
import { li_style } from "./style";
import { Col } from "../antd-bootstrap";

// improve understanding of large numbers
function fmt_large(num) {
  num = parseInt(num);
  if (localStorage.fmt_large) {
    return num.toLocaleString(undefined, {
      useGrouping: true,
    });
  } else {
    return num.toLocaleString();
  }
}

type RecentTimes = "1d" | "1h" | "7d" | "30d";

interface Props {
  loading?: boolean;
  hub_servers?: { clients: number }[];
  time?: Date;
  accounts?: number;
  projects?: number;
  accounts_created?: { [key in RecentTimes]: number };
  projects_created?: { [key in RecentTimes]: number };
  projects_edited?: { [key in RecentTimes]: number };
  files_opened?: {
    total: { [key in RecentTimes]: { [ext: string]: number } };
    distinct: { [key in RecentTimes]: { [ext: string]: number } };
  };
}

class Usage extends Component<Props> {
  public static reduxProps(): object {
    return {
      server_stats: {
        loading: rtypes.bool.isRequired,
        hub_servers: rtypes.array,
        time: rtypes.object,
        accounts: rtypes.number,
        projects: rtypes.number,
        accounts_created: rtypes.object, // {RECENT_TIMES.key → number, ...}
        projects_created: rtypes.object, // {RECENT_TIMES.key → number, ...}
        projects_edited: rtypes.object, // {RECENT_TIMES.key → number, ...}
        files_opened: rtypes.object,
      },
    };
  }

  public static get defaultProps() {
    return { loading: true };
  }

  private number_of_active_users(): number {
    if (this.props.hub_servers == null || this.props.hub_servers.length === 0) {
      return 0;
    } else {
      return this.props.hub_servers
        .map((x) => x.clients)
        .reduce((s, t) => s + t);
    }
  }

  private render_active_users_stats(): Rendered {
    if (this.props.loading) {
      return (
        <div>
          {" "}
          Live server stats <Loading />{" "}
        </div>
      );
    } else {
      const n = this.number_of_active_users();
      return (
        <div style={{ textAlign: "center" }}>
          Currently connected users
          <ProgressBar
            style={{ marginBottom: 10 }}
            now={Math.max(n / 12, 45 / 8)}
            label={`${n} connected users`}
          />
        </div>
      );
    }
  }

  private timespan_keys(): string[] {
    return ["last_hour", "last_day", "last_week", "last_month"];
  }

  private recent_usage_stats_rows(): Rendered[] {
    const stats = [
      ["Active projects", this.props.projects_edited],
      ["New projects", this.props.projects_created],
      ["New accounts", this.props.accounts_created],
    ];

    return stats.map((stat) => (
      <tr key={stat[0] as string}>
        <th style={{ textAlign: "left" }}>{stat[0]}</th>
        {this.timespan_keys().map((k) => (
          <td key={k}>
            {fmt_large(
              stat[1] != null ? stat[1][RECENT_TIMES_KEY[k]] : undefined
            )}
          </td>
        ))}
      </tr>
    ));
  }

  private render_filetype_stats_totals_row(ext: string): Rendered[] {
    const result: Rendered[] = [];
    for (const timespan of this.timespan_keys()) {
      const k = RECENT_TIMES_KEY[timespan];
      let total: number = 0;
      if (this.props.files_opened != null) {
        const t = this.props.files_opened.total;
        if (t != null && t[k] != null && t[k][ext] != null) {
          total = t[k][ext];
        }
      }
      result.push(<td key={k}>{fmt_large(total)}</td>);
    }
    return result;
  }

  private render_filetype_stats_rows(): Rendered[] {
    const stats = [
      ["Sage Worksheets", "sagews"],
      ["Jupyter Notebooks", "ipynb"],
      ["LaTeX Documents", "tex"],
      ["Markdown Documents", "md"],
    ];
    const result: Rendered[] = [];
    for (const [name, ext] of stats) {
      result.push(
        <tr key={name}>
          <th style={{ textAlign: "left" }}>{name}</th>
          {this.render_filetype_stats_totals_row(ext)}
        </tr>
      );
    }
    return result;
  }

  private render_recent_usage_stats(): Rendered {
    if (this.props.loading) {
      return;
    }
    return (
      <Table bordered condensed hover className="cc-help-stats-table">
        <thead>
          <tr>
            <th>past</th>
            <th>hour</th>
            <th>day</th>
            <th>week</th>
            <th>month</th>
          </tr>
        </thead>
        <tbody>
          {this.recent_usage_stats_rows()}
          <tr>
            <td colSpan={5}>&nbsp;</td>
          </tr>
          <tr>
            <th style={{ textAlign: "left" }}>Edited files</th>
            <td colSpan={4}>&nbsp;</td>
          </tr>
          {this.render_filetype_stats_rows()}
        </tbody>
      </Table>
    );
  }

  private render_historical_metrics(): Rendered {
    return; // disabled, due to being broken...
    return (
      <li key="usage_metrics" style={li_style}>
        <a
          target="_blank"
          href="https://cocalc.com/b97f6266-fe6f-4b40-bd88-9798994a04d1/raw/metrics/metrics.html"
        >
          <Icon name="area-chart" fixedWidth />
          Historical system metrics
        </a>{" "}
        &mdash; CPU usage, running projects and software instances, etc
      </li>
    );
  }

  private render_when_updated(): Rendered {
    if (!this.props.time) return;
    return (
      <span style={{ fontSize: "9pt", marginLeft: "20px", color: "#666" }}>
        updated <TimeAgo date={new Date(this.props.time)} />
      </span>
    );
  }

  public render(): Rendered {
    // TODO: I changed to the share link since the raw link is no longer support (XSS attacks).
    // Unfortunately, it *will* be stale until we improve how things work; the only workaround
    // is to sign into that project and manually edit something right now...
    return (
      <Col sm={12} md={6}>
        <h3>
          <Icon name="dashboard" /> Statistics
          {this.render_when_updated()}
        </h3>
        <div>
          {this.render_active_users_stats()}
          <div style={{ marginTop: 20, textAlign: "center" }}>
            Recent user activity
          </div>
          {this.render_recent_usage_stats()}
          <br />
          {this.render_historical_metrics()}
        </div>
      </Col>
    );
  }
}

const t = rclass(Usage);
export { t as Usage };
