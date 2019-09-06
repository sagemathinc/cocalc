import { Alert, Button, ButtonToolbar, Col, Row } from "react-bootstrap";
import { stripe_amount, stripe_date, capitalize } from "smc-util/misc";
import { Component, React, Rendered, redux } from "../app-framework";
const { HelpEmailLink } = require("../customize");
import { Subscription as StripeSubscription } from "./types";
import { plan_interval } from "./util";

interface Props {
  subscription: StripeSubscription;
}

interface State {
  confirm_cancel: boolean;
  cancelling: boolean;
}

export class Subscription extends Component<Props, State> {
  constructor(props, state) {
    super(props, state);
    this.state = { confirm_cancel: false, cancelling: false };
  }

  private cancel_subscription(): void {
    const actions = redux.getActions("billing");
    if (actions == null) return;
    actions.cancel_subscription(this.props.subscription.id);
  }

  private quantity(): string | undefined {
    const q = this.props.subscription.quantity;
    if (q > 1) {
      return `${q} × `;
    }
  }

  private render_cancel_at_end(): Rendered {
    if (this.props.subscription.cancel_at_period_end) {
      return (
        <span style={{ marginLeft: "15px" }}>Will cancel at period end.</span>
      );
    }
  }

  private render_info(): Rendered {
    const sub = this.props.subscription;
    const cancellable = !(
      sub.cancel_at_period_end ||
      this.state.cancelling ||
      this.state.confirm_cancel
    );
    return (
      <Row style={{ paddingBottom: "5px", paddingTop: "5px" }}>
        <Col md={4}>
          {this.quantity()} {sub.plan.name} (
          {stripe_amount(sub.plan.amount, sub.plan.currency)} for{" "}
          {plan_interval(sub.plan)})
        </Col>
        <Col md={2}>{capitalize(sub.status)}</Col>
        <Col md={4} style={{ color: "#666" }}>
          {stripe_date(sub.current_period_start)} –{" "}
          {stripe_date(sub.current_period_end)} (start: {stripe_date(sub.start)}
          ){this.render_cancel_at_end()}
        </Col>
        <Col md={2}>
          {cancellable ? (
            <Button
              style={{ float: "right" }}
              onClick={() => this.setState({ confirm_cancel: true })}
            >
              Cancel...
            </Button>
          ) : (
            undefined
          )}
        </Col>
      </Row>
    );
  }

  private render_confirm(): Rendered {
    if (!this.state.confirm_cancel) {
      return;
    }
    // These buttons are not consistent with other button language. The
    // justification for this is use of "Cancel" a subscription.
    return (
      <Alert bsStyle="warning">
        <Row
          style={{
            borderBottom: "1px solid #999",
            paddingBottom: "15px",
            paddingTop: "15px"
          }}
        >
          <Col md={6}>
            Are you sure you want to cancel this subscription? If you cancel
            your subscription, it will run to the end of the subscription
            period, but will not be renewed when the current (already paid for)
            period ends; any upgrades provided by this subscription will be
            disabled. If you need further clarification or need a refund, please
            email <HelpEmailLink />.
          </Col>
          <Col md={6}>
            <ButtonToolbar>
              <Button onClick={() => this.setState({ confirm_cancel: false })}>
                Make No Change
              </Button>
              <Button
                bsStyle="danger"
                onClick={() => {
                  this.setState({ confirm_cancel: false });
                  this.cancel_subscription();
                }}
              >
                Yes, cancel at period end (do not auto-renew)
              </Button>
            </ButtonToolbar>
          </Col>
        </Row>
      </Alert>
    );
  }

  render() {
    return (
      <div
        style={{
          borderBottom: "1px solid #999",
          padding: "5px 0"
        }}
      >
        {this.render_info()}
        {this.render_confirm()}
      </div>
    );
  }
}
