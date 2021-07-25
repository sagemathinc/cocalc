/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button, ButtonToolbar, Row, Col, Well } from "../antd-bootstrap";
import { Component, React, Rendered, redux } from "../app-framework";
import { ErrorDisplay, Loading } from "../r_misc";
import { HelpEmailLink } from "../customize";
import { powered_by_stripe } from "./util";
import { loadStripe, StripeCard } from "./stripe";

interface Props {
  on_close?: Function; // optionally called when this should be closed
  hide_cancel_button?: boolean;
}

const CARD_STYLE = {
  margin: "15px",
  border: "1px solid grey",
  padding: "30px",
  background: "white",
  borderRadius: "5px",
};

interface State {
  submitting: boolean;
  error: string;
  loading: boolean;
}

export class AddPaymentMethod extends Component<Props, State> {
  private mounted: boolean = false;
  private card?: StripeCard;

  constructor(props, state) {
    super(props, state);
    this.state = {
      submitting: false,
      error: "",
      loading: true,
    };
  }

  public async componentDidMount(): Promise<void> {
    this.mounted = true;
    const stripe = await loadStripe();
    if (!this.mounted) return;
    this.setState({ loading: false });
    const elements = stripe.elements();
    this.card = elements.create("card");
    if (this.card == null) throw Error("bug -- card cannot be null");
    this.card.mount("#card-element");
  }

  public componentWillUnmount(): void {
    this.mounted = false;
  }

  private async submit_payment_method(): Promise<void> {
    this.setState({ error: "", submitting: true });
    const actions = redux.getActions("billing");
    const store = redux.getStore("billing");
    if (store.get("customer") == null) {
      actions.setState({ continue_first_purchase: true });
    }
    const stripe = await loadStripe();
    let result: {
      error?: { message: string };
      token?: { id: string };
    } = {};
    try {
      result = await stripe.createToken(this.card);
      if (!this.mounted) return;
      if (result.error != null) {
        this.setState({ error: result.error.message });
        return;
      } else if (result.token != null) {
        await actions.submit_payment_method(result.token.id);
        if (!this.mounted) return;
      }
    } catch (err) {
      if (this.mounted) {
        result.error = { message: err.toString() }; // used in finally
        this.setState({ error: err.toString() });
      }
    } finally {
      if (this.mounted) {
        this.setState({ submitting: false });
        if (this.props.on_close != null && result.error == null)
          this.props.on_close();
      }
    }
  }

  private render_cancel_button(): Rendered {
    if (this.props.hide_cancel_button) return;
    return (
      <Button
        onClick={() =>
          this.props.on_close != null ? this.props.on_close() : undefined
        }
      >
        Cancel
      </Button>
    );
  }

  private render_add_button(): Rendered {
    return (
      <Button
        onClick={() => this.submit_payment_method()}
        bsStyle="primary"
        disabled={this.state.submitting}
      >
        {this.state.submitting ? <Loading /> : undefined} Add Credit Card
      </Button>
    );
  }

  private render_payment_method_buttons(): Rendered {
    return (
      <div>
        <Row>
          <Col sm={4}>{powered_by_stripe()}</Col>
          <Col sm={8}>
            <ButtonToolbar className="pull-right" style={{ marginTop: "10px" }}>
              {this.render_add_button()}
              {this.render_cancel_button()}
            </ButtonToolbar>
          </Col>
        </Row>
        <div style={{ color: "#666", marginTop: "15px" }}>
          (PayPal or wire transfers for non-recurring purchases above $100 are
          also possible. Please email <HelpEmailLink />
          .)
        </div>
      </div>
    );
  }

  private render_error(): Rendered {
    if (this.state.error) {
      return (
        <ErrorDisplay
          error={this.state.error}
          onClose={() => this.setState({ error: "" })}
        />
      );
    }
  }

  private render_card(): Rendered {
    return (
      <div style={CARD_STYLE}>
        {this.state.loading ? <Loading theme="medium" /> : undefined}
        <div id="card-element">
          {/* a Stripe Element will be inserted here. */}
        </div>
      </div>
    );
  }

  public render(): Rendered {
    return (
      <Row>
        <Col sm={6} smOffset={3}>
          <Well style={{ boxShadow: "5px 5px 5px lightgray", zIndex: 2 }}>
            {this.render_card()}
            {this.render_error()}
            {this.render_payment_method_buttons()}
          </Well>
        </Col>
      </Row>
    );
  }
}
