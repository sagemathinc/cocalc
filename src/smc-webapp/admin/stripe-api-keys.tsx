const { ErrorDisplay, LabeledRow } = require("../r_misc");

import {
  Button,
  ButtonToolbar,
  Well,
  FormGroup,
  FormControl
} from "react-bootstrap";

import { query } from "../frame-editors/generic/client";

import { React, Component, Rendered } from "../frame-editors/generic/react";

interface State {
  state: "view" | "edit" | "save" | "saved"; // view --> edit --> save --> saved --> ...
  secret_key: string;
  publishable_key: string;
  error?: string;
}

export class StripeAPIKeys extends Component<{}, State> {
  constructor(props, state) {
    super(props, state);
    this.state = {
      state: "view",
      secret_key: "",
      publishable_key: ""
    };
  }

  edit(): void {
    this.setState({ state: "edit" });
  }

  async save(): Promise<void> {
    this.setState({ state: "save" });
    interface Record {
      server_settings: {
        name: string;
        value: string;
      };
    }
    const result: Record[] = [];
    for (let name of ["secret", "publishable"]) {
      result.push({
        server_settings: {
          name: `stripe_${name}_key`,
          value: this.state[`${name}_key`]
        }
      });
    }

    try {
      await query({ query: result });
    } catch (err) {
      this.setState({ state: "edit", error: err });
      return;
    }
    this.setState({
      state: "saved",
      error: "",
      secret_key: "",
      publishable_key: ""
    });
  }

  async disable(): Promise<void> {
    this.setState({
      secret_key: "",
      publishable_key: ""
    });
    await this.save();
  }

  cancel(): void {
    this.setState({
      state: "view",
      error: "",
      secret_key: "",
      publishable_key: ""
    });
  }

  render_edit(): Rendered {
    return (
      <Well
        style={{
          margin: "auto",
          maxWidth: "80%"
        }}
      >
        <LabeledRow label="Publishable key">
          <FormGroup>
            <FormControl
              ref="input_publishable_key"
              type="text"
              value={this.state.publishable_key}
              onChange={e =>
                this.setState({ publishable_key: (e.target as any).value })
              }
            />
          </FormGroup>
        </LabeledRow>
        <LabeledRow label="Secret key">
          <FormGroup>
            <FormControl
              ref="input_secret_key"
              type="text"
              value={this.state.secret_key}
              onChange={e =>
                this.setState({ secret_key: (e.target as any).value })
              }
            />
          </FormGroup>
        </LabeledRow>
        <ButtonToolbar>
          <Button
            bsStyle="success"
            onClick={() => this.save()}
            disabled={
              this.state.secret_key === "" || this.state.publishable_key === ""
            }
          >
            Save
          </Button>
          <Button bsStyle="warning" onClick={() => this.disable()}>
            Disable Stripe
          </Button>
          <Button onClick={() => this.cancel()}>Cancel</Button>
        </ButtonToolbar>
      </Well>
    );
  }

  render_saved(): Rendered {
    if (this.state.state == "saved") {
      return (
        <div>
          Stripe keys saved!
          <br />
        </div>
      );
    }
  }

  render_main(): Rendered {
    switch (this.state.state) {
      case "view":
      case "saved":
        return (
          <div>
            {this.render_saved()}
            <Button onClick={() => this.edit()}>Edit...</Button>
          </div>
        );
      case "save":
        return <div>Saving Stripe keys...</div>;
      case "edit":
        return this.render_edit();
    }
  }

  render_error(): Rendered {
    if (this.state.error) {
      return (
        <ErrorDisplay
          error={this.state.error}
          onClose={() => this.setState({ error: "" })}
        />
      );
    }
  }

  render(): Rendered {
    return (
      <div>
        <h4>Stripe API Keys</h4>
        {this.render_main()}
        {this.render_error()}
      </div>
    );
  }
}
