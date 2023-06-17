/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as immutable from "immutable";
import { useEffect, useState } from "react";
import { Row, Col } from "@cocalc/frontend/antd-bootstrap";
import { Button } from "antd";
import { alert_message } from "@cocalc/frontend/alerts";
import { usePrevious } from "@cocalc/frontend/app-framework";
import { Icon, Loading, Space } from "@cocalc/frontend/components";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import * as misc from "@cocalc/util/misc";
import { PROJECT_UPGRADES } from "@cocalc/util/schema";
import { ProjectSettings, ProjectStatus } from "../types";
import QuotaRow from "./quota-row";
import QuotaControl from "./quota-control";
import type { QuotaParams } from "./types";

interface Props {
  project_id: string;
  project_settings: ProjectSettings; // settings contains the base values for quotas
  project_status?: ProjectStatus;
  project_state?: "opened" | "running" | "starting" | "stopping"; //  -- only show memory usage when project_state == 'running'
  quota_params: object; // from the schema
  account_groups: immutable.List<string>;
  total_project_quotas?: object; // undefined if viewing as admin
  site_license_upgrades?: object;
  all_upgrades_to_this_project?: object;
  expand_admin_only?: boolean;
}

export default function QuotaConsole({
  project_settings,
  account_groups,
  quota_params,
  project_id,
  site_license_upgrades,
  total_project_quotas,
  project_state,
  project_status,
  all_upgrades_to_this_project = {},
  expand_admin_only = false,
}: Props) {
  const is_admin = account_groups.includes("admin");
  const [editing, setEditing] = useState<boolean>(false);
  const [quotaState, setQuotaState] = useState<QuotaParams | null>(null);
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

  function start_admin_editing(): void {
    setEditing(true);
  }

  async function save_admin_editing(): Promise<void> {
    if (quotaState == null) return;
    try {
      await webapp_client.project_client.set_quotas({
        project_id: project_id,
        cores: quotaState.cores,
        cpu_shares: Math.round(quotaState.cpu_shares * 256),
        disk_quota: quotaState.disk_quota,
        memory: quotaState.memory,
        memory_request: quotaState.memory_request,
        mintime: Math.floor(quotaState.mintime * 3600),
        network: quotaState.network ? 1 : 0,
        member_host: quotaState.member_host ? 1 : 0,
        always_running: quotaState.always_running ? 1 : 0,
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
    if (quotaState == null) return false;

    for (const name in quota_params) {
      if (quota_params[name] == null) {
        throw Error("bug -- invalid quota schema");
      }
      const data = quota_params[name];
      const factor = data.display_factor ?? 1;
      const cur_val = (settings.get(name) ?? 0) * factor;
      const new_val = misc.parse_number_input(quotaState[name]);
      if (new_val == null) {
        continue;
      }
      if (cur_val !== new_val) {
        changed = true;
      }
    }
    return changed;
  }

  function render_admin_edit_buttons() {
    if (is_admin) {
      if (editing) {
        return (
          <Row>
            <Col sm={6} smOffset={6}>
              <Button.Group style={{ float: "right" }}>
                <Button
                  onClick={save_admin_editing}
                  danger
                  disabled={!valid_admin_inputs()}
                >
                  <Icon name="thumbs-up" /> Done
                </Button>
                <Button onClick={cancel_admin_editing}>Cancel</Button>
              </Button.Group>
            </Col>
          </Row>
        );
      } else {
        return (
          <Row>
            <Col sm={6} smOffset={6}>
              <Button onClick={start_admin_editing} style={{ float: "right" }}>
                <Icon name="pencil" /> Admin Quotas...
              </Button>
            </Col>
          </Row>
        );
      }
    }
  }

  function renderInput(label: keyof QuotaParams) {
    return (
      <QuotaControl
        label={label}
        quotaState={quotaState}
        setQuotaState={setQuotaState}
      />
    );
  }

  function render_disk_used(disk: number | string) {
    if (!disk) {
      return;
    }
    return (
      <span>
        <Space /> (<b>{disk} MB</b> used)
      </span>
    );
  }

  function render_memory_used(memory: number | string) {
    if (!["running", "saving"].includes(project_state ?? "") || memory == "?") {
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
      total_quotas[name] = settings.get(name);
    }
  }
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
          <b>{renderInput("disk_quota")} MB</b> disk space limit <Space />{" "}
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
          <b>{renderInput("memory")} MB</b> RAM memory limit{" "}
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
          <b>{renderInput("memory_request")} MB</b> dedicated RAM memory
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
      edit: <b>{renderInput("cores")} cores</b>,
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
          {renderInput("cpu_shares")}{" "}
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
          <b>{renderInput("mintime")} hours</b> of non-interactive use before
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
      edit: renderInput("network"),
    },
    member_host: {
      view: (
        <b>
          {project_settings.get("member_host") || total_quotas["member_host"]
            ? "Yes"
            : "No"}
        </b>
      ),
      edit: renderInput("member_host"),
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
      edit: renderInput("always_running"),
    },
  } as const;

  function render_quota_rows() {
    // we only show all the entries if this is an admin actively editing the settings quotas
    if (is_admin && expand_admin_only && !editing) return;

    return PROJECT_UPGRADES.field_order.map((name) => (
      <QuotaRow
        key={name}
        name={name}
        quota={quotas_edit_config[name]}
        base_value={settings.get(name)}
        upgrades={upgrades[name]}
        params_data={quota_params[name]}
        site_license={site_license[name]}
        total_quotas={total_quotas}
        editing={editing}
      />
    ));
  }

  const upgrades = all_upgrades_to_this_project;
  const site_license = site_license_upgrades ?? {};

  return (
    <div>
      {render_admin_edit_buttons()}
      {render_quota_rows()}
    </div>
  );
}
