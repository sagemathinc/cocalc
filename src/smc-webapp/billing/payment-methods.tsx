import { Component, React, Rendered, redux } from "../app-framework";
import { Button, Row, Col } from "react-bootstrap";
const { Panel } = require("react-bootstrap"); // since the typescript declarations are our of sync with our crappy old version.
import { Icon } from "../r_misc/icon";

import { Source } from "./types";

import { AddPaymentMethod } from "./add-payment-method";
import { PaymentMethod } from "./payment-method";
import { ErrorDisplay } from "../r_misc/error-display";

import { cmp } from "smc-util/misc2";

interface Props {
  sources?: { data: Source[] }; // could be undefined, if it is a customer and all sources are removed
  default?: string;
}

interface State {
  state: "view" | "delete" | "add_new";
  error: string;
}

export class PaymentMethods extends Component<Props, State> {
  constructor(props, state) {
    super(props, state);
    this.state = {
      state: "view", //  'delete' <--> 'view' <--> 'add_new'
      error: ""
    };
  }

  private add_payment_method(): void {
    this.setState({ state: "add_new" });
  }

  private render_add_payment_method(): Rendered {
    if (this.state.state === "add_new") {
      return (
        <AddPaymentMethod on_close={() => this.setState({ state: "view" })} />
      );
    }
  }

  private render_add_payment_method_button(): Rendered {
    return (
      <Button
        disabled={this.state.state !== "view"}
        onClick={this.add_payment_method.bind(this)}
        bsStyle="primary"
        className="pull-right"
      >
        <Icon name="plus-circle" /> Add Payment Method...
      </Button>
    );
  }

  private render_header(): Rendered {
    return (
      <Row>
        <Col sm={6}>
          <Icon name="credit-card" /> Payment methods
        </Col>
        <Col sm={6}>{this.render_add_payment_method_button()}</Col>
      </Row>
    );
  }

  private set_as_default(id: string): void {
    redux.getActions("billing").set_as_default_payment_method(id);
  }

  private delete_method(id: string): void {
    redux.getActions("billing").delete_payment_method(id);
  }

  private render_payment_method(source: Source): Rendered {
    return (
      <PaymentMethod
        key={source.id}
        source={source}
        default={source.id === this.props.default}
        set_as_default={() => this.set_as_default(source.id)}
        delete_method={() => this.delete_method(source.id)}
      />
    );
  }

  private render_payment_methods(): undefined | Rendered[] {
    // this happens, when it is a customer but all credit cards are deleted!
    if (this.props.sources == null) {
      return;
    }
    // Always sort sources in the same order.  This way when you select
    // a default source, they don't get reordered, which is really confusing.
    this.props.sources.data.sort((a, b) => cmp(a.id, b.id));
    return this.props.sources.data.map(source =>
      this.render_payment_method(source)
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

  public render(): Rendered {
    return (
      <Panel header={this.render_header()}>
        {this.render_error()}
        {this.state.state == "add_new"
          ? this.render_add_payment_method()
          : undefined}
        {this.render_payment_methods()}
      </Panel>
    );
  }
}
