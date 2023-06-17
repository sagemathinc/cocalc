/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSSProperties, useEffect, useState } from "react";
import { Alert, Button, Card, Checkbox, Popconfirm } from "antd";
import { alert_message } from "@cocalc/frontend/alerts";
import { Icon, Loading } from "@cocalc/frontend/components";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { PROJECT_UPGRADES } from "@cocalc/util/schema";
import QuotaRow from "./quota-row";
import { isEqual } from "lodash";
import Information from "./information";

interface PayAsYouGoQuotaParams {
  allow_any?: number;
  cores?: number;
  disk_quota?: number;
  memory?: number;
  mintime?: number;
  network?: number;
  member_host?: number;
  always_running?: number;
}

// These correspond to dedicated RAM and dedicated CPU, and we
// found them too difficult to cost out, so exclude them (only
// admins can set them).
const EXCLUDE = new Set(["memory_request", "cpu_shares"]);

interface Props {
  project_id: string;
  style: CSSProperties;
}

export default function PayAsYouGoQuotaEditor({ project_id, style }: Props) {
  const [editing, setEditing] = useState<boolean>(false);
  // one in the database:
  const [savedQuotaState, setSavedQuotaState] =
    useState<PayAsYouGoQuotaParams | null>(null);
  // one we are editing:
  const [quotaState, setQuotaState] = useState<PayAsYouGoQuotaParams | null>(
    null
  );
  const [error, setError] = useState<string>("");

  const getSavedQuotaState = async () => {
    try {
      const state = await webapp_client.purchases_client.getPayAsYouGoQuotas(
        project_id
      );
      setSavedQuotaState(state);
      setQuotaState(state);
    } catch (err) {
      setError(`${err}`);
    }
  };

  useEffect(() => {
    if (editing) {
      getSavedQuotaState();
    }
  }, [editing]);

  async function handleSave(): Promise<void> {
    if (quotaState == null) return;
    try {
      setError("");
      await webapp_client.purchases_client.setPayAsYouGoQuotas(project_id, {
        cores: quotaState.cores,
        disk_quota: quotaState.disk_quota,
        memory: quotaState.memory,
        mintime: Math.floor((quotaState.mintime ?? 0) * 3600),
        network: quotaState.network ? 1 : 0,
        member_host: quotaState.member_host ? 1 : 0,
        always_running: quotaState.always_running ? 1 : 0,
        allow_any: quotaState.allow_any ? 1 : 0,
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

  function handleCancel(): void {
    setEditing(false);
  }

  // Returns true if the admin inputs are valid, i.e.
  //    - at least one has changed
  //    - none are negative
  //    - none are empty
  function isModified(): boolean {
    return !isEqual(savedQuotaState, quotaState);
  }

  if (editing && (quotaState == null || savedQuotaState == null)) {
    return <Loading />;
  }

  return (
    <Card
      style={style}
      title={
        <>
          <div style={{ margin: "0 15px", float: "right" }}>
            {editing && (
              <>
                <Button style={{ marginRight: "8px" }} onClick={handleCancel}>
                  Cancel
                </Button>
                <Popconfirm
                  disabled={!isModified()}
                  onConfirm={handleSave}
                  onCancel={handleCancel}
                  title="Change Quotas?"
                  description="This will modify the base free quotas and restart the project."
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
          </div>
          <div style={{ marginTop: "5px" }}>
            <Icon name="compass" /> Quota Editor (pay as you go)
          </div>
        </>
      }
      type="inner"
      extra={<Information />}
    >
      {editing && (
        <>
          {error && <Alert type="error" showIcon description={error} />}
          <div>
            Quotas are increased to at least the following values upon project
            start, with charges incurred for usage beyond any licenses and
            upgrades.
          </div>
          {PROJECT_UPGRADES.field_order
            .filter((name) => !EXCLUDE.has(name))
            .map((name) => (
              <QuotaRow
                key={name}
                name={name}
                quotaState={quotaState}
                setQuotaState={setQuotaState}
              />
            ))}
          <Checkbox
            style={{ marginTop: "15px" }}
            checked={!quotaState?.allow_any}
            onChange={(e) =>
              setQuotaState({
                ...quotaState,
                allow_any: !e.target.checked ? 1 : 0,
              })
            }
          >
            Upgrade quotas only when I start this project
          </Checkbox>
        </>
      )}
    </Card>
  );
}
