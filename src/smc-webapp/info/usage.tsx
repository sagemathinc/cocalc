/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useRedux, useTypedRedux } from "../app-framework";
import { Icon, Loading, TimeAgo } from "../r_misc";
import { ProgressBar, Table } from "react-bootstrap";
import { RECENT_TIMES_KEY } from "smc-util/schema";
import { Col } from "../antd-bootstrap";
import { KUCALC_COCALC_COM } from "smc-util/db-schema/site-defaults";

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

export const Usage: React.FC<{}> = () => {
  const kucalc = useTypedRedux("customize", "kucalc");
  const loading = useRedux(["server_stats", "loading"]) ?? true;
  const hub_servers = useRedux(["server_stats", "hub_servers"])?.toJS();
  const running_projects = useRedux([
    "server_stats",
    "running_projects",
  ])?.toJS();
  const time = useRedux(["server_stats", "time"]);
  const accounts_created = useRedux([
    "server_stats",
    "accounts_created",
  ])?.toJS();
  const accounts_active = useRedux(["server_stats", "accounts_active"])?.toJS();
  const projects_created = useRedux([
    "server_stats",
    "projects_created",
  ])?.toJS();
  const projects_edited = useRedux(["server_stats", "projects_edited"])?.toJS();
  const files_opened = useRedux(["server_stats", "files_opened"])?.toJS();

  function number_of_active_users(): number {
    if (hub_servers == null || hub_servers.length === 0) {
      return 0;
    } else {
      return hub_servers.map((x) => x.clients).reduce((s, t) => s + t);
    }
  }

  function number_of_running_projects(): number {
    if (running_projects == null) {
      return 0;
    } else {
      const { free, member } = running_projects;
      return (free ?? 0) + (member ?? 0);
    }
  }

  function render_live_stats(): JSX.Element {
    if (loading) {
      return (
        <div>
          {" "}
          Live server stats <Loading />{" "}
        </div>
      );
    } else {
      const n = number_of_active_users();
      const p = number_of_running_projects();
      const pmax = Math.max(2000, Math.ceil(p / 1000) * 1000);
      return (
        <>
          <div style={{ textAlign: "center" }}>
            Currently active users
            <ProgressBar
              style={{ marginBottom: "10px" }}
              now={Math.max(n / 12, 45 / 8)}
              label={`${n} active users`}
            />
          </div>
          {kucalc == KUCALC_COCALC_COM && (
            <div style={{ textAlign: "center" }}>
              Currently active projects
              <ProgressBar
                style={{ marginBottom: "10px" }}
                max={pmax}
                now={Math.max(p, pmax * 0.05)}
                label={`${p} active projects`}
              />
            </div>
          )}
        </>
      );
    }
  }

  function timespan_keys(): string[] {
    return ["last_hour", "last_day", "last_week", "last_month"];
  }

  function recent_usage_stats_rows(): JSX.Element[] {
    const stats = [
      ["Active users", accounts_active],
      ["Active projects", projects_edited],
      ["New users", accounts_created],
      ["New projects", projects_created],
    ];

    return stats.map((stat) => (
      <tr key={stat[0] as string}>
        <th style={{ textAlign: "left" }}>{stat[0]}</th>
        {timespan_keys().map((k) => (
          <td key={k}>
            {fmt_large(
              stat[1] != null ? stat[1][RECENT_TIMES_KEY[k]] : undefined
            )}
          </td>
        ))}
      </tr>
    ));
  }

  function render_filetype_stats_totals_row(ext: string): JSX.Element[] {
    const result: JSX.Element[] = [];
    for (const timespan of timespan_keys()) {
      const k = RECENT_TIMES_KEY[timespan];
      let total: number = 0;
      if (files_opened != null) {
        const t = files_opened.total;
        if (t != null && t[k] != null && t[k][ext] != null) {
          total = t[k][ext];
        }
      }
      result.push(<td key={k}>{fmt_large(total)}</td>);
    }
    return result;
  }

  function render_filetype_stats_rows(): JSX.Element[] {
    const stats = [
      ["Jupyter Notebooks", "ipynb"],
      ["Linux Terminals", "term"],
      ["Python Files", "py"],
      ["PDF Files", "pdf"],
      ["Sage Worksheets", "sagews"],
      ["LaTeX Documents", "tex"],
      ["Markdown Documents", "md"],
      ["R Markdown Documents", "rmd"],
    ];
    const result: JSX.Element[] = [];
    for (const [name, ext] of stats) {
      result.push(
        <tr key={name}>
          <td style={{ textAlign: "left" }}>{name}</td>
          {render_filetype_stats_totals_row(ext)}
        </tr>
      );
    }
    return result;
  }

  function render_recent_usage_stats(): JSX.Element | undefined {
    if (loading) {
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
          {recent_usage_stats_rows()}
          <tr>
            <td colSpan={5}>&nbsp;</td>
          </tr>
          <tr>
            <th style={{ textAlign: "left" }}>Edited files</th>
            <td colSpan={4}>&nbsp;</td>
          </tr>
          {render_filetype_stats_rows()}
        </tbody>
      </Table>
    );
  }

  function render_when_updated(): JSX.Element | undefined {
    if (!time) return;
    return (
      <span style={{ fontSize: "9pt", marginLeft: "20px", color: "#666" }}>
        updated <TimeAgo date={new Date(time)} />
      </span>
    );
  }

  // TODO: I changed to the share link since the raw link is no longer support (XSS attacks).
  // Unfortunately, it *will* be stale until we improve how things work; the only workaround
  // is to sign into that project and manually edit something right now...
  return (
    <Col sm={12} md={6}>
      <h3>
        <Icon name="dashboard" /> Statistics
        {render_when_updated()}
      </h3>
      <div>
        {render_live_stats()}
        <div style={{ marginTop: 20, textAlign: "center" }}>
          Recent user activity
        </div>
        {render_recent_usage_stats()}
      </div>
    </Col>
  );
};
