/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert, Button, ButtonToolbar, Col, Row } from "react-bootstrap";
import { stripe_amount, stripe_date, capitalize } from "smc-util/misc";
import {
  CSS,
  React,
  useActions,
  useState,
  useIsMountedRef,
} from "../app-framework";
const { HelpEmailLink } = require("../customize");
import { Subscription as StripeSubscription } from "./types";
import { plan_interval } from "./util";

interface Props {
  subscription: StripeSubscription;
  style?: CSS;
}

export const Subscription: React.FC<Props> = ({ subscription, style }) => {
  const [confirm_cancel, set_confirm_cancel] = useState(false);
  const [cancelling, set_cancelling] = useState(false);
  const actions = useActions("billing");
  const is_mounted_ref = useIsMountedRef();

  function quantity(): string | undefined {
    const q = subscription.quantity;
    if (q > 1) {
      return `${q} × `;
    }
  }

  function render_cancel_at_end(): JSX.Element | undefined {
    if (subscription.cancel_at_period_end) {
      return (
        <span style={{ marginLeft: "15px" }}>Will cancel at period end.</span>
      );
    }
  }

  function render_info(): JSX.Element {
    const sub = subscription;
    const cancellable = !(
      sub.cancel_at_period_end ||
      cancelling ||
      confirm_cancel
    );
    return (
      <Row style={{ paddingBottom: "5px", paddingTop: "5px" }}>
        <Col md={4}>
          {quantity()} {sub.plan.name} (
          {stripe_amount(sub.plan.amount, sub.plan.currency)} for{" "}
          {plan_interval(sub.plan)})
        </Col>
        <Col md={2}>{capitalize(sub.status)}</Col>
        <Col md={4} style={{ color: "#666" }}>
          {stripe_date(sub.current_period_start)} –{" "}
          {stripe_date(sub.current_period_end)} (start:{" "}
          {stripe_date(sub.created)}){render_cancel_at_end()}
        </Col>
        <Col md={2}>
          {cancellable ? (
            <Button
              style={{ float: "right" }}
              disabled={cancelling}
              onClick={() => set_confirm_cancel(true)}
            >
              {cancelling ? "Cancelling..." : "Cancel..."}
            </Button>
          ) : undefined}
        </Col>
      </Row>
    );
  }

  function render_confirm(): JSX.Element | undefined {
    if (!confirm_cancel) {
      return;
    }
    // These buttons are not consistent with other button language. The
    // justification for this is use of "Cancel" a subscription.
    return (
      <Alert>
        <Row
          style={{
            borderBottom: "1px solid #999",
            paddingBottom: "15px",
            paddingTop: "15px",
          }}
        >
          <Col md={6}>
            Are you sure you want to cancel this subscription? If you cancel
            your subscription, it will run to the end of the subscription
            period, but will not be renewed when the current (already paid for)
            period ends. If you need further clarification or need a refund,
            email <HelpEmailLink />.
          </Col>
          <Col md={6}>
            <ButtonToolbar>
              <Button onClick={() => set_confirm_cancel(false)}>
                Make no change
              </Button>
              <Button
                bsStyle="danger"
                onClick={async () => {
                  set_confirm_cancel(false);
                  set_cancelling(true);
                  await actions.cancel_subscription(subscription.id);
                  if (is_mounted_ref.current) {
                    set_cancelling(false);
                  }
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

  return (
    <div
      style={{
        ...{
          borderBottom: "1px solid #999",
          padding: "5px 0",
        },
        ...style,
      }}
    >
      {render_info()}
      {render_confirm()}
    </div>
  );
};
