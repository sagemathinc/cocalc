/*
Functionality and UI to ensure a user with given email (or account_id) is sync'd with stripe.
*/

import { Row, Col, FormGroup, FormControl, Button } from "react-bootstrap";

import { is_valid_email_address, to_json } from "../frame-editors/generic/misc";

import { stripe_admin_create_customer } from "../frame-editors/generic/client";

import {
  React,
  Component,
  Rendered,
  ReactDOM
} from "../app-framework";

interface StripeUserState {
  email: string;
  status: string;
}

export class StripeUser extends Component<{}, StripeUserState> {
  constructor(props) {
    super(props);
    this.state = {
      email: "",
      status: ""
    };
  }

  status_mesg(s: string): void {
    this.setState({
      status: this.state.status + (this.state.status ? "\n" : "") + s.trim()
    });
  }

  async add_stripe_user(): Promise<void> {
    const { email } = this.state;
    if (!email) {
      // nothing to do -- shouldn't happen since button should be disabled.
      return;
    }

    this.status_mesg(`Adding/updating "${email}"...`);
    this.setState({ email: "" });
    try {
      await stripe_admin_create_customer({ email_address: email });
      this.status_mesg(`Successfully added/updated ${email}`);
    } catch (err) {
      this.status_mesg(`Error: ${to_json(err)}`);
    }
  }

  submit_form(e): void {
    e.preventDefault();
    if (is_valid_email_address(this.state.email)) {
      this.add_stripe_user();
    }
  }

  render_form(): Rendered {
    return (
      <form onSubmit={e => this.submit_form(e)}>
        <Row>
          <Col md={6}>
            <FormGroup>
              <FormControl
                ref="input"
                type="text"
                value={this.state.email}
                placeholder="Email address"
                onChange={() =>
                  this.setState({
                    email: ReactDOM.findDOMNode(this.refs.input).value.trim()
                  })
                }
              />
            </FormGroup>
          </Col>
          <Col md={6}>
            <Button
              bsStyle="warning"
              disabled={!is_valid_email_address(this.state.email.trim())}
              onClick={() => this.add_stripe_user()}
            >
              Add/Update Stripe Info
            </Button>
          </Col>
        </Row>
      </form>
    );
  }

  render_status(): Rendered {
    if (!this.state.status) {
      return;
    }
    return (
      <div>
        <pre>{this.state.status}</pre>
        <Button onClick={() => this.setState({ status: "" })}>Clear</Button>
      </div>
    );
  }

  render(): Rendered {
    return (
      <div>
        <h4>Add or Update Stripe User</h4>
        <div style={{color:"#666", marginBottom:'5px'}}>
          Make it so the user with the given email address has a corresponding
          stripe identity, even if they have never entered a credit card.
          You'll need this if you want to directly create a plan for them in Stripe.
        </div>
        <div>
          {this.render_form()}
          {this.render_status()}
        </div>
      </div>
    );
  }
}
