/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Component, React, Rendered, redux } from "../app-framework";
import { Button, Col, Row } from "react-bootstrap";
import { Icon } from "../r_misc/icon";
const { Panel } = require("react-bootstrap");
import { Subscription } from "./subscription";
import { AppliedCoupons, Customer } from "./types";
import { AddSubscription } from "./add-subscription";

interface Props {
  customer?: Customer;
  selected_plan?: string;
  applied_coupons: AppliedCoupons;
  coupon_error?: string;
}

type ComponentState = "view" | "add_new"; // view <-> add_new

interface State {
  state: ComponentState;
}

export class SubscriptionList extends Component<Props, State> {
  constructor(props, state) {
    super(props, state);
    this.state = { state: "view" };
  }

  private close_add_subscription(): void {
    this.setState({ state: "view" });
    const actions = redux.getActions("billing");
    if (actions == null) return;
    actions.set_selected_plan("");
    actions.remove_all_coupons();
  }

  private render_add_subscription_button(): Rendered {
    return (
      <Button
        bsStyle="primary"
        disabled={this.state.state !== "view"}
        onClick={() => this.setState({ state: "add_new" })}
        className="pull-right"
      >
        <Icon name="plus-circle" /> Add Subscription or Course Package...
      </Button>
    );
  }

  private render_add_subscription(): Rendered {
    if (this.state.state !== "add_new") return;
    return (
      <AddSubscription
        on_close={this.close_add_subscription.bind(this)}
        selected_plan={this.props.selected_plan}
        applied_coupons={this.props.applied_coupons}
        coupon_error={this.props.coupon_error}
        customer={this.props.customer}
      />
    );
  }

  private render_header(): Rendered {
    return (
      <Row>
        <Col sm={6}>
          <Icon name="list-alt" /> Subscriptions and course packages
        </Col>
        <Col sm={6}>{this.render_add_subscription_button()}</Col>
      </Row>
    );
  }

  private render_subscriptions(): Rendered[] | Rendered {
    if (
      this.props.customer == null ||
      this.props.customer.subscriptions == null
    ) {
      return;
    }
    const v: Rendered[] = [];
    for (const sub of this.props.customer.subscriptions.data) {
      v.push(<Subscription key={sub.id} subscription={sub} />);
    }
    return v;
  }

  public render(): Rendered {
    return (
      <Panel header={this.render_header()}>
        {this.render_add_subscription()}
        {this.render_subscriptions()}
      </Panel>
    );
  }
}
