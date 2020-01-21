import { Button, FormGroup, FormControl, Well } from "react-bootstrap";

import { React, Component, Rendered, ReactDOM } from "../app-framework";

import { query } from "../frame-editors/generic/client";
import { copy, deep_copy, keys } from "smc-util/misc2";

import { site_settings_conf } from "smc-util/schema";
import { ON_PREM_DEFAULT_QUOTAS } from "smc-util/upgrade-spec";

import { isEqual } from "lodash";

import { ErrorDisplay, LabeledRow, Space, Tip } from "../r_misc";

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
    this.on_default_quota_change = this.on_default_quota_change.bind(this);
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
    for (const x of result.query.site_settings) {
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
    for (const name in this.state.edited) {
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
    for (const name in this.state.edited) {
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

  private on_default_quota_change(name) {
    const e = copy(this.state.edited);
    try {
      const new_val = ReactDOM.findDOMNode(this.refs[name]).value;
      JSON.parse(new_val); // does it throw?
      e[name] = new_val;
      this.setState({ edited: e });
    } catch (err) {
      console.log("default quota error:", err.message);
    }
  }

  // this is specific to on-premises kubernetes setups
  // the production site works differently
  // TODO make this a more sophisticated data editor
  private render_default_quota(name, data) {
    const jval = JSON.parse(data ?? "{}") ?? {};
    const quotas = Object.assign({}, ON_PREM_DEFAULT_QUOTAS, jval);
    const value = JSON.stringify(quotas);
    return (
      <FormGroup>
        <FormControl
          ref={name}
          type="text"
          value={value}
          onChange={() => this.on_default_quota_change(name)}
        />
        (the entry above must be JSON)
      </FormGroup>
    );
  }

  private render_row_entry(name: string, value: string) {
    switch (name) {
      case "default_quota":
        return this.render_default_quota(name, value);
      default:
        return (
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
        );
    }
  }

  render_row(name: string, value: string): Rendered | undefined {
    if (value == null) {
      value = site_settings_conf[name].default;
    }
    const conf = site_settings_conf[name];
    const label = (
      <Tip key={name} title={conf.name} tip={conf.desc}>
        {conf.name}
      </Tip>
    );

    // do not show default quota unless it is for on-premp k8s setups
    if (name == "default_quota" && this.state.edited.kucalc != "cloudcalc") {
      return undefined;
    } else {
      return (
        <LabeledRow label={label} key={name}>
          {this.render_row_entry(name, value)}
        </LabeledRow>
      );
    }
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
