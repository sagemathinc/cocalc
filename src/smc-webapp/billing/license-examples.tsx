/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../app-framework";
const { Panel } = require("react-bootstrap");
import { Col, Row, Table } from "react-bootstrap";
import { Space, Icon } from "../r_misc";
import { COLORS } from "smc-util/theme";
import {
  Cost,
  User,
  discount_monthly_pct,
  discount_yearly_pct,
  MIN_QUOTE,
} from "../site-licenses/purchase/util";

// This component renders 3 price examples for licensed upgrades in a row

export interface Example {
  title: string;
  icon: string;
  user: User;
  lines: { value: number; unit: string; resource: string }[];
  price?: Cost;
  price_monthly?: Cost; // optional, show monthly price
  price_yearly?: Cost; // optional, show yearly price
  period?: string;
}

interface Props {
  // only renders exactly 3 examples
  examples: Example[];
  show_discount_pct: boolean;
}

export const LicenseExamples: React.FC<Props> = ({
  examples,
  show_discount_pct,
}: Props) => {
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

  function render_price_number(
    usd,
    small,
    large,
    emph: boolean,
    online: boolean,
    descr?: string
  ) {
    const smallpx = `${small}px`;
    const largepx = `${large}px`;
    const e = emph ? { fontWeight: "bold" as "bold" } : { color: COLORS.GRAY };
    const style = { ...{ whiteSpace: "nowrap" as "nowrap" }, ...e };
    if (!online && usd < MIN_QUOTE) {
      return (
        <span style={{ fontSize: largepx, color: COLORS.GRAY_L }}>N/A</span>
      );
    } else {
      return (
        <span style={style}>
          <span style={{ fontSize: smallpx, verticalAlign: "super" }}>$</span>
          <Space />
          <span style={{ fontSize: largepx }}>{usd.toFixed(2)}</span>
          {descr && <span style={{ fontSize: smallpx }}> / {descr}</span>}
        </span>
      );
    }
  }

  function render_example_price(price) {
    return (
      <>
        {render_price_number(price.cost, 14, 30, false, false, "retail price")}
        <br />
        {render_price_number(
          price.discounted_cost,
          14,
          30,
          true,
          true,
          "purchased online"
        )}
      </>
    );
  }

  function render_single_price({ price }: { price?: Cost }) {
    if (price == null) return;
    return (
      <div style={{ textAlign: "center", marginTop: "10px" }}>
        {render_example_price(price)}
      </div>
    );
  }

  function render_monthyear_price({
    price_monthly,
    price_yearly,
  }: {
    price_monthly?: Cost;
    price_yearly?: Cost;
  }) {
    if (price_monthly == null || price_yearly == null) return;
    const large = 26;
    return (
      <>
        <Table className={"cc-price-table"}>
          <tbody>
            <tr>
              <td></td>
              <td>retail</td>
              <th>online</th>
            </tr>
            <tr>
              <td>monthly</td>
              <td>
                {render_price_number(
                  price_monthly.cost,
                  14,
                  large,
                  false,
                  false
                )}
              </td>
              <td>
                {render_price_number(
                  price_monthly.discounted_cost,
                  14,
                  large,
                  true,
                  true
                )}
              </td>
            </tr>
            <tr>
              <th>yearly</th>
              <td>
                {render_price_number(
                  price_yearly.cost,
                  14,
                  large,
                  false,
                  false
                )}
              </td>
              <td>
                {render_price_number(
                  price_yearly.discounted_cost,
                  14,
                  large,
                  true,
                  true
                )}
              </td>
            </tr>
          </tbody>
        </Table>
      </>
    );
  }

  function render_example(example: Example) {
    const { title, icon, lines, period } = example;
    const header = (
      <div style={{ paddingLeft: "10px" }}>
        <Icon name={icon} /> <span style={{ fontWeight: "bold" }}>{title}</span>
        {period && <> ({period})</>}
      </div>
    );
    return (
      <Col sm={4}>
        <Panel header={header} bsStyle={"info"}>
          <Space />
          {lines.map((line) => render_example_line(line))}
          <Space />

          {render_single_price(example)}
          {render_monthyear_price(example)}
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
        may vary. Below ${MIN_QUOTE} only online purchases are available.
        {show_discount_pct && (
          <>
            {" "}
            Compared to one-off purchases, the discounts are{" "}
            {discount_monthly_pct}% for monthly and {discount_yearly_pct}% for
            yearly subscriptions.
          </>
        )}
      </p>
      <Space />
      {render()}
      <Space />
    </>
  );
};
