/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Component, React, Rendered } from "../app-framework";
const { HelpEmailLink } = require("../customize");
import { PROJECT_UPGRADES } from "smc-util/schema";
import { PlanInfo } from "./plan-info";
import { Row, Col } from "react-bootstrap";
import { Space } from "../r_misc/space";

export const DEDICATED_VM_TEXT = (
  <React.Fragment>
    <h3>
      Dedicated VMs
      <sup>
        <i>beta</i>
      </sup>
    </h3>
    <div>
      A <b>Dedicated VM</b> is a specific node in the cluster, which solely
      hosts one or more of your projects. This allows you to run much larger
      workloads with consistent performance, because no resources are shared
      with other projects. The usual quota limitations do not apply and you can
      also pay for additional disk space attached to individual projects.
    </div>
    <Space />
    <div>
      To get started, please contact us at <HelpEmailLink />. We will work out
      the actual requirements with you and set everything up. The list of
      dedicated VM options below are just examples; we can create VM's with
      almost any configuration up to 1.4 terabyte of RAM and 96 vCPU's.
    </div>
  </React.Fragment>
);

export class DedicatedVM extends Component {
  private render_intro(): Rendered {
    return (
      <div style={{ marginBottom: "10px" }}>
        <a id="dedicated" />
        {DEDICATED_VM_TEXT}
      </div>
    );
  }

  private render_dedicated_plans(): Rendered[] {
    const v: Rendered[] = [];
    for (const i in PROJECT_UPGRADES.dedicated_vms) {
      const plan = PROJECT_UPGRADES.dedicated_vms[i];
      v.push(
        <Col key={i} sm={4}>
          <PlanInfo plan={plan} periods={["month"]} />
        </Col>
      );
    }
    return v;
  }

  private render_dedicated(): Rendered {
    return (
      <div style={{ marginBottom: "10px" }}>
        <Row>{this.render_dedicated_plans()}</Row>
      </div>
    );
  }

  render() {
    return (
      <>
        {this.render_intro()}
        <Space />
        {this.render_dedicated()}
      </>
    );
  }
}
