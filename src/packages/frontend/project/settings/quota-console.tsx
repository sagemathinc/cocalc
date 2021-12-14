/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// TODO: Remove `as any`s in this file.
// Refer to https://github.com/microsoft/TypeScript/issues/13948
import React, { useEffect, useState } from "react";
import * as immutable from "immutable";
import { Rendered, usePrevious } from "../../app-framework";
import { LabeledRow, Tip, Icon, Space, Loading } from "../../components";
import { alert_message } from "../../alerts";
import { ProjectSettings, ProjectStatus } from "./types";
import * as misc from "@cocalc/util/misc";
const { User } = require("../../users"); // TODO fix typing error when importing properly
import { webapp_client } from "../../webapp-client";
import { PROJECT_UPGRADES } from "@cocalc/util/schema";
import { KUCALC_DISABLED } from "@cocalc/util/db-schema/site-defaults";
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
  all_upgrades_to_this_project?: object;
  is_commercial?: boolean;
  kucalc?: string;
}

// the typing is very sloppy. parts of the UI use 0/1 for boolean, other parts
// a string like "1000" as a number 1000.
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

export const QuotaConsole: React.FC<Props> = (props: Props) => {
  const {
    project_settings,
    account_groups,
    quota_params,
    project_id,
    site_license_upgrades,
    total_project_quotas,
    user_map,
    is_commercial,
    project_state,
    project_status,
    kucalc,
    all_upgrades_to_this_project = {},
  } = props;

  const [editing, setEditing] = useState<boolean>(false);

  // const initQuota: QuotaParams = {}
  //     if (project_settings != undefined) {
  //       for (const name in quota_params) {
  //         const data = quota_params[name];
  //         const factor = data.display_factor;
  //         const base_value = project_settings.get(name) || 0;
  //         initQuota[name] = misc.round2(base_value * factor);
  //       }
  //     }
  const [quota_state, setQuotaState] = useState<QuotaParams>();

  const previous_project_settings = usePrevious(project_settings);

  useEffect(() => {
    if (!immutable.is(project_settings, previous_project_settings)) {
      const settings = project_settings;
      if (settings != undefined) {
        const new_state: any = {};
        for (const name in quota_params) {
          const data = quota_params[name];
          new_state[name] = misc.round2(
            (settings.get(name) ?? 0) * data.display_factor
          );
        }
        setQuotaState(new_state);
      }
    }
  }, [project_settings]);

  function render_quota_row(
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
    if (
      kucalc == KUCALC_DISABLED &&
      name != "mintime" &&
      name != "always_running"
    ) {
      // In anything except KuCalc, only the mintime and always_on quota is implemented.
      // NONE of the other quotas are.
      return;
    }
    // if always_running is true, don't show idle timeout row, since not relevant
    if (
      name == "mintime" &&
      ((quota["always_running"] && quota["editing"]) ||
        total_project_quotas?.["always_running"])
    )
      return;

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
            {text(val)} given by <User account_id={id} user_map={user_map} />
          </li>
        );
        upgrade_list.push(li);
      }
    }

    if (base_value && is_commercial) {
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
        {editing ? quota.edit : quota.view}
        <ul style={{ color: "#666" }}>{upgrade_list}</ul>
      </LabeledRow>
    );
  }

  function start_admin_editing(): void {
    setEditing(true);
  }

  async function save_admin_editing(): Promise<void> {
    if (quota_state == null) return;
    try {
      await webapp_client.project_client.set_quotas({
        project_id: project_id,
        cores: quota_state.cores,
        cpu_shares: Math.round(quota_state.cpu_shares * 256),
        disk_quota: quota_state.disk_quota,
        memory: quota_state.memory,
        memory_request: quota_state.memory_request,
        mintime: Math.floor(quota_state.mintime * 3600),
        network: quota_state.network ? 1 : 0,
        member_host: quota_state.member_host ? 1 : 0,
        always_running: quota_state.always_running ? 1 : 0,
      });
      alert_message({
        type: "success",
        message: "Project quotas updated.",
      });
    } catch (err) {
      alert_message({ type: "error", message: err.message });
    } finally {
      setEditing(false);
    }
  }

  function cancel_admin_editing(): void {
    const settings = project_settings;
    if (settings != undefined) {
      // reset user input states
      const state: any = {};
      for (const name in quota_params) {
        const data = quota_params[name];
        const factor = data.display_factor;
        const base_value = settings.get(name) || 0;
        state[name] = misc.round2(base_value * factor);
      }
      setQuotaState(state);
    }
    setEditing(false);
  }

  // Returns true if the admin inputs are valid, i.e.
  //    - at least one has changed
  //    - none are negative
  //    - none are empty
  function valid_admin_inputs(): boolean {
    let changed;
    const settings = project_settings;
    if (settings == undefined) {
      return false;
    }
    if (quota_state == null) return false;

    for (const name in quota_params) {
      if (quota_params[name] == null) {
        throw Error("bug -- invalid quota schema");
      }
      const data = quota_params[name];
      const factor = data.display_factor ?? 1;
      const cur_val = (settings.get(name) ?? 0) * factor;
      const new_val = misc.parse_number_input(quota_state[name]);
      if (new_val == null) {
        continue;
      }
      if (cur_val !== new_val) {
        changed = true;
      }
    }
    return changed;
  }

  function render_admin_edit_buttons(): Rendered {
    if (account_groups.includes("admin")) {
      if (editing) {
        return (
          <Row>
            <Col sm={6} smOffset={6}>
              <ButtonToolbar style={{ float: "right", marginTop: "15px" }}>
                <Button
                  onClick={save_admin_editing}
                  bsStyle="warning"
                  disabled={!valid_admin_inputs()}
                >
                  <Icon name="thumbs-up" /> Done
                </Button>
                <Button onClick={cancel_admin_editing}>Cancel</Button>
              </ButtonToolbar>
            </Col>
          </Row>
        );
      } else {
        return (
          <Row>
            <Col sm={6} smOffset={6}>
              <Button
                onClick={start_admin_editing}
                bsStyle="warning"
                style={{ float: "right", marginTop: "15px" }}
              >
                <Icon name="pencil" /> Admin Edit...
              </Button>
            </Col>
          </Row>
        );
      }
    }
  }

  function admin_input_validation_styles(
    input: number
  ): React.CSSProperties | undefined {
    if (misc.parse_number_input(input) == null) {
      return {
        outline: "none",
        borderColor: "red",
        boxShadow: "0 0 10px red",
      };
    } else {
      return {
        border: "1px solid lightgrey",
        borderRadius: "3px",
        padding: "5px",
      };
    }
  }

  function render_input(label: keyof QuotaParams): Rendered {
    if (quota_state == null) return;
    if (
      label === "network" ||
      label === "member_host" ||
      label === "always_running"
    ) {
      return (
        <Checkbox
          key={label}
          checked={quota_state[label]}
          style={{ marginLeft: 0 }}
          onChange={(e) =>
            setQuotaState({ ...quota_state, [label]: e.target.checked ? 1 : 0 })
          }
        >
          {quota_state[label] ? "Enabled" : "Disabled"}
        </Checkbox>
      );
    } else {
      // not using react component so the input stays inline
      return (
        <input
          size={5}
          type="text"
          key={label}
          value={quota_state[label]}
          style={admin_input_validation_styles(quota_state[label])}
          onChange={(e) => {
            setQuotaState({ ...quota_state, [label]: e.target.value });
          }}
        />
      );
    }
  }

  function render_disk_used(disk: number | string): Rendered {
    if (!disk) {
      return;
    }
    return (
      <span>
        <Space /> (<b>{disk} MB</b> used)
      </span>
    );
  }

  function render_memory_used(memory: number | string): Rendered {
    if (!["running", "saving"].includes(project_state ?? "")) {
      return;
    }
    return (
      <span>
        <Space /> (<b>{memory} MB</b> used)
      </span>
    );
  }

  const settings = project_settings;
  if (settings == undefined) {
    return <Loading />;
  }
  const status = project_status;
  let total_quotas = total_project_quotas;
  if (total_quotas == undefined) {
    // this happens for the admin -- just ignore any upgrades from the users
    total_quotas = {};
    for (const name in quota_params) {
      // Unused?? Found while typescripting. Could be a bug.
      // const data = quota_params[name];
      total_quotas[name] = settings.get(name);
    }
  }
  // Unused?? Found while typescripting. Could be a bug.
  // const disk_quota = <b>{settings.get("disk_quota")}</b>;
  let memory: string | number = "?";
  let disk: string | number = "?";

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
  const quotas_edit_config = {
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
          disk usage limit {render_disk_used(disk)}
        </span>
      ),
      edit: (
        <span>
          <b>{render_input("disk_quota")} MB</b> disk space limit <Space />{" "}
          {render_disk_used(disk)}
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
          shared RAM memory limit {render_memory_used(memory)}
        </span>
      ),
      edit: (
        <span>
          <b>{render_input("memory")} MB</b> RAM memory limit{" "}
          {render_memory_used(memory)}{" "}
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
          <b>{render_input("memory_request")} MB</b> dedicated RAM memory
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
      edit: <b>{render_input("cores")} cores</b>,
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
          {render_input("cpu_shares")}{" "}
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
          <b>{render_input("mintime")} hours</b> of non-interactive use before
          project stops
        </span>
      ),
    },
    network: {
      view: (
        <b>
          {project_settings.get("network") || total_quotas["network"]
            ? "Yes"
            : "Blocked"}
        </b>
      ),
      edit: render_input("network"),
    },
    member_host: {
      view: (
        <b>
          {project_settings.get("member_host") || total_quotas["member_host"]
            ? "Yes"
            : "No"}
        </b>
      ),
      edit: render_input("member_host"),
    },
    always_running: {
      view: (
        <b>
          {project_settings.get("always_running") ||
          total_quotas["always_running"]
            ? "Yes"
            : "No"}
        </b>
      ),
      edit: render_input("always_running"),
    },
  };

  const upgrades = all_upgrades_to_this_project;
  const site_license = site_license_upgrades ?? {};

  return (
    <div>
      {render_admin_edit_buttons()}
      {PROJECT_UPGRADES.field_order.map((name) => {
        return render_quota_row(
          name,
          quotas_edit_config[name],
          settings.get(name),
          upgrades[name],
          quota_params[name],
          site_license[name]
        );
      })}
    </div>
  );
};
