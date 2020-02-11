import { Button, FormGroup, FormControl, Well } from "react-bootstrap";
import * as humanizeList from "humanize-list";
import { React, Component, Rendered, ReactDOM } from "../app-framework";

import { Icon, Markdown } from "../r_misc";
import { Select } from "antd";

import { query } from "../frame-editors/generic/client";
import { copy, deep_copy, keys } from "smc-util/misc2";

import { site_settings_conf } from "smc-util/schema";
import { ON_PREM_DEFAULT_QUOTAS } from "smc-util/upgrade-spec";
const MAX_UPGRADES = require("smc-util/upgrade-spec").upgrades.max_per_project;

const FIELD_DEFAULTS = {
  default_quotas: ON_PREM_DEFAULT_QUOTAS,
  max_upgrades: MAX_UPGRADES
} as const;

import { EXTRAS } from "smc-util/db-schema/site-settings-extras";
import { ConfigValid, Config } from "smc-util/db-schema/site-defaults";

import { isEqual } from "lodash";

import { ErrorDisplay, LabeledRow, Space /*, Tip*/ } from "../r_misc";

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
    this.on_json_entry_change = this.on_json_entry_change.bind(this);
    this.on_change_entry = this.on_change_entry.bind(this);
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

  private toggle_view() {
    switch (this.state.state) {
      case "view":
        this.load();
      case "edit":
        this.cancel();
    }
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
        <code style={{ background: "white", fontSize: "10pt" }}>
          {smc_version.version}
        </code>{" "}
        {error}
      </div>
    );
  }

  private on_json_entry_change(name) {
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
  private render_json_entry(name, data) {
    const jval = JSON.parse(data ?? "{}") ?? {};
    const dflt = FIELD_DEFAULTS[name];
    const quotas = Object.assign({}, dflt, jval);
    const value = JSON.stringify(quotas);
    return (
      <FormGroup>
        <FormControl
          ref={name}
          type="text"
          value={value}
          onChange={() => this.on_json_entry_change(name)}
        />
        (the entry above must be JSON)
      </FormGroup>
    );
  }

  private render_row_entry_parsed(parsed_val?: string): Rendered | undefined {
    if (parsed_val != null) {
      return (
        <span>
          {" "}
          Interpreted as <code>{parsed_val}</code>.{" "}
        </span>
      );
    } else {
      return undefined;
    }
  }

  private render_row_entry_valid(valid?: ConfigValid): Rendered | undefined {
    if (valid != null && Array.isArray(valid)) {
      return <span>Valid values: {humanizeList(valid)}.</span>;
    } else {
      return undefined;
    }
  }

  private render_row_version_hint(name, value): Rendered | undefined {
    if (name === "version_recommended_browser") {
      return this.render_version_hint(value);
    } else {
      return undefined;
    }
  }

  private render_row_hint(
    conf: Config,
    raw_value: string
  ): Rendered | undefined {
    if (typeof conf.hint == "function") {
      return <Markdown value={conf.hint(raw_value)} />;
    } else {
      return undefined;
    }
  }

  private row_entry_style(value, valid?: ConfigValid): React.CSSProperties {
    if (
      (Array.isArray(valid) && !valid.includes(value)) ||
      (typeof valid == "function" && !valid(value))
    ) {
      return { backgroundColor: "red", color: "white" };
    }
    return {};
  }

  private on_change_entry(name, val?) {
    const e = copy(this.state.edited);
    e[name] = val ?? ReactDOM.findDOMNode(this.refs[name]).value;
    return this.setState({ edited: e });
  }

  private render_row_entry_inner(name, value, valid, password): Rendered {
    if (Array.isArray(valid)) {
      return (
        <Select
          defaultValue={value}
          onChange={val => this.on_change_entry(name, val)}
          style={{ width: "100%" }}
        >
          {valid.map(e => (
            <Select.Option value={e} key={e}>
              {e}
            </Select.Option>
          ))}
        </Select>
      );
    } else {
      return (
        <FormControl
          ref={name}
          style={this.row_entry_style(value, valid)}
          type={password ? "password" : "text"}
          value={value}
          onChange={() => this.on_change_entry(name)}
        />
      );
    }
  }

  private render_row_entry(
    name: string,
    value: string,
    password: boolean,
    parsed_val?: string,
    valid?: ConfigValid,
    hint?: Rendered
  ) {
    switch (name) {
      case "default_quotas":
      case "max_upgrades":
        return this.render_json_entry(name, value);
      default:
        return (
          <FormGroup>
            {this.render_row_entry_inner(name, value, valid, password)}
            <p style={{ fontSize: "90%" }}>
              {this.render_row_version_hint(name, value)}
              {hint}
              {this.render_row_entry_parsed(parsed_val)}
              {this.render_row_entry_valid(valid)}
            </p>
          </FormGroup>
        );
    }
  }

  private render_default_row(name): Rendered | undefined {
    const conf: Config = site_settings_conf[name];
    return this.render_row(name, conf);
  }

  private render_extras_row(name): Rendered | undefined {
    const conf: Config = EXTRAS[name];
    return this.render_row(name, conf);
  }

  private render_row(name: string, conf: Config): Rendered | undefined {
    // don't show certain fields, i.e. where show evals to false
    if (typeof conf.show == "function" && !conf.show(this.state.edited)) {
      return undefined;
    }
    const raw_value = this.state.edited[name] ?? conf.default;

    const parsed_value: string | undefined =
      typeof conf.to_val == "function"
        ? `${conf.to_val(raw_value)}`
        : undefined;

    const label = (
      <>
        <strong>{conf.name}</strong>
        <br />
        <span style={{ fontSize: "90%" }}>{conf.desc}</span>
      </>
    );

    const hint: Rendered | undefined = this.render_row_hint(conf, raw_value);

    return (
      <LabeledRow label={label} key={name} style={{ marginBottom: "2rem" }}>
        {this.render_row_entry(
          name,
          raw_value,
          conf.password ?? false,
          parsed_value,
          conf.valid,
          hint
        )}
      </LabeledRow>
    );
  }

  private render_editor_site_settings(): Rendered[] {
    return keys(site_settings_conf).map(name => this.render_default_row(name));
  }

  private render_editor_extras(): Rendered[] {
    return keys(EXTRAS).map(name => this.render_extras_row(name));
  }

  private render_editor(): Rendered {
    return (
      <React.Fragment>
        {this.render_editor_site_settings()}
        {this.render_editor_extras()}
      </React.Fragment>
    );
  }

  private render_buttons(): Rendered {
    return (
      <div>
        {this.render_save_button()}
        <Space />
        {this.render_cancel_button()}
      </div>
    );
  }

  private render_main(): Rendered | undefined {
    switch (this.state.state) {
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
      default:
        return undefined;
    }
  }

  render_header(): Rendered {
    return (
      <h4 onClick={() => this.toggle_view()} style={{ cursor: "pointer" }}>
        <Icon
          style={{ width: "20px" }}
          name={this.state.state == "edit" ? "caret-down" : "caret-right"}
        />{" "}
        Site Settings
      </h4>
    );
  }

  render(): Rendered {
    return (
      <div>
        {this.render_header()}
        {this.render_main()}
        {this.render_error()}
      </div>
    );
  }
}
