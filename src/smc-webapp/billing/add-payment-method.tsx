import {
  Alert,
  Button,
  ButtonToolbar,
  Row,
  Col,
  FormGroup,
  FormControl,
  InputGroup,
  Well
} from "react-bootstrap";

import { copy, merge } from "smc-util/misc2";
import { is_valid_zipcode } from "smc-util/misc";

import { Component, React, ReactDOM, Rendered, redux } from "../app-framework";

const { SelectorInput } = require("../r_misc");
import { Icon } from "../r_misc/icon";
import { ErrorDisplay } from "../r_misc/error-display";

const { HelpEmailLink } = require("../customize");

import { powered_by_stripe } from "./util";

import { COUNTRIES, STATES, brand_to_icon_name } from "./data";

// We use jquery.payment still to validate input.
// Obviously, we should switch, because (https://github.com/stripe/jquery.payment)
// "jquery.payment is deprecated. We recommend that you use either Stripe Checkout or Stripe Elements to collect card information."
declare var $;

interface Props {
  on_close?: Function; // optionally called when this should be closed
  hide_cancel_button?: boolean;
}

const VALIDATE = {
  valid: { border: "1px solid green" },
  invalid: { border: "1px solid red" }
};

interface State {
  new_payment_info: {
    name: string;
    number: string;
    address_state: string;
    address_country: string;
  };
  submitting: boolean;
  error: string;
  cvc_help: boolean;
}

export class AddPaymentMethod extends Component<Props, State> {
  private mounted: boolean = false;

  constructor(props, state) {
    super(props, state);
    this.state = {
      new_payment_info: {
        name: redux.getStore("account").get_fullname(),
        number: "",
        address_state: "",
        address_country: ""
      },
      submitting: false,
      error: "",
      cvc_help: false
    };
  }

  public componentDidMount(): void {
    this.mounted = true;
  }

  public componentWillUnmount(): void {
    this.mounted = false;
  }

  private async submit_payment_method(): Promise<void> {
    this.setState({ error: "", submitting: true });
    const actions = redux.getActions("billing");
    if (actions.store.get("customer") == null) {
      actions.setState({ continue_first_purchase: true });
    }
    try {
      await actions.submit_payment_method(this.state.new_payment_info);
      if (!this.mounted) return;
      if (this.props.on_close != null) {
        this.props.on_close();
      }
    } catch (err) {
      if (this.mounted) {
        this.setState({ error: err.toString() });
      }
    } finally {
      if (this.mounted) {
        this.setState({ submitting: false });
      }
    }
  }

  private render_payment_method_field(
    field: string,
    control: Rendered
  ): Rendered {
    if (
      field === "State" &&
      this.state.new_payment_info.address_country !== "United States"
    ) {
      return;
    }
    return (
      <Row key={field}>
        <Col sm={4}>{field}</Col>
        <Col sm={8}>{control}</Col>
      </Row>
    );
  }

  private set_input_info(
    field: string,
    ref: string | undefined,
    value?: string
  ): void {
    const new_payment_info = copy(this.state.new_payment_info);
    if (value != null) {
      new_payment_info[field] = value;
      this.setState({ new_payment_info });
      return;
    }
    if (ref != null) {
      const node = ReactDOM.findDOMNode(this.refs[ref]);
      if (node != null) {
        new_payment_info[field] = node.value;
        this.setState({ new_payment_info });
      }
    }
  }

  private render_input_card_number(): Rendered {
    const icon = brand_to_icon_name(
      $.payment.cardType(this.state.new_payment_info.number)
    );
    const value = this.valid("number")
      ? $.payment.formatCardNumber(this.state.new_payment_info.number)
      : this.state.new_payment_info.number;
    return (
      <FormGroup>
        <InputGroup>
          <FormControl
            autoFocus
            ref="input_card_number"
            style={this.style("number")}
            type="text"
            size={20}
            placeholder="1234 5678 9012 3456"
            value={value}
            onChange={() => this.set_input_info("number", "input_card_number")}
            disabled={this.state.submitting}
          />
          <InputGroup.Addon>
            <Icon name={icon} />
          </InputGroup.Addon>
        </InputGroup>
      </FormGroup>
    );
  }

  private render_input_cvc_input(): Rendered {
    return (
      <FormGroup>
        <FormControl
          ref="input_cvc"
          style={merge({ width: "5em" }, this.style("cvc"))}
          type="text"
          size={4}
          placeholder="···"
          onChange={() => this.set_input_info("cvc", "input_cvc")}
          disabled={this.state.submitting}
        />
      </FormGroup>
    );
  }

  private render_input_cvc_help(): Rendered {
    if (this.state.cvc_help) {
      return (
        <div>
          The{" "}
          <a
            href="https://en.wikipedia.org/wiki/Card_security_code"
            target="_blank"
            rel="noopener"
          >
            security code
          </a>{" "}
          is located on the back of credit or debit cards and is a separate
          group of 3 (or 4) digits to the right of the signature strip.{" "}
          <a
            href=""
            onClick={e => {
              e.preventDefault();
              this.setState({ cvc_help: false });
            }}
          >
            (hide)
          </a>
        </div>
      );
    } else {
      return (
        <a
          href=""
          onClick={e => {
            e.preventDefault();
            this.setState({ cvc_help: true });
          }}
        >
          (what is the security code?)
        </a>
      );
    }
  }

  private render_input_cvc(): Rendered {
    return (
      <Row>
        <Col md={3}>{this.render_input_cvc_input()}</Col>
        <Col md={9}>{this.render_input_cvc_help()}</Col>
      </Row>
    );
  }

  private valid(name?: string): boolean | undefined {
    const info = this.state.new_payment_info;

    if (name == null) {
      // check validity of all fields
      for (name of [
        "number",
        "exp_month",
        "exp_year",
        "cvc",
        "name",
        "address_country"
      ]) {
        if (!this.valid(name)) {
          return false;
        }
      }
      if (info.address_country === "United States") {
        if (!this.valid("address_state") || !this.valid("address_zip")) {
          return false;
        }
      }
      return true;
    }

    const x = info[name];
    if (!x) {
      return;
    }
    switch (name) {
      case "number":
        return $.payment.validateCardNumber(x);
      case "exp_month":
        if (x.length === 0) {
          return;
        }
        var month = parseInt(x);
        return month >= 1 && month <= 12;
      case "exp_year":
        if (x.length === 0) {
          return;
        }
        var year = parseInt(x);
        return year >= 15 && year <= 50;
      case "cvc":
        return $.payment.validateCardCVC(x);
      case "name":
        return x.length > 0;
      case "address_country":
        return x.length > 0;
      case "address_state":
        return x.length > 0;
      case "address_zip":
        return is_valid_zipcode(x);
    }
  }

  private style(name: string): object {
    const a = this.valid(name);
    if (a == null) {
      return {};
    } else if (a === true) {
      return VALIDATE.valid;
    } else {
      return VALIDATE.invalid;
    }
  }

  private render_input_expiration(): Rendered {
    // TODO: the "as any" to get the value below is **suspicious**.
    return (
      <div style={{ marginBottom: "15px", display: "flex" }}>
        <FormGroup>
          <FormControl
            readOnly={this.state.submitting}
            className="form-control"
            style={merge({ width: "5em" }, this.style("exp_month"))}
            placeholder="MM"
            type="text"
            size={2}
            onChange={e =>
              this.set_input_info(
                "exp_month",
                undefined,
                (e.target as any).value
              )
            }
          />
        </FormGroup>
        <span style={{ fontSize: "22px", margin: "1px 5px" }}> / </span>
        <FormGroup>
          <FormControl
            readOnly={this.state.submitting}
            className="form-control"
            style={merge({ width: "5em" }, this.style("exp_year"))}
            placeholder="YY"
            type="text"
            size={2}
            onChange={e =>
              this.set_input_info(
                "exp_year",
                undefined,
                (e.target as any).value
              )
            }
          />
        </FormGroup>
      </div>
    );
  }

  private render_input_name(): Rendered {
    return (
      <FormGroup>
        <FormControl
          ref="input_name"
          type="text"
          placeholder="Name on Card"
          onChange={() => this.set_input_info("name", "input_name")}
          style={this.style("name")}
          value={this.state.new_payment_info.name}
          disabled={this.state.submitting}
        />
      </FormGroup>
    );
  }

  private render_input_country(): Rendered {
    return (
      <SelectorInput
        options={COUNTRIES}
        on_change={country =>
          this.set_input_info("address_country", "", country)
        }
        disabled={this.state.submitting}
      />
    );
  }

  private render_input_zip(): Rendered {
    return (
      <FormGroup>
        <FormControl
          ref="input_address_zip"
          style={this.style("address_zip")}
          placeholder="Zip Code"
          type="text"
          size={5}
          pattern="\d{5,5}(-\d{4,4})?"
          onChange={() =>
            this.set_input_info("address_zip", "input_address_zip")
          }
          disabled={this.state.submitting}
        />
      </FormGroup>
    );
  }

  private render_tax_notice(): Rendered {
    return (
      <Row>
        <Col sm={12}>
          <Alert bsStyle="info">
            <h4>
              <Icon name="exclamation-triangle" /> Notice{" "}
            </h4>
            <p>Sales tax is applied in the state of Washington</p>
          </Alert>
        </Col>
      </Row>
    );
  }

  private render_input_state_zip(): Rendered {
    return (
      <div>
        <Row>
          <Col sm={7}>
            <SelectorInput
              options={STATES}
              on_change={state =>
                this.set_input_info("address_state", "", state)
              }
              disabled={this.state.submitting}
            />
          </Col>
          <Col sm={5}>{this.render_input_zip()}</Col>
        </Row>
        {this.state.new_payment_info.address_state === "WA"
          ? this.render_tax_notice()
          : undefined}
      </div>
    );
  }

  private render_payment_method_fields(): Rendered[] {
    const PAYMENT_METHOD_FORM: { [name: string]: () => Rendered } = {
      "Card Number": this.render_input_card_number,
      "Security Code (CVC)": this.render_input_cvc,
      "Expiration (MM/YY)": this.render_input_expiration,
      "Name on Card": this.render_input_name,
      Country: this.render_input_country,
      State: this.render_input_state_zip
    };

    const result: Rendered[] = [];
    for (let field in PAYMENT_METHOD_FORM) {
      const control = PAYMENT_METHOD_FORM[field].bind(this);
      result.push(this.render_payment_method_field(field, control()));
    }

    return result;
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
        disabled={!this.valid() || this.state.submitting}
      >
        Add Credit Card
      </Button>
    );
  }

  private render_payment_method_buttons(): Rendered {
    return (
      <div>
        <Row>
          <Col sm={4}>{powered_by_stripe()}</Col>
          <Col sm={8}>
            <ButtonToolbar className="pull-right">
              {this.render_add_button()}
              {this.render_cancel_button()}
            </ButtonToolbar>
          </Col>
        </Row>
        <div style={{ color: "#666", marginTop: "15px" }}>
          (PayPal or wire transfers for non-recurring subscriptions above $50
          are also possible. Please email <HelpEmailLink />
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

  public render(): Rendered {
    return (
      <Row>
        <Col sm={6} smOffset={3}>
          <Well style={{ boxShadow: "5px 5px 5px lightgray", zIndex: 2 }}>
            {this.render_error()}
            {this.render_payment_method_fields()}
            {this.render_payment_method_buttons()}
          </Well>
        </Col>
      </Row>
    );
  }
}
