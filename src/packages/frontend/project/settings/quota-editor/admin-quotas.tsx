/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Card, Popconfirm, Popover } from "antd";
import { isEqual } from "lodash";
import { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { alert_message } from "@cocalc/frontend/alerts";
import { CSS, useRedux } from "@cocalc/frontend/app-framework";
import { Icon, Loading } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import * as misc from "@cocalc/util/misc";
import { PROJECT_UPGRADES } from "@cocalc/util/schema";
import type { ProjectSettings } from "../types";
import QuotaRow from "./quota-row";
import type { QuotaParams } from "./types";

const QUOTA_PARAMS = PROJECT_UPGRADES.params;

interface Props {
  project_id: string;
  style?: CSS;
}

export default function AdminQuotas({ project_id, style }: Props) {
  const intl = useIntl();
  const projectLabel = intl.formatMessage(labels.project);
  const projectLabelLower = projectLabel.toLowerCase();

  const projectSettings: ProjectSettings | undefined = useRedux([
    "projects",
    "project_map",
    project_id,
    "settings",
  ]);
  const [editing, setEditing] = useState<boolean>(false);
  const [quotaState, setQuotaState] = useState<Partial<QuotaParams> | null>(
    null,
  );

  function setQuotaStateToProjectSettings() {
    if (projectSettings == null) return;
    const newState: any = {};
    for (const name in QUOTA_PARAMS) {
      const data = QUOTA_PARAMS[name];
      newState[name] = misc.round2(
        (projectSettings.get(name) ?? 0) * data.display_factor,
      );
    }
    if (!isEqual(quotaState, newState)) {
      setQuotaState(newState);
    }
  }

  useEffect(setQuotaStateToProjectSettings, [projectSettings]);

  if (editing && projectSettings == null) {
    return <Loading />;
  }

  async function handleSave(): Promise<void> {
    if (quotaState == null) return;
    try {
      await webapp_client.project_client.set_quotas({
        project_id: project_id,
        cores: quotaState.cores,
        cpu_shares: Math.round((quotaState.cpu_shares ?? 0) * 1024),
        disk_quota: quotaState.disk_quota,
        memory: quotaState.memory,
        memory_request: quotaState.memory_request,
        mintime: Math.floor((quotaState.mintime ?? 1800) * 3600),
        network: quotaState.network ? 1 : 0,
        member_host: quotaState.member_host ? 1 : 0,
        always_running: quotaState.always_running ? 1 : 0,
      });
      alert_message({
        type: "success",
        message: `${projectLabel} quotas updated.`,
      });
    } catch (err) {
      alert_message({ type: "error", message: err.message });
    } finally {
      setEditing(false);
    }
  }

  function handleCancel(): void {
    setQuotaStateToProjectSettings();
    setEditing(false);
  }

  // Returns true if the admin inputs are valid, i.e.
  //    - at least one has changed
  //    - none are negative
  //    - none are empty
  function isModified(): boolean {
    if (projectSettings == null || quotaState == null) {
      return false;
    }
    for (const name in QUOTA_PARAMS) {
      if (QUOTA_PARAMS[name] == null) {
        throw Error("bug -- invalid quota schema");
      }
      const data = QUOTA_PARAMS[name];
      const factor = data.display_factor ?? 1;
      const cur_val = (projectSettings.get(name) ?? 0) * factor;
      const new_val = misc.parse_number_input(quotaState[name]);
      if (new_val == null) {
        // not valid
        return false;
      }
      if (cur_val !== new_val) {
        return true;
      }
    }
    return false;
  }

  return (
    <Card
      style={style}
      title={
        <>
          <h4>
            <Icon name="user-plus" /> Admin Quota Editor
          </h4>
          <span style={{ margin: "0 15px", float: "right" }}>
            {editing && (
              <>
                <Button style={{ marginRight: "8px" }} onClick={handleCancel}>
                  {intl.formatMessage(labels.cancel)}
                </Button>
                <Popconfirm
                  disabled={!isModified()}
                  onConfirm={handleSave}
                  onCancel={handleCancel}
                  title="Change Quotas?"
                  description={`This will modify the base free quotas and restart the ${projectLabelLower}.`}
                >
                  <Button type="primary" disabled={!isModified()}>
                    <Icon name="save" /> Save
                  </Button>
                </Popconfirm>
              </>
            )}
            {!editing && (
              <Button onClick={() => setEditing(true)} type="text">
                <Icon name="pencil" /> Edit
              </Button>
            )}
          </span>
        </>
      }
      type="inner"
      extra={
        <Popover
          content={
            <div style={{ maxWidth: "400px" }}>
              Use your admin privileges to set the <b>base free quotas</b> for
              this {projectLabelLower} to anything you want. Licenses, user
              upgrades, etc., are combined with these base free quotas.
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
      {editing &&
        PROJECT_UPGRADES.field_order.map((name) => (
          <QuotaRow
            key={name}
            name={name as any}
            quotaState={quotaState}
            setQuotaState={setQuotaState}
          />
        ))}
    </Card>
  );
}
