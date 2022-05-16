/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Col, Panel, Row } from "@cocalc/frontend/antd-bootstrap";
import {
  Component,
  rclass,
  redux,
  rtypes,
} from "@cocalc/frontend/app-framework";
import { A, Icon, Loading, Space } from "@cocalc/frontend/components";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { plural, round1 } from "@cocalc/util/misc";
import { PROJECT_UPGRADES } from "@cocalc/util/schema";
import { Progress } from "antd";
import { Map } from "immutable";
import { join } from "path";
import { Footer, PolicyPricingPageUrl, SiteName } from "../../customize";
import "./project-upgrades-table";
import { ProjectUpgradesTable } from "./project-upgrades-table";
export { tmp as UpgradesPage };

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
        <h3>Upgrades are no longer available</h3>
        Please visit <A href={join(appBasePath, "store")}>the new store</A> and
        the <A href="https://cocalc.com/pricing">pricing pages</A>.
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
        <div style={{ color: "#666" }}>
          <p>
            You have some now deprecated "quota upgrades". They are listed
            below, along with how you have applied them to projects. You can
            adjust your project upgrade contribution from the settings page in
            any project.
          </p>
          <p>
            Going forward, we offer many{" "}
            <A href={PolicyPricingPageUrl}> pricing and subscription options</A>
            , which you can subscribe to in the{" "}
            <A href={join(appBasePath, "store")}>Store</A>.
          </p>
        </div>
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
              <Progress percent={percent_used} />
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
