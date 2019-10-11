/*
This (and the ProjectQuotaBoundsTable) are currently only showed
in the backend static pages, so the tooltips are not visible there (no javascript).
*/

import { Component, React, Rendered } from "../app-framework";
import { DEFAULT_QUOTAS, PROJECT_UPGRADES } from "smc-util/schema";
import { Tip } from "../r_misc/tip";
import { Icon } from "../r_misc/icon";
import { Space } from "../r_misc/space";
const { Panel } = require("react-bootstrap"); // since the typescript declarations are our of sync with our crappy old version.

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
      <Panel header={this.render_header()} bsStyle="info">
        <Space />
        <div style={{ marginBottom: "5px", marginLeft: "10px" }}>
          <Tip
            title="Free servers"
            tip="Many free projects are crammed together inside weaker compute machines, competing for CPU, RAM and I/O."
          >
            <span style={{ fontWeight: "bold", color: "#666" }}>low-grade</span>
            <Space />
            <span style={{ color: "#999" }}>Server hosting</span>
          </Tip>
        </div>
        <div style={{ marginBottom: "5px", marginLeft: "10px" }}>
          <Tip
            title="Internet access"
            tip="Despite working inside a web-browser, free projects are not allowed to directly access the internet due to security/abuse reasons."
          >
            <span style={{ fontWeight: "bold", color: "#666" }}>no</span>
            <Space />
            <span style={{ color: "#999" }}>Internet access</span>
          </Tip>
        </div>
        {PROJECT_UPGRADES.field_order
          .filter(name => DEFAULT_QUOTAS[name])
          .map(name => render_project_quota(name, DEFAULT_QUOTAS[name]))}
        <Space />
        <div style={{ textAlign: "center", marginTop: "10px" }}>
          <h3 style={{ textAlign: "left" }}>
            <span style={{ fontSize: "16px", verticalAlign: "super" }}>$</span>
            <Space />
            <span style={{ fontSize: "30px" }}>0</span>
          </h3>
        </div>
      </Panel>
    );
  }
}
