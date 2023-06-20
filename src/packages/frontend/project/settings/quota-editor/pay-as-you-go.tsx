/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSSProperties, useEffect, useMemo, useState } from "react";
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
import { getPricePerHour } from "@cocalc/util/purchases/project-quotas";

// These correspond to dedicated RAM and dedicated CPU, and we
// found them too difficult to cost out, so exclude them (only
// admins can set them).
const EXCLUDE = new Set(["memory_request", "cpu_shares"]);

interface Props {
  project_id: string;
  style: CSSProperties;
}

export default function PayAsYouGoQuotaEditor({ project_id, style }: Props) {
  const project = useRedux(["projects", "project_map", project_id]);
  // Slightly subtle -- it's null if not loaded but {} or the thing if loaded, even
  // if there is no data yet in the database.
  const runningWithUpgrade = useMemo(() => {
    return (
      project?.getIn(["state", "state"]) == "running" &&
      project?.getIn(["run_quota", "pay_as_you_go", "account_id"]) ==
        webapp_client.account_id
    );
  }, [project]);

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
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        setStatus("Loading quotas...");
        setMaxQuotas(
          await webapp_client.purchases_client.getPayAsYouGoMaxProjectQuotas()
        );
      } catch (err) {
        setError(`${err}`);
      } finally {
        setStatus("");
      }
    })();
  }, []);

  useEffect(() => {
    if (editing) {
      setQuotaState(savedQuotaState);
    }
  }, [editing]);

  function handleClose() {
    setEditing(false);
  }

  async function handleStop() {
    const quota = { ...quotaState, enabled: 0 };
    setQuotaState(quota);
    await webapp_client.purchases_client.setPayAsYouGoProjectQuotas(
      project_id,
      quota
    );
    const actions = redux.getActions("projects");
    await actions.stop_project(project_id);
  }

  async function handleSave() {
    if (quotaState == null) return;
    try {
      setStatus("Saving...");
      setError("");
      await webapp_client.purchases_client.setPayAsYouGoProjectQuotas(
        project_id,
        quotaState
      );
    } catch (err) {
      setError(`${err}`);
    } finally {
      setStatus("");
    }
  }

  async function handleRun() {
    if (quotaState == null) return;
    try {
      setError("");
      setStatus("Computing cost...");
      const prices =
        await webapp_client.purchases_client.getPayAsYouGoPricesProjectQuotas();
      const cost = getPricePerHour(quotaState, prices);
      setStatus("Saving quotas...");
      const quota = {
        ...quotaState,
        enabled: webapp_client.server_time().valueOf(),
        cost,
      };
      setQuotaState(quota);
      await webapp_client.purchases_client.setPayAsYouGoProjectQuotas(
        project_id,
        quota
      );
      const actions = redux.getActions("projects");
      setStatus("Stopping project...");
      await actions.stop_project(project_id);
      setStatus("Starting project...");
      await actions.start_project(project_id);
    } catch (err) {
      console.warn(err);
      setError(`${err}`);
    } finally {
      setEditing(false);
      setStatus("");
    }
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
          {runningWithUpgrade && (
            <>
              <Tag style={{ marginLeft: "30px" }} color="success">
                Active
              </Tag>
            </>
          )}
          {status ? (
            <Tag color="success" style={{ marginLeft: "30px" }}>
              {status}
            </Tag>
          ) : undefined}
        </div>
      }
      type="inner"
      extra={<Information />}
    >
      {quotaState != null && (editing || runningWithUpgrade) && (
        <div style={{ float: "right", marginLeft: "30px", width: "150px" }}>
          <CostPerHour quota={quotaState} />
          {editing && <div>You will be charged by the second.</div>}
        </div>
      )}
      {!editing && (
        <>
          {runningWithUpgrade ? (
            <div>
              This project is currently running with a pay as you go upgrades
              that you purchased. You are being charged by the second.
              <br />
              <Button
                size="large"
                onClick={handleStop}
                style={{ margin: "15px" }}
              >
                <Icon name="stop" /> Stop
              </Button>
            </div>
          ) : (
            <Button onClick={() => setEditing(!editing)}>
              Temporarily increase your RAM, CPU, or disk...
            </Button>
          )}
        </>
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
                  <Icon name="save" /> Start project with these upgrades
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
