/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSSProperties, useEffect, useState } from "react";
import { Alert, Button, Card, Tag } from "antd";
import { Icon, Loading } from "@cocalc/frontend/components";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { PROJECT_UPGRADES } from "@cocalc/util/schema";
import QuotaRow from "./quota-row";
import Information from "./information";
import {
  ProjectQuota,
  PROJECT_QUOTA_KEYS,
} from "@cocalc/util/db-schema/purchase-quotas";
import { useRedux, redux } from "@cocalc/frontend/app-framework";
import CostPerHour from "./cost-per-hour";

// These correspond to dedicated RAM and dedicated CPU, and we
// found them too difficult to cost out, so exclude them (only
// admins can set them).
const EXCLUDE = new Set([
  "memory_request",
  "cpu_shares",
  "disk_quota",
  "mintime",
]);

interface Props {
  project_id: string;
  style: CSSProperties;
}

export default function PayAsYouGoQuotaEditor({ project_id, style }: Props) {
  const project = useRedux(["projects", "project_map", project_id]);
  // Slightly subtle -- it's null if not loaded but {} or the thing if loaded, even
  // if there is no data yet in the database.
  const savedQuotaState: ProjectQuota | null =
    project == null
      ? null
      : project
          .getIn(["pay_as_you_go_quotas", webapp_client.account_id])
          ?.toJS() ?? {};
  const [editing, setEditing] = useState<boolean>(false);
  // one we are editing:
  const [quotaState, setQuotaState] = useState<ProjectQuota | null>(
    savedQuotaState
  );
  const [maxQuotas, setMaxQuotas] = useState<ProjectQuota | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        setMaxQuotas(
          await webapp_client.purchases_client.getPayAsYouGoMaxProjectQuotas()
        );
      } catch (err) {
        setError(`${err}`);
      }
    })();
  }, []);

  useEffect(() => {
    if (editing) {
      setQuotaState(savedQuotaState);
    }
  }, [editing]);

  function handleClose(): void {
    setEditing(false);
  }

  async function handleSave() {
    if (quotaState == null) return;
    try {
      setError("");
      await webapp_client.purchases_client.setPayAsYouGoProjectQuotas(
        project_id,
        quotaState
      );
    } catch (err) {
      setError(`${err}`);
    }
  }

  async function handleRun() {
    if (quotaState == null) return;
    await setQuotaState({
      ...quotaState,
      enabled: webapp_client.server_time().valueOf(),
    });
    await handleSave();
    const actions = redux.getActions("projects");
    await actions.restart_project(project_id);
    setEditing(false);
  }

  // Returns true if the admin inputs are valid, i.e.
  //    - at least one has changed
  //    - none are negative
  //    - none are empty
  function isModified(): boolean {
    for (const key of PROJECT_QUOTA_KEYS) {
      if ((savedQuotaState?.[key] ?? 0) != (quotaState?.[key] ?? 0)) {
        return true;
      }
    }
    return false;
  }

  if (editing && (quotaState == null || savedQuotaState == null)) {
    return <Loading />;
  }

  return (
    <Card
      style={style}
      title={
        <div style={{ marginTop: "5px" }}>
          <Icon name="compass" /> Pay As You Go
          {quotaState?.enabled ? (
            <Tag color="success" style={{ marginLeft: "30px" }}>
              Configured
            </Tag>
          ) : undefined}
        </div>
      }
      type="inner"
      extra={<Information />}
    >
      {quotaState != null && editing && (
        <div style={{ float: "right", marginLeft: "30px", width: "150px" }}>
          <CostPerHour quota={quotaState} />
          <div>You will be charged by the second.</div>
        </div>
      )}
      {!editing && (
        <Button onClick={() => setEditing(!editing)}>
          Temporarily increase your RAM, CPU, or disk...
        </Button>
      )}
      {editing && (
        <>
          {error && <Alert type="error" showIcon description={error} />}
          {/*<Alert
            type={!!quotaState?.enabled ? "success" : "info"}
            message={!!quotaState?.enabled ? "Enabled" : "Disabled"}
            description={
              <>
                <Checkbox
                  checked={!!quotaState?.enabled}
                  onChange={(e) =>
                    setQuotaState({
                      ...quotaState,
                      enabled: e.target.checked ? 1 : 0,
                    })
                  }
                >
                  Increase quotas to at least the values below when you start
                  this project.
                </Checkbox>
                <br />
                <Checkbox
                  style={{ marginTop: "15px" }}
                  checked={!!quotaState?.allow_any}
                  onChange={(e) =>
                    setQuotaState({
                      ...quotaState,
                      allow_any: e.target.checked ? 1 : 0,
                    })
                  }
                >
                  Upgrade for anybody who starts this project
                </Checkbox>}
              </>}/>
            */}
          {PROJECT_UPGRADES.field_order
            .filter((name) => !EXCLUDE.has(name))
            .map((name) => (
              <QuotaRow
                key={name}
                name={name}
                quotaState={quotaState}
                setQuotaState={setQuotaState}
                maxQuotas={maxQuotas}
              />
            ))}
          <div style={{ margin: "15px 0" }}>
            {editing && (
              <>
                <Button onClick={handleClose}>Close</Button>
                <Button
                  style={{ marginLeft: "8px" }}
                  disabled={!isModified()}
                  onClick={handleSave}
                >
                  <Icon name="save" /> Save
                </Button>
                <Button
                  style={{ marginLeft: "8px" }}
                  type="primary"
                  onClick={handleRun}
                >
                  <Icon name="save" /> Run Upgraded Project
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
