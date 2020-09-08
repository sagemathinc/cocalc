/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import "./project-upgrades-table";
import { Map } from "immutable";
import { round1, plural } from "smc-util/misc";
import { redux, rclass, rtypes, Component, React } from "../../app-framework";
import { Icon, Loading, Space } from "../../r_misc";

import { ExplainResources } from "../../billing/explain-resources";
import { ExplainPlan } from "../../billing/explain-plan";
import { DedicatedVM } from "../../billing/dedicated-vm";
import { FAQ } from "../../billing/faq";
import { SubscriptionGrid } from "../../billing/subscription-grid";
import {
  // HelpEmailLink,
  SiteName,
  PolicyPricingPageUrl,
  Footer,
} from "../../customize";
import { PROJECT_UPGRADES } from "smc-util/schema";

import { Row, Col, Panel } from "../../antd-bootstrap";
import { ProgressBar } from "react-bootstrap";
import { ProjectUpgradesTable } from "./project-upgrades-table";

interface reduxProps {
  stripe_customer?: Map<string, any>;
  project_map?: Map<string, any>;
  all_projects_have_been_loaded?: boolean;
}

class UpgradesPage extends Component<reduxProps> {
  static reduxProps() {
    return {
      projects: {
        project_map: rtypes.immutable.Map,
        all_projects_have_been_loaded: rtypes.bool,
      },
      account: {
        stripe_customer: rtypes.immutable.Map,
      },
    };
  }

  private render_no_upgrades(): JSX.Element {
    return (
      <div>
        <h3>Sign up</h3>
        To sign up for a subscription, visit the "Subscriptions and Course
        Packages tab".
        <ExplainResources type="shared" />
        <Space />
        <ExplainPlan type="personal" />
        <SubscriptionGrid periods={["month", "year"]} is_static={true} />
        <Space />
        <ExplainPlan type="course" />
        <SubscriptionGrid
          periods={["week", "month4", "year1"]}
          is_static={true}
        />
        <Space />
        <DedicatedVM />
        <hr />
        <FAQ />
        <Footer />
      </div>
    );
  }

  private render_have_upgrades(): JSX.Element {
    return (
      <div style={{ margin: "10px 0" }}>
        <h3>
          Thank you for supporting <SiteName />
        </h3>
        <span style={{ color: "#666" }}>
          We offer many{" "}
          <a href={PolicyPricingPageUrl} target="_blank" rel="noopener">
            {" "}
            pricing and subscription options
          </a>
          , which you can subscribe to in the Billing tab. Your upgrades are
          listed below, along with how you have applied them to projects. You
          can adjust your project upgrades from the settings page in any
          project.
        </span>
        <Space />
      </div>
    );
  }

  private render_upgrade(param, amount, used, darker): JSX.Element {
    const info = PROJECT_UPGRADES.params[param];
    const n = round1(amount != null ? info.display_factor * amount : 0);
    let u = round1(used != null ? info.display_factor * used : 0);
    if (u > n) {
      u = n;
    }
    const percent_used = Math.round((u / n) * 100);
    return (
      <Row key={param} style={darker ? { backgroundColor: "#eee" } : undefined}>
        <Col sm={2}>{info.display}</Col>
        <Col sm={3}>
          <Row>
            <Col sm={5}>
              {u != null ? (
                <span>
                  {u} {plural(u, info.display_unit)}
                </span>
              ) : undefined}
            </Col>
            <Col sm={7}>
              <ProgressBar
                striped
                now={percent_used}
                style={{ margin: "3px 0px", border: "1px solid grey" }}
              />
            </Col>
          </Row>
        </Col>
        <Col sm={2}>
          {n != null ? (
            <span>
              {n} {plural(n, info.display_unit)}
            </span>
          ) : undefined}
        </Col>
        <Col sm={5} style={{ color: "#666" }}>
          {info.desc}
        </Col>
      </Row>
    );
  }

  private render_upgrade_rows(upgrades, used): JSX.Element[] {
    let i = 1;
    const result: JSX.Element[] = [];
    for (let prop of PROJECT_UPGRADES.field_order) {
      const amount = upgrades[prop];
      i += 1;
      result.push(this.render_upgrade(prop, amount, used[prop], i % 2 === 0));
    }
    return result;
  }

  private render_upgrades(): JSX.Element {
    const upgrades = redux.getStore("account").get_total_upgrades();
    const used = redux
      .getStore("projects")
      .get_total_upgrades_you_have_applied();
    if (upgrades == null || used == null) {
      return this.render_no_upgrades();
    }

    // Ensure that all projects loaded -- this can change used above, which is fine,
    // and would re-render this component.  The issue is that it's conceivable you have
    // a project nobody has touched for a month, which has upgrades applied to it.
    redux.getActions("projects").load_all_projects();

    return (
      <Panel
        header={
          <span>
            <Icon name="tachometer-alt" /> Upgrades from your subscriptions and
            course packages
          </span>
        }
      >
        <Row key="header">
          <Col sm={2}>
            <strong>Quota</strong>
          </Col>
          <Col sm={3}>
            <strong>Used</strong>
          </Col>
          <Col sm={2}>
            <strong>Purchased</strong>
          </Col>
          <Col sm={5}>
            <strong>Description</strong>
          </Col>
        </Row>
        {this.render_upgrade_rows(upgrades, used)}
      </Panel>
    );
  }

  public render(): JSX.Element {
    if (this.props.project_map == null) {
      return <Loading theme={"medium"} />;
    }
    if (!this.props.all_projects_have_been_loaded) {
      // See https://github.com/sagemathinc/cocalc/issues/3802
      redux.getActions("projects").load_all_projects();
      return <Loading theme={"medium"} />;
    }
    if (!this.props.stripe_customer?.getIn(["subscriptions", "total_count"])) {
      return this.render_no_upgrades();
    } else {
      return (
        <div>
          {this.render_have_upgrades()}
          {this.render_upgrades()}
          <ProjectUpgradesTable />
          <Footer />
        </div>
      );
    }
  }
}

const tmp = rclass(UpgradesPage);
export { tmp as UpgradesPage };
