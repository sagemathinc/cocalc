import { Button, FormGroup, FormControl, Well } from "react-bootstrap";

import { React, Component, Rendered, ReactDOM } from "../app-framework";

import { query } from "../frame-editors/generic/client";
import { copy, deep_copy, keys } from "smc-util/misc2";

const { site_settings_conf } = require("smc-util/schema");

import { isEqual } from "lodash";

const { ErrorDisplay, LabeledRow, Space, Tip } = require("../r_misc");

const smc_version = require("smc-util/smc-version");

interface SiteSettingsState {
  state: "view" | "load" | "edit" | "save" | "error"; // view --> load --> edit --> save --> view
  error?: string;
  edited?: any;
  data?: any;
}

export class SiteSettings extends Component<{}, SiteSettingsState> {
  constructor(props, state) {
    super(props, state);
    this.state = { state: "view" };
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

  async load(): Promise<void> {
    this.setState({ state: "load" });
    let result: any;
    try {
      result = await query({
        query: {
          site_settings: [{ name: null, value: null }]
        }
      });
    } catch (err) {
      this.setState({ state: "error", error: err });
      return;
    }
    const data = {};
    for (let x of result.query.site_settings) {
      data[x.name] = x.value;
    }
    this.setState({
      state: "edit",
      error: undefined,
      data,
      edited: deep_copy(data)
    });
  }

  render_edit_button(): Rendered {
    return <Button onClick={() => this.load()}>Edit...</Button>;
  }

  async save(): Promise<void> {
    this.setState({ state: "save" });
    for (let name in this.state.edited) {
      const value = this.state.edited[name];
      if (!isEqual(value, this.state.data[name])) {
        try {
          await query({
            query: {
              site_settings: { name: name, value: value }
            }
          });
        } catch (err) {
          this.setState({ state: "error", error: err });
          return;
        }
      }
    }
    this.setState({ state: "view" });
  }

  cancel(): void {
    this.setState({ state: "view" });
  }

  render_save_button(): Rendered {
    let disabled: boolean = true;
    for (let name in this.state.edited) {
      const value = this.state.edited[name];
      if (!isEqual(value, this.state.data[name])) {
        disabled = false;
        break;
      }
    }

    return (
      <Button bsStyle="success" disabled={disabled} onClick={() => this.save()}>
        Save
      </Button>
    );
  }

  render_cancel_button(): Rendered {
    return <Button onClick={() => this.cancel()}>Cancel</Button>;
  }

  render_version_hint(value: string): Rendered {
    let error;
    if (new Date(parseInt(value) * 1000) > new Date()) {
      error = (
        <div
          style={{
            background: "red",
            color: "white",
            margin: "15px",
            padding: "15px"
          }}
        >
          INVALID version - it is in the future!!
        </div>
      );
    } else {
      error = undefined;
    }
    return (
      <div style={{ marginTop: "15px", color: "#666" }}>
        Your browser version:{" "}
        <pre style={{ background: "white", fontSize: "10pt" }}>
          {smc_version.version}
        </pre>
        {error}
      </div>
    );
  }

  render_row(name: string, value: string): Rendered {
    if (value == null) {
      value = site_settings_conf[name].default;
    }
    const conf = site_settings_conf[name];
    const label = (
      <Tip key={name} title={conf.name} tip={conf.desc}>
        {conf.name}
      </Tip>
    );
    return (
      <LabeledRow label={label} key={name}>
        <FormGroup>
          <FormControl
            ref={name}
            type="text"
            value={value}
            onChange={() => {
              const e = copy(this.state.edited);
              e[name] = ReactDOM.findDOMNode(this.refs[name]).value;
              return this.setState({ edited: e });
            }}
          />
          {name === "version_recommended_browser"
            ? this.render_version_hint(value)
            : undefined}
        </FormGroup>
      </LabeledRow>
    );
  }

  render_editor(): Rendered[] {
    return keys(site_settings_conf).map(name =>
      this.render_row(name, this.state.edited[name])
    );
  }

  render_buttons(): Rendered {
    return (
      <div>
        {this.render_save_button()}
        <Space />
        {this.render_cancel_button()}
      </div>
    );
  }

  render_main(): Rendered {
    switch (this.state.state) {
      case "view":
        return this.render_edit_button();
      case "edit":
        return (
          <Well
            style={{
              margin: "auto",
              maxWidth: "80%"
            }}
          >
            {this.render_buttons()}
            {this.render_editor()}
            {this.render_buttons()}
          </Well>
        );
      case "save":
        return <div>Saving site configuration...</div>;
      case "load":
        return <div>Loading site configuration...</div>;
    }
  }

  render(): Rendered {
    return (
      <div>
        <h4>Site Settings</h4>
        {this.render_main()}
        {this.render_error()}
      </div>
    );
  }
}
