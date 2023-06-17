/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as immutable from "immutable";
import { useEffect, useState } from "react";
import { Button, Card, Popconfirm, Popover } from "antd";
import { alert_message } from "@cocalc/frontend/alerts";
import { usePrevious } from "@cocalc/frontend/app-framework";
import { Icon, Loading, Space } from "@cocalc/frontend/components";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import * as misc from "@cocalc/util/misc";
import { PROJECT_UPGRADES } from "@cocalc/util/schema";
import { ProjectSettings, ProjectStatus } from "../types";
import QuotaRow from "./quota-row";
import type { QuotaParams } from "./types";

interface Props {
  project_id: string;
  project_settings: ProjectSettings; // settings contains the base values for quotas
  project_status?: ProjectStatus;
  project_state?: "opened" | "running" | "starting" | "stopping"; //  -- only show memory usage when project_state == 'running'
  quota_params: object; // from the schema
  account_groups: immutable.List<string>;
  total_project_quotas?: object; // undefined if viewing as admin
  all_upgrades_to_this_project?: object;
  expand_admin_only?: boolean;
}

export default function QuotaConsole({
  project_settings,
  account_groups,
  quota_params,
  project_id,
  total_project_quotas,
  project_state,
  project_status,
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
        cpu_shares: Math.round(quotaState.cpu_shares * 1024),
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
  function isModifiedValidInput(): boolean {
    let changed = false;
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
        console.log(name, cur_val, new_val);
        changed = true;
      }
    }
    return changed;
  }

  function render_admin_edit_buttons() {
    if (editing) {
      return (
        <>
          <Button style={{ marginRight: "8px" }} onClick={cancel_admin_editing}>
            Cancel
          </Button>
          <Popconfirm
            disabled={!isModifiedValidInput()}
            onConfirm={save_admin_editing}
            title="Change Quotas?"
            description="This will modify the base free quotas and restart the project."
          >
            <Button type="primary" disabled={!isModifiedValidInput()}>
              <Icon name="save" /> Save
            </Button>
          </Popconfirm>
        </>
      );
    } else {
      return (
        <Button onClick={start_admin_editing} type="text">
          <Icon name="pencil" /> Edit
        </Button>
      );
    }
  }

  function render_disk_used(disk: number | string) {
    if (!disk) {
      return;
    }
    return (
      <span>
        (<b>{disk} MB</b> used)
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
      units: "MB",
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
      units: "MB",
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
      units: "MB",
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
      units: "cores",
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
      units: misc.plural(total_quotas["cpu_shares"], "core"),
    },
    mintime: {
      // no display factor multiplication, because mintime is in seconds
      view: (
        <span>
          <b>{misc.seconds2hm(total_quotas["mintime"], true)}</b> of
          non-interactive use before project stops
        </span>
      ),
      units: "hours",
    },
    network: {
      view: (
        <b>
          {project_settings.get("network") || total_quotas["network"]
            ? "Yes"
            : "Blocked"}
        </b>
      ),
    },
    member_host: {
      view: (
        <b>
          {project_settings.get("member_host") || total_quotas["member_host"]
            ? "Yes"
            : "No"}
        </b>
      ),
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
        params_data={quota_params[name]}
        total_quotas={total_quotas}
        editing={editing}
        quotaState={quotaState}
        setQuotaState={setQuotaState}
      />
    ));
  }

  return (
    <Card
      title={
        <>
          <Icon name="user-plus" /> Admin Quota Editor
          <span style={{ margin: "0 15px", float: "right" }}>
            {render_admin_edit_buttons()}
          </span>
        </>
      }
      type="inner"
      extra={
        <Popover
          content={
            <div style={{ maxWidth: "400px" }}>
              Use your admin privileges to set the <b>base free quotas</b> for
              this project to anything you want. Licenses, user upgrades, etc.,
              are combined with these base free quotas.
            </div>
          }
          trigger={["click"]}
          placement="rightTop"
          title="Admin Quota Editor Information"
        >
          <Icon name="question-circle" />
        </Popover>
      }
    >
      {render_quota_rows()}
    </Card>
  );
}
