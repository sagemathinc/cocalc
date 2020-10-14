/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { FormGroup, FormControl, Well } from "react-bootstrap";
import { Button } from "../antd-bootstrap";
import { alert_message } from "../alerts";
import * as humanizeList from "humanize-list";
import {
  React,
  Component,
  Rendered,
  ReactDOM,
  rtypes,
  rclass,
  redux,
} from "../app-framework";

import { query } from "../frame-editors/generic/client";
import { copy, deep_copy, keys, unreachable } from "smc-util/misc2";

import { site_settings_conf } from "smc-util/schema";
import { ON_PREM_DEFAULT_QUOTAS } from "smc-util/upgrade-spec";
import { upgrades } from "smc-util/upgrade-spec";
const MAX_UPGRADES = upgrades.max_per_project;

const FIELD_DEFAULTS = {
  default_quotas: ON_PREM_DEFAULT_QUOTAS,
  max_upgrades: MAX_UPGRADES,
} as const;

import { EXTRAS } from "smc-util/db-schema/site-settings-extras";
import { ConfigValid, Config, RowType } from "smc-util/db-schema/site-defaults";

import { isEqual } from "lodash";

import { COLORS } from "smc-util/theme";

// Commented out since Select via antd is broken now,
// at least when used here...
// import { Select } from "antd";
// const { Option } = Select;
import { Input } from "antd";

import {
  CopyToClipBoard,
  Icon,
  Markdown,
  ErrorDisplay,
  LabeledRow,
  Space /*, Tip*/,
} from "../r_misc";

import * as smc_version from "smc-util/smc-version";

type State = "view" | "load" | "edit" | "save" | "error";

interface SiteSettingsProps {
  email_address: string;
}

interface SiteSettingsState {
  state: State; // view --> load --> edit --> save --> view
  error?: string;
  edited?: any;
  data?: any;
  disable_tests: boolean;
}

class SiteSettingsComponent extends Component<
  SiteSettingsProps,
  SiteSettingsState
> {
  constructor(props, state) {
    super(props, state);
    this.on_json_entry_change = this.on_json_entry_change.bind(this);
    this.on_change_entry = this.on_change_entry.bind(this);
    this.state = { state: "view", disable_tests: false };
  }

  public static reduxProps(): object {
    return {
      account: {
        email_address: rtypes.string,
      },
    };
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
    this.setState({ state: "load" as State });
    let result: any;
    try {
      result = await query({
        query: {
          site_settings: [{ name: null, value: null }],
        },
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
      state: "edit" as State,
      error: undefined,
      data,
      edited: deep_copy(data),
      disable_tests: false,
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

  // return true, if the given settings key is a header
  private is_header(name): boolean {
    return (
      EXTRAS[name]?.type == ("header" as RowType) ||
      site_settings_conf[name]?.type == ("header" as RowType)
    );
  }

  private async store(): Promise<void> {
    for (const name in this.state.edited) {
      const value = this.state.edited[name];
      if (this.is_header[name]) continue;
      if (!isEqual(value, this.state.data[name])) {
        try {
          await query({
            query: {
              site_settings: { name: name, value: value },
            },
          });
        } catch (err) {
          this.setState({ state: "error" as State, error: err });
          return;
        }
      }
    }
  }

  private async save(): Promise<void> {
    this.setState({ state: "save" as State });
    await this.store();
    this.setState({ state: "view" as State });
  }

  private cancel(): void {
    this.setState({ state: "view" as State });
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
            padding: "15px",
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
        <CopyToClipBoard
          style={{
            display: "inline-block",
            width: "50ex",
            margin: 0,
          }}
          value={`${smc_version.version}`}
        />{" "}
        {error}
      </div>
    );
  }

  private on_json_entry_change(name) {
    const e = copy(this.state.edited);
    try {
      const new_val = ReactDOM.findDOMNode(this.refs[name])?.value;
      if (new_val == null) return;
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
    e[name] = val ?? ReactDOM.findDOMNode(this.refs[name])?.value;
    return this.setState({ edited: e });
  }

  private render_row_entry_inner(
    name,
    value,
    valid,
    password,
    clearable,
    multiline
  ): Rendered {
    if (Array.isArray(valid)) {
      /* This antd code below is broken because something about
         antd is broken.  Maybe it is a bug in antd.
         Even the first official example in the antd
         docs breaks for me!
         See https://github.com/sagemathinc/cocalc/issues/4714
         */
      /*return
        <Select
          defaultValue={value}
          onChange={(val) => this.on_change_entry(name, val)}
          style={{ width: "100%" }}
        >
          {valid.map((e) => (
            <Option value={e} key={e}>
              {e}
            </Option>
          ))}
        </Select>
      );
      */
      return (
        <select
          defaultValue={value}
          onChange={(event) => this.on_change_entry(name, event.target.value)}
          style={{ width: "100%" }}
        >
          {valid.map((e) => (
            <option value={e} key={e}>
              {e}
            </option>
          ))}
        </select>
      );
    } else {
      if (password) {
        return (
          <Input.Password
            style={this.row_entry_style(value, valid)}
            value={value}
            visibilityToggle={true}
            onChange={(e) => this.on_change_entry(name, e.target.value)}
          />
        );
      } else {
        if (multiline != null) {
          const style = Object.assign(this.row_entry_style(value, valid), {
            fontFamily: "monospace",
            fontSize: "80%",
          } as React.CSSProperties);
          return (
            <Input.TextArea
              rows={4}
              ref={name}
              style={style}
              value={value}
              onChange={() => this.on_change_entry(name)}
            />
          );
        } else {
          return (
            <Input
              ref={name}
              style={this.row_entry_style(value, valid)}
              value={value}
              onChange={() => this.on_change_entry(name)}
              // clearable disabled, otherwise it's not possible to edit the value
              allowClear={clearable && false}
            />
          );
        }
      }
    }
  }

  private render_row_entry(
    name: string,
    value: string,
    password: boolean,
    displayed_val?: string,
    valid?: ConfigValid,
    hint?: Rendered,
    row_type?: RowType,
    clearable?: boolean,
    multiline?: number
  ) {
    if (row_type == ("header" as RowType)) {
      return <div />;
    } else {
      switch (name) {
        case "default_quotas":
        case "max_upgrades":
          return this.render_json_entry(name, value);
        default:
          return (
            <FormGroup>
              {this.render_row_entry_inner(
                name,
                value,
                valid,
                password,
                clearable,
                multiline
              )}
              <div style={{ fontSize: "90%", display: "inlineBlock" }}>
                {this.render_row_version_hint(name, value)}
                {hint}
                {this.render_row_entry_parsed(displayed_val)}
                {this.render_row_entry_valid(valid)}
              </div>
            </FormGroup>
          );
      }
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
    const row_type: RowType = conf.type ?? ("setting" as RowType);

    // fallbacks: to_display? → to_val? → undefined
    const parsed_value: string | undefined =
      typeof conf.to_display == "function"
        ? `${conf.to_display(raw_value)}`
        : typeof conf.to_val == "function"
        ? `${conf.to_val(raw_value)}`
        : undefined;

    const clearable = conf.clearable ?? false;

    const label = (
      <>
        <strong>{conf.name}</strong>
        <br />
        <span style={{ fontSize: "90%" }}>{conf.desc}</span>
      </>
    );

    const hint: Rendered | undefined = this.render_row_hint(conf, raw_value);

    const style: React.CSSProperties = { marginTop: "2rem" };
    // indent optional fields
    if (typeof conf.show == "function" && row_type == ("setting" as RowType)) {
      Object.assign(style, {
        borderLeft: `2px solid ${COLORS.GRAY}`,
        marginLeft: "0px",
        marginTop: "0px",
      } as React.CSSProperties);
    }

    return (
      <LabeledRow label={label} key={name} style={style}>
        {this.render_row_entry(
          name,
          raw_value,
          conf.password ?? false,
          parsed_value,
          conf.valid,
          hint,
          row_type,
          clearable,
          conf.multiline
        )}
      </LabeledRow>
    );
  }

  private render_editor_site_settings(): Rendered[] {
    return keys(site_settings_conf).map((name) =>
      this.render_default_row(name)
    );
  }

  private render_editor_extras(): Rendered[] {
    return keys(EXTRAS).map((name) => this.render_extras_row(name));
  }

  private render_editor(): Rendered {
    return (
      <React.Fragment>
        {this.render_editor_site_settings()}
        {this.render_editor_extras()}
        <Space />
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

  private async send_test_email(
    type: "password_reset" | "invite_email" | "mention" | "verification"
  ): Promise<void> {
    const email = ReactDOM.findDOMNode(this.refs.test_email)?.value;
    if (email == null) return;
    console.log(`sending test email "${type}" to ${email}`);
    // saving info
    await this.store();
    this.setState({ disable_tests: true });
    // wait 3 secs
    await new Promise((done) => setTimeout(done, 3000));
    switch (type) {
      case "password_reset":
        redux.getActions("account").forgot_password(email);
        break;
      case "invite_email":
        alert_message({
          type: "error",
          message: "Simulated invite emails are NYI",
        });
        break;
      case "mention":
        alert_message({
          type: "error",
          message: "Simulated mention emails are NYI",
        });
        break;
      case "verification":
        // The code below "looks good" but it doesn't work ???
        // const users = await user_search({
        //   query: email,
        //   admin: true,
        //   limit: 1
        // });
        // if (users.length == 1) {
        //   await webapp_client.account_client.send_verification_email(users[0].account_id);
        // }
        break;
      default:
        unreachable(type);
    }
    this.setState({ disable_tests: false });
  }

  private render_tests(): Rendered {
    return (
      <div style={{ marginBottom: "1rem" }}>
        <strong>Tests:</strong>
        <Space />
        Email:
        <Space />
        <Input
          style={{ width: "auto" }}
          defaultValue={this.props.email_address}
          ref={"test_email"}
        />
        <Button
          bsSize={"small"}
          disabled={this.state.disable_tests}
          onClick={() => this.send_test_email("password_reset")}
        >
          Forgot Password
        </Button>
        {
          // <Button
          //   disabled={this.state.disable_tests}
          //   bsSize={"small"}
          //   onClick={() => this.send_test_email("verification")}
          // >
          //   Verify
          // </Button>
        }
        {
          // <Button
          //   disabled={this.state.disable_tests}
          //   bsSize={"small"}
          //   onClick={() => this.send_test_email("invite_email")}
          // >
          //   Invite
          // </Button>
          // <Button
          //   disabled={this.state.disable_tests}
          //   bsSize={"small"}
          //   onClick={() => this.send_test_email("mention")}
          // >
          //   @mention
          // </Button>
        }
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
              maxWidth: "80%",
            }}
          >
            {this.render_buttons()}
            {this.render_editor()}
            {this.render_tests()}
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

export const SiteSettings = rclass(SiteSettingsComponent);
