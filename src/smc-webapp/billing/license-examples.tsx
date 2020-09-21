/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../app-framework";
const { Panel } = require("react-bootstrap");
import { Col, Row } from "react-bootstrap";
import { Space, Icon } from "../r_misc";
import { COLORS } from "smc-util/theme";
import { Cost, User } from "../site-licenses/purchase/util";

// This component renders 3 price examples for licensed upgrades in a row

export interface Example {
  title: string;
  icon: string;
  user: User;
  lines: { value: number; unit: string; resource: string }[];
  price: Cost;
  period: string;
}

interface Props {
  // only renders exactly 3 examples
  examples: Example[];
}

export const LicenseExamples: React.FC<Props> = ({ examples }: Props) => {
  if (examples.length != 3) throw Error("I can only render exactly 3 examples");

  function render_example_line({ value, unit, resource }) {
    const value_str =
      value == Number.POSITIVE_INFINITY ? <span>&#8734;</span> : value;
    return (
      <div style={{ marginBottom: "5px", marginLeft: "10px" }}>
        <span style={{ fontWeight: "bold", color: "#444" }}>
          {value_str} {unit}
        </span>
        <Space />
        <span style={{ color: COLORS.GRAY }}>{resource}</span>
      </div>
    );
  }

  function render_example_price({ price }) {
    return (
      <>
        <span style={{ whiteSpace: "nowrap", color: COLORS.GRAY }}>
          <span style={{ fontSize: "16px", verticalAlign: "super" }}>$</span>
          <Space />
          <span style={{ fontSize: "30px" }}>{price.cost.toFixed(2)}</span>
          <span style={{ fontSize: "14px" }}> / retail price</span>
        </span>
        <br />
        <span style={{ whiteSpace: "nowrap", fontWeight: "bold" }}>
          <span style={{ fontSize: "16px", verticalAlign: "super" }}>$</span>
          <Space />
          <span style={{ fontSize: "30px" }}>
            {price.discounted_cost.toFixed(2)}
          </span>
          <span style={{ fontSize: "14px" }}> / purchased online</span>
        </span>
      </>
    );
  }

  function render_example({ title, icon, lines, price, period }: Example) {
    const header = (
      <div style={{ paddingLeft: "10px" }}>
        <Icon name={icon} /> <span style={{ fontWeight: "bold" }}>{title}</span>{" "}
        ({period})
      </div>
    );
    return (
      <Col sm={4}>
        <Panel header={header} bsStyle={"info"}>
          <Space />
          {lines.map((line) => render_example_line(line))}
          <Space />

          <div style={{ textAlign: "center", marginTop: "10px" }}>
            {render_example_price({ price })}
          </div>
        </Panel>
      </Col>
    );
  }

  function render() {
    return <Row>{examples.map((ex) => render_example(ex))}</Row>;
  }

  return (
    <>
      <h4>Examples</h4>
      <p>
        Here are three exemplary configurations. All parameters can be adjusted
        to fit your needs. Listed upgrades are for each project. Exact prices
        may vary.
      </p>
      <Space />
      {render()}
      <Space />
    </>
  );
};
