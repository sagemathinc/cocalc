/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// TODO: Remove `as any`s in this file.
// Refer to https://github.com/microsoft/TypeScript/issues/13948
import * as React from "react";
import * as immutable from "immutable";
import { Rendered } from "../../app-framework";
import { Assign } from "utility-types";
import { LabeledRow, Tip, Icon, Space, Loading } from "../../r_misc";
import { alert_message } from "../../alerts";
import { ProjectSettings, ProjectStatus } from "./types";
const misc = require("smc-util/misc");
const { User } = require("../../users");
import { webapp_client } from "../../webapp-client";
const { PROJECT_UPGRADES } = require("smc-util/schema");
const {
  Checkbox,
  Row,
  Col,
  ButtonToolbar,
  Button,
} = require("react-bootstrap");

interface Props {
  project_id: string;
  project_settings: ProjectSettings; // settings contains the base values for quotas
  project_status?: ProjectStatus;
  project_state?: "opened" | "running" | "starting" | "stopping"; //  -- only show memory usage when project_state == 'running'
  user_map: object;
  quota_params: object; // from the schema
  account_groups: any[];
  total_project_quotas?: object; // undefined if viewing as admin
  site_license_upgrades?: object;
  all_upgrades_to_this_project: object;
  is_commercial?: boolean;
  kucalc?: string;
}

interface QuotaParams {
  cores: number;
  cpu_shares: number;
  disk_quota: number;
  memory: number;
  memory_request: number;
  mintime: number;
  network: number;
  member_host: number;
  always_running?: number;
}

type State = Assign<
  {
    editing: boolean;
    upgrading: boolean;
  },
  QuotaParams
>;

export class QuotaConsole extends React.Component<Props, State> {
  static defaultProps = { all_upgrades_to_this_project: {} };

  constructor(props) {
    super(props);

    const state = {
      editing: false, // admin is currently editing
      upgrading: false, // user is currently upgrading
    };
    const settings = this.props.project_settings;
    if (settings != undefined) {
      for (const name in this.props.quota_params) {
        const data = this.props.quota_params[name];
        const factor = data.display_factor;
        const base_value = settings.get(name) || 0;
        state[name] = misc.round2(base_value * factor);
      }
    }
    console.log("state = ", state);
    this.state = state as any;
  }

  public componentWillReceiveProps(next_props: Props): void {
    const settings = next_props.project_settings;
    if (!immutable.is(this.props.project_settings, settings)) {
      if (settings != undefined) {
        const new_state = {};
        for (const name in this.props.quota_params) {
          const data = this.props.quota_params[name];
          new_state[name] = misc.round2(
            settings.get(name) * data.display_factor
          );
        }
        this.setState(new_state);
      }
    }
  }

  private render_quota_row(
    name: keyof QuotaParams,
    quota: { edit: string; view: string },
    base_value: number,
    upgrades: QuotaParams,
    params_data: {
      display_factor: number;
      display_unit: string;
      display: string;
      desc: string;
    },
    site_license: number
  ): Rendered {
    if (this.props.kucalc == "no" && name != "mintime") {
      // In anything except KuCalc, only the mintime quota is implemented.
      // NONE of the other quotas are.
      return;
    }
    if (base_value == undefined) {
      base_value = 0;
    }
    const factor = params_data.display_factor;
    const unit = params_data.display_unit;

    function text(val) {
      const amount = misc.round2(val * factor);
      if (name === "mintime") {
        return misc.seconds2hm(val);
      } else {
        return `${amount} ${misc.plural(amount, unit)}`;
      }
    }

    const upgrade_list: JSX.Element[] = [];
    if (upgrades != undefined) {
      for (const id in upgrades) {
        const val = upgrades[id];
        const li = (
          <li key={id}>
            {text(val)} given by{" "}
            <User account_id={id} user_map={this.props.user_map} />
          </li>
        );
        upgrade_list.push(li);
      }
    }

    if (base_value && this.props.is_commercial) {
      // amount given by free project
      upgrade_list.unshift(
        <li key="free">{text(base_value)} included for free</li>
      );
    }

    if (site_license) {
      // amount given by site licenses
      upgrade_list.unshift(
        <li key="site-license">
          {text(site_license)} provided by site license (see below)
        </li>
      );
    }

    return (
      <LabeledRow
        label={
          <Tip title={params_data.display} tip={params_data.desc}>
            {params_data.display}
          </Tip>
        }
        key={params_data.display}
        style={{ borderBottom: "1px solid #ccc" }}
      >
        {this.state.editing ? quota.edit : quota.view}
        <ul style={{ color: "#666" }}>{upgrade_list}</ul>
      </LabeledRow>
    );
  }

  private start_admin_editing(): void {
    this.setState({ editing: true });
  }

  private async save_admin_editing(): Promise<void> {
    try {
      await webapp_client.project_client.set_quotas({
        project_id: this.props.project_id,
        cores: this.state.cores,
        cpu_shares: Math.round(this.state.cpu_shares * 256),
        disk_quota: this.state.disk_quota,
        memory: this.state.memory,
        memory_request: this.state.memory_request,
        mintime: Math.floor(this.state.mintime * 3600),
        network: this.state.network,
        member_host: this.state.member_host,
        always_running: this.state.always_running,
      });
      alert_message({
        type: "success",
        message: "Project quotas updated.",
      });
    } catch (err) {
      alert_message({ type: "error", message: err.message });
    } finally {
      this.setState({ editing: false });
    }
  }

  private cancel_admin_editing(): void {
    const settings = this.props.project_settings;
    if (settings != undefined) {
      // reset user input states
      const state = {};
      for (const name in this.props.quota_params) {
        const data = this.props.quota_params[name];
        const factor = data.display_factor;
        const base_value = settings.get(name) || 0;
        state[name] = misc.round2(base_value * factor);
      }
      this.setState(state);
    }
    this.setState({ editing: false });
  }

  // Returns true if the admin inputs are valid, i.e.
  //    - at least one has changed
  //    - none are negative
  //    - none are empty
  private valid_admin_inputs(): boolean {
    let changed;
    const settings = this.props.project_settings;
    if (settings == undefined) {
      return false;
    }

    for (const name in this.props.quota_params) {
      if (this.props.quota_params[name] == null) {
        throw Error("bug -- invalid quota schema");
      }
      const data = this.props.quota_params[name];
      const factor = data.display_factor ?? 1;
      const cur_val = (settings.get(name) ?? 0) * factor;
      const new_val = misc.parse_number_input(this.state[name]);
      if (new_val == null) {
        continue;
      }
      if (cur_val !== new_val) {
        changed = true;
      }
    }
    return changed;
  }

  private render_admin_edit_buttons(): Rendered {
    if (this.props.account_groups.includes("admin")) {
      if (this.state.editing) {
        return (
          <Row>
            <Col sm={6} smOffset={6}>
              <ButtonToolbar style={{ float: "right" }}>
                <Button
                  onClick={this.save_admin_editing.bind(this)}
                  bsStyle="warning"
                  disabled={!this.valid_admin_inputs()}
                >
                  <Icon name="thumbs-up" /> Done
                </Button>
                <Button onClick={this.cancel_admin_editing.bind(this)}>
                  Cancel
                </Button>
              </ButtonToolbar>
            </Col>
          </Row>
        );
      } else {
        return (
          <Row>
            <Col sm={6} smOffset={6}>
              <Button
                onClick={this.start_admin_editing.bind(this)}
                bsStyle="warning"
                style={{ float: "right" }}
              >
                <Icon name="pencil" /> Admin Edit...
              </Button>
            </Col>
          </Row>
        );
      }
    }
  }

  private admin_input_validation_styles(
    input: number
  ): React.CSSProperties | undefined {
    if (misc.parse_number_input(input) == undefined) {
      return {
        outline: "none",
        borderColor: "red",
        boxShadow: "0 0 10px red",
      };
    } else {
      return { border: "1px solid lightgrey", borderRadius: "3px", padding: "5px" };
    }
  }

  private render_input(label: keyof QuotaParams): Rendered {
    if (
      label === "network" ||
      label === "member_host" ||
      label === "always_running"
    ) {
      return (
        <Checkbox
          ref={label}
          checked={this.state[label]}
          style={{ marginLeft: 0 }}
          onChange={(e) =>
            this.setState({ [label]: e.target.checked ? 1 : 0 } as any)
          }
        >
          {this.state[label] ? "Enabled" : "Disabled"}
        </Checkbox>
      );
    } else {
      // not using react component so the input stays inline
      return (
        <input
          size={5}
          type="text"
          ref={label}
          value={this.state[label]}
          style={this.admin_input_validation_styles(this.state[label])}
          onChange={(e) => this.setState({ [label]: e.target.value } as any)}
        />
      );
    }
  }

  private render_disk_used(disk: number | string): Rendered {
    if (!disk) {
      return;
    }
    return (
      <span>
        <Space /> (<b>{disk} MB</b> used)
      </span>
    );
  }

  private render_memory_used(memory: number | string): Rendered {
    if (!["running", "saving"].includes(this.props.project_state || "")) {
      return;
    }
    return (
      <span>
        <Space /> (<b>{memory} MB</b> used)
      </span>
    );
  }

  public render(): Rendered {
    let name;
    const settings = this.props.project_settings;
    if (settings == undefined) {
      return <Loading />;
    }
    const status = this.props.project_status;
    let total_quotas = this.props.total_project_quotas;
    if (total_quotas == undefined) {
      // this happens for the admin -- just ignore any upgrades from the users
      total_quotas = {};
      for (name in this.props.quota_params) {
        // Unused?? Found while typescripting. Could be a bug.
        // const data = this.props.quota_params[name];
        total_quotas[name] = settings.get(name);
      }
    }
    // Unused?? Found while typescripting. Could be a bug.
    // const disk_quota = <b>{settings.get("disk_quota")}</b>;
    let memory: string | number = "?";
    let disk: string | number = "?";
    const { quota_params } = this.props;

    if (status != undefined) {
      const rss = status.getIn(["memory", "rss"]);
      if (rss != undefined) {
        memory = Math.round(rss / 1000);
      }
      disk = status.get("disk_MB");
      if (typeof disk == "number") {
        disk = Math.ceil(disk);
      }
    }

    const round = misc.round2;
    // the keys in quotas have to match those in PROJECT_UPGRADES.field_order
    const quotas = {
      disk_quota: {
        view: (
          <span>
            <b>
              {round(
                total_quotas["disk_quota"] *
                  quota_params["disk_quota"].display_factor
              )}{" "}
              MB
            </b>{" "}
            disk usage limit {this.render_disk_used(disk)}
          </span>
        ),
        edit: (
          <span>
            <b>{this.render_input("disk_quota")} MB</b> disk space limit{" "}
            <Space /> {this.render_disk_used(disk)}
          </span>
        ),
      },
      memory: {
        view: (
          <span>
            <b>
              {round(
                total_quotas["memory"] * quota_params["memory"].display_factor
              )}{" "}
              MB
            </b>{" "}
            shared RAM memory limit {this.render_memory_used(memory)}
          </span>
        ),
        edit: (
          <span>
            <b>{this.render_input("memory")} MB</b> RAM memory limit{" "}
            {this.render_memory_used(memory)}{" "}
          </span>
        ),
      },
      memory_request: {
        view: (
          <span>
            <b>
              {round(
                total_quotas["memory_request"] *
                  quota_params["memory_request"].display_factor
              )}{" "}
              MB
            </b>{" "}
            dedicated RAM
          </span>
        ),
        edit: (
          <span>
            <b>{this.render_input("memory_request")} MB</b> dedicated RAM memory
          </span>
        ),
      },
      cores: {
        view: (
          <span>
            <b>
              {round(
                total_quotas["cores"] * quota_params["cores"].display_factor
              )}{" "}
              {misc.plural(
                total_quotas["cores"] * quota_params["cores"].display_factor,
                "core"
              )}
            </b>
          </span>
        ),
        edit: <b>{this.render_input("cores")} cores</b>,
      },
      cpu_shares: {
        view: (
          <b>
            {round(
              total_quotas["cpu_shares"] *
                quota_params["cpu_shares"].display_factor
            )}{" "}
            {misc.plural(
              total_quotas["cpu_shares"] *
                quota_params["cpu_shares"].display_factor,
              "core"
            )}
          </b>
        ),
        edit: (
          <b>
            {this.render_input("cpu_shares")}{" "}
            {misc.plural(total_quotas["cpu_shares"], "core")}
          </b>
        ),
      },
      mintime: {
        // no display factor multiplication, because mintime is in seconds
        view: (
          <span>
            <b>{misc.seconds2hm(total_quotas["mintime"], true)}</b> of
            non-interactive use before project stops
          </span>
        ),
        edit: (
          <span>
            <b>{this.render_input("mintime")} hours</b> of non-interactive use
            before project stops
          </span>
        ),
      },
      network: {
        view: (
          <b>
            {this.props.project_settings.get("network") ||
            total_quotas["network"]
              ? "Yes"
              : "Blocked"}
          </b>
        ),
        edit: this.render_input("network"),
      },
      member_host: {
        view: (
          <b>
            {this.props.project_settings.get("member_host") ||
            total_quotas["member_host"]
              ? "Yes"
              : "No"}
          </b>
        ),
        edit: this.render_input("member_host"),
      },
      always_running: {
        view: (
          <b>
            {this.props.project_settings.get("always_running") ||
            total_quotas["always_running"]
              ? "Yes"
              : "No"}
          </b>
        ),
        edit: this.render_input("always_running"),
      },
    };

    const upgrades = this.props.all_upgrades_to_this_project;
    const site_license =
      this.props.site_license_upgrades != null
        ? this.props.site_license_upgrades
        : {};

    return (
      <div>
        {this.render_admin_edit_buttons()}
        {PROJECT_UPGRADES.field_order.map((name) => {
          return this.render_quota_row(
            name,
            quotas[name],
            settings.get(name),
            upgrades[name],
            quota_params[name],
            site_license[name]
          );
        })}
      </div>
    );
  }
}
