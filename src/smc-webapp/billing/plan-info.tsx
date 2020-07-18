/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { PROJECT_UPGRADES } from "smc-util/schema";
import { plural, capitalize } from "smc-util/misc";

import { Component, React, Rendered } from "../app-framework";
import { Tip } from "../r_misc/tip";
import { Icon } from "../r_misc/icon";
import { Space } from "../r_misc/space";
import { r_join } from "../r_misc/r_join";
import { Button } from "react-bootstrap";
const { Panel } = require("react-bootstrap"); // since the typescript declarations are our of sync with our crappy old version.

import { PeriodName } from "./types";

interface Props {
  plan: string;
  periods: PeriodName[];
  selected?: boolean;
  on_click?: Function;
}

export class PlanInfo extends Component<Props> {
  private render_plan_info_line(name: string, value: number, data): Rendered {
    return (
      <div key={name} style={{ marginBottom: "5px", marginLeft: "10px" }}>
        <Tip title={data.display} tip={data.desc}>
          <span style={{ fontWeight: "bold", color: "#444" }}>
            {value * data.pricing_factor}{" "}
            {plural(value * data.pricing_factor, data.pricing_unit)}
          </span>
          <Space />
          <span style={{ color: "#666" }}>{data.display}</span>
        </Tip>
      </div>
    );
  }

  private render_cost(price: string, period: string): Rendered {
    period =
      PROJECT_UPGRADES.period_names[period] != null
        ? PROJECT_UPGRADES.period_names[period]
        : period;
    return (
      <span key={period} style={{ whiteSpace: "nowrap" }}>
        <span style={{ fontSize: "16px", verticalAlign: "super" }}>$</span>
        <Space />
        <span style={{ fontSize: "30px" }}>{price}</span>
        <span style={{ fontSize: "14px" }}> / {period}</span>
      </span>
    );
  }

  private render_price(prices: string[]): Rendered[] | Rendered {
    if (this.props.on_click != null) {
      // note: in non-static, there is always just *one* price
      // (several only on "static" pages)
      const result: Rendered[] = [];
      for (let i = 0; i < prices.length; i++) {
        result.push(
          <Button key={i} bsStyle={this.props.selected ? "primary" : undefined}>
            {this.render_cost(prices[i], this.props.periods[i])}
          </Button>
        );
      }
      return result;
    } else {
      const result: Rendered[] = [];
      for (let i = 0; i < prices.length; i++) {
        result.push(this.render_cost(prices[i], this.props.periods[i]));
      }
      return <h3 style={{ textAlign: "left" }}>{r_join(result, <br />)}</h3>;
    }
  }

  private render_plan_name(plan_data): Rendered {
    let name;
    if (plan_data.desc != null) {
      name = plan_data.desc;
      if (name.indexOf("\n") !== -1) {
        const v = name.split("\n");
        name = (
          <span>
            {v[0].trim()}
            <br />
            {v[1].trim()}
          </span>
        );
      }
    } else {
      name = capitalize(this.props.plan).replace(/_/g, " ") + " plan";
    }
    return (
      <div style={{ paddingLeft: "10px" }}>
        <Icon name={plan_data.icon} />{" "}
        <span style={{ fontWeight: "bold" }}>{name}</span>
      </div>
    );
  }

  public render(): Rendered {
    const plan_data = PROJECT_UPGRADES.subscription[this.props.plan];
    if (plan_data == null) {
      return <div>Unknown plan type: {this.props.plan}</div>;
    }

    const { params } = PROJECT_UPGRADES;
    const prices: string[] = [];
    for (const period of this.props.periods) {
      prices.push(plan_data.price[period]);
    }
    const { benefits } = plan_data;

    const style = {
      cursor: this.props.on_click != null ? "pointer" : undefined,
    };

    return (
      <Panel
        style={style}
        header={this.render_plan_name(plan_data)}
        bsStyle={this.props.selected ? "primary" : "info"}
        onClick={() =>
          this.props.on_click != null ? this.props.on_click() : undefined
        }
      >
        <Space />
        {PROJECT_UPGRADES.field_order
          .filter((name) => benefits[name])
          .map((name) =>
            this.render_plan_info_line(
              name,
              benefits[name] != null ? benefits[name] : 0,
              params[name]
            )
          )}
        <Space />

        <div style={{ textAlign: "center", marginTop: "10px" }}>
          {this.render_price(prices)}
        </div>
      </Panel>
    );
  }
}
