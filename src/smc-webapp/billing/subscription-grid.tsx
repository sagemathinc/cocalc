import { Row, Col } from "react-bootstrap";
import { Component, React, Rendered, redux } from "../app-framework";
import { keys, intersection } from "lodash";
import { PeriodName } from "./types";
import { PlanInfo } from "./plan-info";
import { PROJECT_UPGRADES } from "smc-util/schema";

interface Props {
  periods: PeriodName[];
  selected_plan?: string;
  is_static?: boolean; // used for display mode
}

export class SubscriptionGrid extends Component<Props> {
  private is_selected(plan: string): boolean {
    if (this.props.selected_plan === plan) return true;
    const period = this.props.periods[0];
    if (period == null) return false; // doesn't happen
    if (period.slice(0, 4) === "year") {
      return this.props.selected_plan === `${plan}-year`;
    } else if (period.slice(0, 4) === "week") {
      return this.props.selected_plan === `${plan}-week`;
    } else {
      return false;
    }
  }

  private click_on_plan(plan: string): void {
    if (this.props.is_static) return;
    const actions = redux.getActions("billing");
    if (actions == null) return;
    const period = this.props.periods[0];
    if (period == null) return; // doesn't happen
    actions.set_selected_plan(plan, period);
  }

  private render_plan_info(plan: string): Rendered {
    return (
      <PlanInfo
        plan={plan}
        periods={this.props.periods}
        selected={this.is_selected(plan)}
        on_click={
          this.props.is_static ? undefined : () => this.click_on_plan(plan)
        }
      />
    );
  }

  private render_cols(row: string[], ncols: number): Rendered[] {
    const width = 12 / ncols;
    return row.map(plan => (
      <Col sm={width} key={plan}>
        {this.render_plan_info(plan)}
      </Col>
    ));
  }

  private render_rows(live_subscriptions: (string[])[], ncols): Rendered[] {
    const v: Rendered[] = [];
    for (const i in live_subscriptions) {
      const row: string[] = live_subscriptions[i];
      v.push(<Row key={i}>{this.render_cols(row, ncols)}</Row>);
    }
    return v;
  }

  public render(): Rendered {
    const live_subscriptions: (string[])[] = [];
    let ncols: number = 0; // max number of columns in any row
    for (const row of PROJECT_UPGRADES.live_subscriptions) {
      const v: string[] = [];
      for (const x of row) {
        const price_keys = keys(PROJECT_UPGRADES.subscription[x].price);
        if (intersection(this.props.periods, price_keys).length > 0) {
          ncols = Math.max(ncols, row.length); // this row matters.
          v.push(x);
        }
      }
      if (v.length > 0) {
        live_subscriptions.push(v);
      }
    }
    // Round up to nearest divisor of 12
    if (ncols === 5) {
      ncols = 6;
    } else if (ncols >= 7) {
      ncols = 12;
    }
    return <div>{this.render_rows(live_subscriptions, ncols)}</div>;
  }
}
