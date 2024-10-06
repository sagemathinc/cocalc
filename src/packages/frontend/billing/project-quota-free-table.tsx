/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
This (and the ProjectQuotaBoundsTable) are currently only showed
in the backend static pages, so the tooltips are not visible there (no javascript).
*/

import { Component, Rendered } from "../app-framework";
import { DEFAULT_QUOTAS, PROJECT_UPGRADES } from "@cocalc/util/schema";
import { Tip } from "../components/tip";
import { Icon } from "../components/icon";
import { Gap } from "../components/gap";
import { Panel } from "@cocalc/frontend/antd-bootstrap";
import { render_project_quota } from "./util";

export class ProjectQuotaFreeTable extends Component {
  private render_header(): Rendered {
    return (
      <div style={{ paddingLeft: "10px" }}>
        <Icon name="battery-empty" />{" "}
        <span style={{ fontWeight: "bold" }}>Free plan</span>
      </div>
    );
  }

  public render(): Rendered {
    return (
      <Panel header={this.render_header()}>
        <Gap />
        <div style={{ marginBottom: "5px", marginLeft: "10px" }}>
          <Tip
            title="Free servers"
            tip="Many free projects are crammed together inside weaker compute machines, competing for CPU, RAM and I/O."
          >
            <span style={{ fontWeight: "bold", color: "#666" }}>low-grade</span>
            <Gap />
            <span style={{ color: "#999" }}>Server hosting</span>
          </Tip>
        </div>
        <div style={{ marginBottom: "5px", marginLeft: "10px" }}>
          <Tip
            title="Internet access"
            tip="Despite working inside a web-browser, free projects are not allowed to directly access the internet due to security/abuse reasons."
          >
            <span style={{ fontWeight: "bold", color: "#666" }}>no</span>
            <Gap />
            <span style={{ color: "#999" }}>Internet access</span>
          </Tip>
        </div>
        {PROJECT_UPGRADES.field_order
          .filter((name) => DEFAULT_QUOTAS[name])
          .map((name) => render_project_quota(name, DEFAULT_QUOTAS[name]))}
        <Gap />
        <div style={{ textAlign: "center", marginTop: "10px" }}>
          <h3 style={{ textAlign: "left" }}>
            <span style={{ fontSize: "16px", verticalAlign: "super" }}>$</span>
            <Gap />
            <span style={{ fontSize: "30px" }}>0</span>
          </h3>
        </div>
      </Panel>
    );
  }
}
