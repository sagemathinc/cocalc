/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
//#############################################################################
//
//    CoCalc: Collaborative Calculation in the Cloud
//
//    Copyright (C) 2016, Sagemath Inc.
//
//    This program is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.
//
//    This program is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with this program.  If not, see <http://www.gnu.org/licenses/>.
//
//##############################################################################

/*
 * Info Page
 */

import { copy } from "smc-util/misc";
import { React, rtypes, rclass, Rendered } from "../app-framework";
import { ProgressBar, Table } from "react-bootstrap";
import { Col, Row } from "../antd-bootstrap";
import { Icon, Loading, Space, TimeAgo, Footer } from "../r_misc";
import { SiteDescription } from "../customize";
import { RECENT_TIMES_KEY } from "smc-util/schema";

const { ComputeEnvironment } = require("../compute_environment");

import { COLORS } from "smc-util/theme";

import {
  SUPPORT_LINKS,
  CONNECT_LINKS,
  THIRD_PARTY,
  ABOUT_LINKS
} from "./links";

// List item style
export const li_style: React.CSSProperties = {
  lineHeight: "inherit",
  marginBottom: "10px"
};

// improve understanding of large numbers
function fmt_large(num) {
  num = parseInt(num);
  if (localStorage.fmt_large) {
    return num.toLocaleString(undefined, {
      useGrouping: true,
      maximumSignificantDigits: 2
    });
  } else {
    return num.toLocaleString();
  }
}
//num += 31 * num + 7890
// num.toLocaleString(undefined, {useGrouping:true, maximumSignificantDigits: 2})

const HelpPageUsageSection = rclass({
  reduxProps: {
    server_stats: {
      loading: rtypes.bool.isRequired,
      hub_servers: rtypes.array,
      time: rtypes.object,
      accounts: rtypes.number,
      projects: rtypes.number,
      accounts_created: rtypes.object, // {RECENT_TIMES.key → number, ...}
      projects_created: rtypes.object, // {RECENT_TIMES.key → number, ...}
      projects_edited: rtypes.object, // {RECENT_TIMES.key → number, ...}
      files_opened: rtypes.object
    }
  },

  displayName: "HelpPage-HelpPageUsageSection",

  getDefaultProps() {
    return { loading: true };
  },

  number_of_active_users() {
    if (this.props.hub_servers.length === 0) {
      return 0;
    } else {
      return this.props.hub_servers.map(x => x.clients).reduce((s, t) => s + t);
    }
  },

  render_active_users_stats() {
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
  },

  render_active_projects_stats() {
    const n =
      this.props.projects_edited != null
        ? this.props.projects_edited[RECENT_TIMES_KEY.active]
        : undefined;
    return (
      <ProgressBar
        now={Math.max(n / 3, 60 / 2)}
        label={`${n} projects being edited`}
      />
    );
  },

  timespan_keys() {
    return ["last_hour", "last_day", "last_week", "last_month"];
  },

  recent_usage_stats_rows() {
    const stats = [
      ["Modified projects", this.props.projects_edited],
      ["Created projects", this.props.projects_created],
      ["Created accounts", this.props.accounts_created]
    ];

    return stats.map(stat => (
      <tr key={stat[0]}>
        <th style={{ textAlign: "left" }}>{stat[0]}</th>
        {this.timespan_keys().map(k => (
          <td key={k}>
            {fmt_large(
              stat[1] != null ? stat[1][RECENT_TIMES_KEY[k]] : undefined
            )}
          </td>
        ))}
      </tr>
    ));
  },

  render_filetype_stats_rows() {
    const stats = [
      ["Sage Worksheets", "sagews"],
      ["Jupyter Notebooks", "ipynb"],
      ["LaTeX Documents", "tex"],
      ["Markdown Documents", "md"]
    ];
    //if DEBUG then console.log('@props.files_opened', @props.files_opened)
    return (() => {
      const result: Rendered[] = [];
      for (const [name, ext] of stats) {
        result.push(
          <tr key={name}>
            <th style={{ textAlign: "left" }}>{name}</th>
            {(() => {
              const result1: Rendered[] = [];
              for (let timespan of this.timespan_keys()) {
                var k = RECENT_TIMES_KEY[timespan];
                const total =
                  __guard__(
                    __guard__(
                      this.props.files_opened != null
                        ? this.props.files_opened.total
                        : undefined,
                      x1 => x1[k]
                    ),
                    x => x[ext]
                  ) != null
                    ? __guard__(
                        __guard__(
                          this.props.files_opened != null
                            ? this.props.files_opened.total
                            : undefined,
                          x1 => x1[k]
                        ),
                        x => x[ext]
                      )
                    : 0;
                //distinct = @props.files_opened?.distinct?[k]?[ext] ? 0
                result1.push(<td key={k}>{fmt_large(total)}</td>);
              }
              return result1;
            })()}
          </tr>
        );
      }
      return result;
    })();
  },

  render_recent_usage_stats() {
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
  },

  render_historical_metrics() {
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
  },

  render_when_updated() {
    if (this.props.time) {
      return (
        <span style={{ fontSize: "9pt", marginLeft: "20px", color: "#666" }}>
          updated <TimeAgo date={new Date(this.props.time)} />
        </span>
      );
    }
  },

  render() {
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
          <Icon name="line-chart" fixedWidth />{" "}
          <a
            target="_blank"
            href="https://cocalc.com/7561f68d-3d97-4530-b97e-68af2fb4ed13/raw/stats.html"
          >
            Historical CoCalc Usage Statistics...
          </a>
          <br />
          {this.render_historical_metrics()}
        </div>
      </Col>
    );
  }
} as any);

const LinkList: any = rclass({
  displayName: "HelpPage-LinkList",

  propTypes: {
    title: rtypes.string.isRequired,
    icon: rtypes.string.isRequired,
    links: rtypes.object.isRequired,
    width: rtypes.number
  },

  getDefaultProps() {
    return { width: 6 };
  },

  render_links() {
    return (() => {
      const result: Rendered[] = [];
      for (let name in this.props.links) {
        const data = this.props.links[name];
        if (data.commercial && !require("../customize").commercial) {
          continue;
        }
        const style = copy(li_style);
        if (data.bold) {
          style.fontWeight = "bold";
        }
        const is_target_blank =
          (data.href != null ? data.href.indexOf("#") : undefined) !== 0;

        result.push(
          <div
            key={name}
            style={style}
            className={data.className != null ? data.className : undefined}
          >
            <Icon name={data.icon} fixedWidth />{" "}
            {data.href ? (
              <a
                target={is_target_blank ? "_blank" : undefined}
                rel={is_target_blank ? "noopener" : undefined}
                href={data.href}
              >
                {data.link}
              </a>
            ) : (
              undefined
            )}
            {data.text ? (
              <span style={{ color: COLORS.GRAY_D }}>
                {data.href ? <span> &mdash; </span> : undefined}
                {data.text}
              </span>
            ) : (
              undefined
            )}
          </div>
        );
      }
      return result;
    })();
  },

  render() {
    return (
      <Col md={this.props.width} sm={12}>
        {this.props.title ? (
          <h3>
            {" "}
            <Icon name={this.props.icon} /> {this.props.title}
          </h3>
        ) : (
          undefined
        )}
        {this.render_links()}
      </Col>
    );
  }
} as any);

const ThirdPartySoftware = rclass({
  displayName: "Help-ThirdPartySoftware",
  render() {
    return (
      <LinkList title="Software" icon="question-circle" links={THIRD_PARTY} />
    );
  }
} as any);

export function render_static_third_party_software() {
  return (
    <LinkList title="" icon="question-circle" width={12} links={THIRD_PARTY} />
  );
}

let _HelpPage = rclass({
  displayName: "HelpPage",

  render_compute_env() {
    return (
      <Row>
        <ComputeEnvironment />
      </Row>
    );
  },

  render() {
    const banner_style: React.CSSProperties = {
      backgroundColor: "white",
      padding: "15px",
      border: `1px solid ${COLORS.GRAY}`,
      borderRadius: "5px",
      margin: "20px 0",
      width: "100%",
      fontSize: "115%",
      textAlign: "center",
      marginBottom: "30px"
    };

    // imports stuff that can't be imported in update_react_static.
    const { ShowSupportLink } = require("../support");
    const { APP_LOGO } = require("../art");

    return (
      <Row style={{ padding: "10px", margin: "0px", overflow: "auto" }}>
        <Col sm={10} smOffset={1} md={8} mdOffset={2} xs={12}>
          <h3 style={{ textAlign: "center", marginBottom: "30px" }}>
            <img src={`${APP_LOGO}`} style={{ width: "33%", height: "auto" }} />
            <br />
            <SiteDescription />
          </h3>

          <div style={banner_style}>
            <Icon name="medkit" />
            <Space />
            <Space />
            <strong>
              In case of any questions or problems, <em>do not hesitate</em> to
              create a <ShowSupportLink />.
            </strong>
            <br />
            We want to know if anything is broken!
          </div>

          <Row>
            <LinkList
              title="Help and support"
              icon="support"
              links={SUPPORT_LINKS}
            />
            <LinkList title="Connect" icon="plug" links={CONNECT_LINKS} />
          </Row>
          <Row style={{ marginTop: "20px" }}>
            <ThirdPartySoftware />
            <HelpPageUsageSection />
          </Row>
          <Row>
            {require("../customize").commercial ? (
              <LinkList
                title="About"
                icon="info-circle"
                links={ABOUT_LINKS}
                width={12}
              />
            ) : (
              undefined
            )}
          </Row>
          {this.render_compute_env()}
        </Col>
        <Col sm={1} md={2} xsHidden></Col>
        <Col xs={12} sm={12} md={12}>
          <Footer />
        </Col>
      </Row>
    );
  }
} as any);

export { _HelpPage as HelpPage };

export function render_static_about() {
  return (
    <Col>
      <Row>
        <LinkList title="Help & Support" icon="support" links={SUPPORT_LINKS} />
        <LinkList title="Connect" icon="plug" links={CONNECT_LINKS} />
      </Row>
      <Row style={{ marginTop: "20px" }}>
        <ThirdPartySoftware />
        <HelpPageUsageSection />
      </Row>
    </Col>
  );
}

export let _test = {
  HelpPageSupportSection: (
    <LinkList title="Help & Support" icon="support" links={SUPPORT_LINKS} />
  ),
  ConnectSection: (
    <LinkList title="Connect" icon="plug" links={CONNECT_LINKS} />
  ),
  SUPPORT_LINKS,
  CONNECT_LINKS
};

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}
