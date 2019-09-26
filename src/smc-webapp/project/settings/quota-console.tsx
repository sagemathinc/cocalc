/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS104: Avoid inline assignments
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
// TODO: Remove `as any`s in this file.
// Refer to https://github.com/microsoft/TypeScript/issues/13948
import * as React from "react";
import * as immutable from "immutable";
import { Assign } from "utility-types";
import { LabeledRow, Tip, Icon, Space, Loading } from "../../r_misc";
import { alert_message } from "../../alerts";
const misc = require("smc-util/misc");
const { User } = require("../../users");
const { webapp_client } = require("../../webapp_client");
const { PROJECT_UPGRADES } = require("smc-util/schema");
const {
  Checkbox,
  Row,
  Col,
  ButtonToolbar,
  Button
} = require("react-bootstrap");

interface Props {
  project_id: string;
  project_settings: immutable.Map<string, any>; // settings contains the base values for quotas
  project_status?: immutable.Map<string, any>;
  project_state?: "opened" | "running" | "starting" | "stopping"; //  -- only show memory usage when project_state == 'running'
  user_map: object;
  quota_params: object; // from the schema
  account_groups: any[];
  total_project_quotas?: object; // undefined if viewing as admin
  all_upgrades_to_this_project: object;
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
      upgrading: false // user is currently upgrading
    };
    const settings = this.props.project_settings;
    if (settings != null) {
      // TODO: Make this nicer
      for (let name in this.props.quota_params) {
        var left;
        const data = this.props.quota_params[name];
        const factor = data.display_factor;
        const base_value = (left = settings.get(name)) != null ? left : 0;
        state[name] = misc.round2(base_value * factor);
      }
    }
    this.state = state as any;
  }

  componentWillReceiveProps(next_props) {
    const settings = next_props.project_settings;
    if (!immutable.is(this.props.project_settings, settings)) {
      if (settings != null) {
        const new_state = {};
        for (let name in this.props.quota_params) {
          const data = this.props.quota_params[name];
          new_state[name] = misc.round2(
            settings.get(name) * data.display_factor
          );
        }
        return this.setState(new_state);
      }
    }
  }

  render_quota_row(name, quota, base_value, upgrades, params_data) {
    if (base_value == null) {
      base_value = 0;
    }
    const factor = params_data.display_factor;
    const unit = params_data.display_unit;

    const text = function(val) {
      const amount = misc.round2(val * factor);
      if (name === "mintime") {
        return misc.seconds2hm(val);
      } else {
        return `${amount} ${misc.plural(amount, unit)}`;
      }
    };

    const upgrade_list: JSX.Element[] = [];
    if (upgrades != null) {
      for (let id in upgrades) {
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

    if (base_value) {
      // amount given by free project
      upgrade_list.unshift(
        <li key="free">{text(base_value)} given by free project</li>
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

  start_admin_editing() {
    return this.setState({ editing: true });
  }

  save_admin_editing() {
    webapp_client.project_set_quotas({
      project_id: this.props.project_id,
      cores: this.state.cores,
      cpu_shares: Math.round(this.state.cpu_shares * 256),
      disk_quota: this.state.disk_quota,
      memory: this.state.memory,
      memory_request: this.state.memory_request,
      mintime: Math.floor(this.state.mintime * 3600),
      network: this.state.network,
      member_host: this.state.member_host,
      cb(err, mesg) {
        if (err) {
          return alert_message({ type: "error", message: err });
        } else if (mesg.event === "error") {
          return alert_message({ type: "error", message: mesg.error });
        } else {
          return alert_message({
            type: "success",
            message: "Project quotas updated."
          });
        }
      }
    });
    return this.setState({ editing: false });
  }

  cancel_admin_editing() {
    const settings = this.props.project_settings;
    if (settings != null) {
      // reset user input states
      const state = {};
      for (let name in this.props.quota_params) {
        var left;
        const data = this.props.quota_params[name];
        const factor = data.display_factor;
        const base_value = (left = settings.get(name)) != null ? left : 0;
        state[name] = misc.round2(base_value * factor);
      }
      this.setState(state);
    }
    return this.setState({ editing: false });
  }

  // Returns true if the admin inputs are valid, i.e.
  //    - at least one has changed
  //    - none are negative
  //    - none are empty
  valid_admin_inputs() {
    let changed;
    const settings = this.props.project_settings;
    if (settings == null) {
      return false;
    }

    for (let name in this.props.quota_params) {
      const data = this.props.quota_params[name];
      if (settings.get(name) == null) {
        continue;
      }
      const factor = data != null ? data.display_factor : undefined;
      const cur_val = settings.get(name) * factor;
      const new_val = misc.parse_number_input(this.state[name]);
      if (new_val == null) {
        return false;
      }
      if (cur_val !== new_val) {
        changed = true;
      }
    }
    return changed;
  }

  render_admin_edit_buttons() {
    if (Array.from(this.props.account_groups).includes("admin")) {
      if (this.state.editing) {
        return (
          <Row>
            <Col sm={6} smOffset={6}>
              <ButtonToolbar style={{ float: "right" }}>
                <Button
                  onClick={this.save_admin_editing}
                  bsStyle="warning"
                  disabled={!this.valid_admin_inputs()}
                >
                  <Icon name="thumbs-up" /> Done
                </Button>
                <Button onClick={this.cancel_admin_editing}>Cancel</Button>
              </ButtonToolbar>
            </Col>
          </Row>
        );
      } else {
        return (
          <Row>
            <Col sm={6} smOffset={6}>
              <Button
                onClick={this.start_admin_editing}
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

  admin_input_validation_styles(input) {
    let style;
    if (misc.parse_number_input(input) == null) {
      style = {
        outline: "none",
        borderColor: "red",
        boxShadow: "0 0 10px red"
      };
    }
    return style;
  }

  render_input(label: keyof QuotaParams) {
    if (label === "network" || label === "member_host") {
      return (
        <Checkbox
          ref={label}
          checked={this.state[label]}
          style={{ marginLeft: 0 }}
          onChange={e =>
            this.setState({ [label]: e.target.checked ? 1 : 0 } as any)
          }
        >
          {this.state[label] ? "Enabled" : "Enable"}
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
          onChange={e => this.setState({ [label]: e.target.value } as any)}
        />
      );
    }
  }

  render_disk_used(disk) {
    if (!disk) {
      return;
    }
    return (
      <span>
        <Space /> (<b>{disk} MB</b> used)
      </span>
    );
  }

  render_memory_used(memory) {
    if (!["running", "saving"].includes(this.props.project_state || "")) {
      return;
    }
    return (
      <span>
        <Space /> (<b>{memory} MB</b> used)
      </span>
    );
  }

  render() {
    let name;
    const settings = this.props.project_settings;
    if (settings == null) {
      return <Loading />;
    }
    const status = this.props.project_status;
    let total_quotas = this.props.total_project_quotas;
    if (total_quotas == null) {
      // this happens for the admin -- just ignore any upgrades from the users
      total_quotas = {};
      for (name in this.props.quota_params) {
        // Unused??
        // const data = this.props.quota_params[name];
        total_quotas[name] = settings.get(name);
      }
    }
    // Unused??
    // const disk_quota = <b>{settings.get("disk_quota")}</b>;
    let memory: string | number = "?";
    let disk: string | number = "?";
    const { quota_params } = this.props;

    if (status != null) {
      const rss = __guard__(status.get("memory"), x => x.get("rss"));
      if (rss != null) {
        memory = Math.round(rss / 1000);
      }
      disk = status.get("disk_MB");
      if (typeof disk == "number") {
        disk = Math.ceil(disk);
      }
    }

    const r = misc.round2;
    // the keys in quotas have to match those in PROJECT_UPGRADES.field_order
    const quotas = {
      disk_quota: {
        view: (
          <span>
            <b>
              {r(
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
        )
      },
      memory: {
        view: (
          <span>
            <b>
              {r(
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
        )
      },
      memory_request: {
        view: (
          <span>
            <b>
              {r(
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
        )
      },
      cores: {
        view: (
          <span>
            <b>
              {r(total_quotas["cores"] * quota_params["cores"].display_factor)}{" "}
              {misc.plural(
                total_quotas["cores"] * quota_params["cores"].display_factor,
                "core"
              )}
            </b>
          </span>
        ),
        edit: <b>{this.render_input("cores")} cores</b>
      },
      cpu_shares: {
        view: (
          <b>
            {r(
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
        )
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
        )
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
        edit: this.render_input("network")
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
        edit: this.render_input("member_host")
      }
    };

    const upgrades = this.props.all_upgrades_to_this_project;

    return (
      <div>
        {this.render_admin_edit_buttons()}
        {(() => {
          const result: any[] = [];
          for (name of Array.from(PROJECT_UPGRADES.field_order)) {
            result.push(
              this.render_quota_row(
                name,
                quotas[name],
                settings.get(name),
                upgrades[name],
                quota_params[name]
              )
            );
          }
          return result;
        })()}
      </div>
    );
  }
}

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}
