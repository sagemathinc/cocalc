/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Button, Card, Popconfirm, Tag } from "antd";
import { CSSProperties, useEffect, useMemo, useState } from "react";

import { useRedux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon, Loading, Paragraph } from "@cocalc/frontend/components";
import { PAYASYOUGO_ICON } from "@cocalc/frontend/components/icon";
import { load_target } from "@cocalc/frontend/history";
import { DynamicallyUpdatingRate } from "@cocalc/frontend/purchases/pay-as-you-go/dynamically-updating-cost";
import startProject from "@cocalc/frontend/purchases/pay-as-you-go/start-project";
import stopProject from "@cocalc/frontend/purchases/pay-as-you-go/stop-project";
import track0 from "@cocalc/frontend/user-tracking";
import { User } from "@cocalc/frontend/users";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import type { ProjectQuota } from "@cocalc/util/db-schema/purchase-quotas";
import { copy_without, unreachable } from "@cocalc/util/misc";
import { PROJECT_UPGRADES } from "@cocalc/util/schema";
import CostPerHour from "./cost-per-hour";
import Information from "./information";
import QuotaRow from "./quota-row";
import { isEmpty } from "lodash";
import { COLORS } from "@cocalc/util/theme";
import { useProjectContext } from "../../context";
import ComputeServersAlert from "@cocalc/frontend/compute/compute-servers-alert";

function track(obj) {
  track0("pay-as-you-go-project-upgrade", obj);
}

// These correspond to dedicated RAM and dedicated CPU, and we
// found them too difficult to cost out, so exclude them (only
// admins can set them).
const EXCLUDE = new Set(["memory_request", "cpu_shares"]);

type Preset = "budget" | "small" | "medium" | "large" | "max";

interface Props {
  project_id: string;
  style: CSSProperties;
}

export default function PayAsYouGoQuotaEditor({ project_id, style }: Props) {
  const project = useRedux(["projects", "project_map", project_id]);
  const { isRunning: projectIsRunning } = useProjectContext();

  // Slightly subtle -- it's null if not loaded but {} or the thing if loaded, even
  // if there is no data yet in the database.
  const savedQuotaState: ProjectQuota | null =
    project == null
      ? null
      : project
          .getIn(["pay_as_you_go_quotas", webapp_client.account_id])
          ?.toJS() ?? getPresetValue("small");
  const [editing, setEditing] = useState<boolean>(false);
  // one we are editing:
  const [quotaState, setQuotaState] = useState<ProjectQuota | null>(
    savedQuotaState,
  );

  const runningWithUpgrade = useMemo(() => {
    return (
      project?.getIn(["state", "state"]) == "running" &&
      project?.getIn(["run_quota", "pay_as_you_go", "account_id"]) ==
        webapp_client.account_id
    );
  }, [project]);

  const [maxQuotas, setMaxQuotas] = useState<ProjectQuota | null>(null);
  const [error, setError] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        setStatus("Loading quotas...");
        setMaxQuotas(
          await webapp_client.purchases_client.getPayAsYouGoMaxProjectQuotas(),
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
      if (isEmpty(savedQuotaState)) {
        setQuotaState(getPresetValue("small") ?? {});
      } else {
        setQuotaState(savedQuotaState);
      }
    }
  }, [editing]);

  async function handleClose() {
    track({ action: "close", project_id });
    setEditing(false);
    if (quotaState == null) return;
    try {
      setStatus("Saving...");
      setError("");
      await webapp_client.purchases_client.setPayAsYouGoProjectQuotas(
        project_id,
        quotaState,
      );
    } catch (err) {
      setError(`${err}`);
    } finally {
      setStatus("");
    }
  }

  async function handleStop(disable?: boolean) {
    if (quotaState == null) return;
    try {
      setError("");
      await stopProject({
        quota: quotaState,
        project_id,
        setStatus,
        disable,
      });
    } catch (err) {
      console.warn(err);
      setError(`${err}`);
    } finally {
      setStatus("");
    }
  }

  function getPresetValue(preset: Preset) {
    switch (preset) {
      case "max":
        return maxQuotas;
      case "budget":
        return {
          member_host: 0,
          network: 1,
          cores: 1,
          memory: 1000,
          disk_quota: 3000,
          mintime: 0.5,
        };
      case "small":
        return {
          member_host: 1,
          network: 1,
          cores: 1,
          memory: 2000,
          disk_quota: 3000,
          mintime: 0.5,
        };
      case "medium":
        return {
          member_host: 1,
          network: 1,
          cores: 2,
          memory: 6000,
          disk_quota: 4000,
          mintime: 2,
        };
      case "large":
        return {
          member_host: 1,
          network: 1,
          always_running: 1,
          cores: 3,
          memory: 10000,
          disk_quota: 6000,
        };

      default:
        unreachable(preset);
    }
  }

  function handlePreset(preset: Preset) {
    track({ action: "preset", preset, project_id });
    if (maxQuotas == null) return;
    const val = getPresetValue(preset);
    if (val == null) return;
    const x = copy_without(val, Array.from(EXCLUDE));
    for (const key in x) {
      if (maxQuotas[key] != null && maxQuotas[key] < x[key]) {
        x[key] = maxQuotas[key];
      }
    }
    setQuotaState(x);
  }

  async function handleRun() {
    if (quotaState == null) return;
    try {
      setError("");
      await startProject({ quota: quotaState, project_id, setStatus });
    } catch (err) {
      console.warn(err);
      setError(`${err}`);
    } finally {
      setStatus("");
    }
  }

  //   // Returns true if the admin inputs are valid, i.e.
  //   //    - at least one has changed
  //   //    - none are negative
  //   //    - none are empty
  //   function isModified(): boolean {
  //     for (const key of PROJECT_QUOTA_KEYS) {
  //       if ((savedQuotaState?.[key] ?? 0) != (quotaState?.[key] ?? 0)) {
  //         return true;
  //       }
  //     }
  //     return false;
  //   }

  if (editing && (quotaState == null || savedQuotaState == null)) {
    return <Loading />;
  }

  function renderRunningWithUpgrade() {
    if (!runningWithUpgrade) return;

    return (
      <div>
        This project is running with the pay as you go quota upgrades that{" "}
        <a
          onClick={() => {
            load_target("settings/purchases");
          }}
        >
          you purchased
        </a>
        . You will be charged <b>by the second</b> until the project is stopped.
        <div>
          <Popconfirm
            title={"Stop project?"}
            description={
              <div style={{ maxWidth: "400px" }}>
                When you next start the project, it will be upgraded unless you
                explicitly disable upgrades. (If a collaborator starts the
                project you will not be charged.)
              </div>
            }
            onConfirm={() => handleStop(false)}
          >
            <Button style={{ marginRight: "8px", marginTop: "15px" }}>
              <Icon name="stop" /> Stop Project
            </Button>
          </Popconfirm>
          <Popconfirm
            title={"Stop project and disable upgrades?"}
            description={
              <div style={{ maxWidth: "400px" }}>
                Project will stop and will not automatically be upgraded until
                you explicitly enable upgrades again here.
              </div>
            }
            onConfirm={() => handleStop(true)}
          >
            <Button style={{ marginRight: "8px", marginTop: "15px" }}>
              <Icon name="stop" /> Disable Upgrades...
            </Button>
          </Popconfirm>
          <Button onClick={() => setEditing(!editing)}>
            {editing ? "Hide" : "Show"} Quotas
          </Button>
        </div>
      </div>
    );
  }

  function renderUpgradeOrClear() {
    if (editing || runningWithUpgrade) return;

    const disabled = quotaState == null || Object.keys(quotaState).length == 0;

    return (
      <>
        <Paragraph>
          <Button
            size="large"
            onClick={() => {
              if (!editing) {
                track({ action: "open", project_id });
              }
              setEditing(!editing);
            }}
          >
            <Icon name="credit-card" /> Upgrade this Project...
          </Button>
          <ComputeServersAlert project_id={project_id} />
          {!projectIsRunning ? (
            <Button
              disabled={disabled}
              style={{
                marginLeft: "8px",
                backgroundColor: disabled ? undefined : COLORS.BG_WARNING,
              }}
              onClick={async () => {
                setQuotaState(null);
                await webapp_client.purchases_client.setPayAsYouGoProjectQuotas(
                  project_id,
                  {},
                );
              }}
            >
              <Icon name="credit-card" /> Clear Upgrades
            </Button>
          ) : undefined}
        </Paragraph>
        {!disabled && !projectIsRunning ? (
          <Paragraph type="secondary">
            <strong>Note:</strong> When this project starts, it will run with
            the currently configured Pay-as-you-go upgrade schema.
          </Paragraph>
        ) : undefined}
      </>
    );
  }

  function renderStartWithUpgrades() {
    if (!editing || runningWithUpgrade) return;

    return (
      <div style={{ marginTop: "15px" }}>
        <Button onClick={handleClose}>Close</Button>
        <Popconfirm
          title="Run project with exactly these quotas?"
          description={
            <div style={{ width: "400px" }}>
              The project will restart with your quotas applied.{" "}
              <b>
                You will be charged by the second for usage during this session.
              </b>
              <br /> <br />
              NOTES: Only these pay-as-you-go quotas will be applied. Only one
              person can upgrade a project at once, though all collaborators
              get to use the upgraded version of the project.
            </div>
          }
          onConfirm={handleRun}
          okText="Upgrade"
          cancelText="No"
        >
          <Button style={{ marginLeft: "8px" }} type="primary">
            <Icon name="save" /> Start With Upgrades...
          </Button>
        </Popconfirm>
      </div>
    );
  }

  function renderEditing() {
    if (!editing) return;

    return (
      <>
        {error && (
          <Alert
            style={{ margin: "15px" }}
            type="error"
            showIcon
            description={error}
            closable
            onClose={() => setError("")}
          />
        )}
        <div style={{ margin: "15px 0" }}>
          <Tag
            icon={<Icon name="battery-empty" />}
            style={{ cursor: "pointer" }}
            color="blue"
            onClick={() => handlePreset("budget")}
          >
            Budget
          </Tag>
          <Tag
            icon={<Icon name="battery-quarter" />}
            style={{ cursor: "pointer" }}
            color="blue"
            onClick={() => handlePreset("small")}
          >
            Small
          </Tag>
          <Tag
            icon={<Icon name="battery-half" />}
            style={{ cursor: "pointer" }}
            color="blue"
            onClick={() => handlePreset("medium")}
          >
            Medium
          </Tag>
          <Tag
            icon={<Icon name="battery-three-quarters" />}
            style={{ cursor: "pointer" }}
            color="blue"
            onClick={() => handlePreset("large")}
          >
            Large
          </Tag>
          <Tag
            icon={<Icon name="battery-full" />}
            style={{ cursor: "pointer" }}
            color="blue"
            onClick={() => handlePreset("max")}
          >
            Max
          </Tag>
          <br />
          <hr />
        </div>
        {PROJECT_UPGRADES.field_order
          .filter((name) => !EXCLUDE.has(name))
          .map((name) => (
            <QuotaRow
              key={name}
              name={name as any}
              quotaState={quotaState}
              setQuotaState={setQuotaState}
              maxQuotas={maxQuotas}
              disabled={runningWithUpgrade}
            />
          ))}
      </>
    );
  }

  function renderTitle() {
    return (
      <h4>
        <Icon name={PAYASYOUGO_ICON} /> Pay As You Go
        <RunningStatus project={project} />
        {runningWithUpgrade && (
          <>
            {" "}
            (Amount:{" "}
            <DynamicallyUpdatingRate
              alwaysNonnegative
              costPerHour={
                project?.getIn([
                  "run_quota",
                  "pay_as_you_go",
                  "quota",
                  "cost",
                ]) ?? 0
              }
              start={project?.getIn([
                "run_quota",
                "pay_as_you_go",
                "quota",
                "start",
              ])}
            />
            )
          </>
        )}
        {status ? (
          <Tag color="success" style={{ marginLeft: "30px" }}>
            {status}
          </Tag>
        ) : undefined}
      </h4>
    );
  }

  return (
    <Card
      style={style}
      title={renderTitle()}
      type="inner"
      extra={<Information />}
    >
      {quotaState != null && (editing || runningWithUpgrade) && (
        <div style={{ float: "right", marginLeft: "30px", width: "150px" }}>
          <CostPerHour quota={quotaState} />
        </div>
      )}
      {renderRunningWithUpgrade()}
      {renderUpgradeOrClear()}
      {renderStartWithUpgrades()}
      {renderEditing()}
    </Card>
  );
}

function RunningStatus({ project }) {
  const user_map = useTypedRedux("users", "user_map");
  if (project?.getIn(["state", "state"]) != "running") {
    return (
      <Tag color="red" style={{ marginLeft: "30px" }}>
        Inactive
      </Tag>
    );
  }
  const pay_as_you_go_account_id = project.getIn([
    "run_quota",
    "pay_as_you_go",
    "account_id",
  ]);
  if (!pay_as_you_go_account_id) {
    return (
      <Tag color="red" style={{ marginLeft: "30px" }}>
        Inactive
      </Tag>
    );
  }
  return (
    <span>
      <Tag style={{ marginLeft: "30px" }} color="success">
        Active
      </Tag>
      paid for by{" "}
      {pay_as_you_go_account_id == webapp_client.account_id ? (
        "you"
      ) : (
        <User account_id={pay_as_you_go_account_id} user_map={user_map} />
      )}
    </span>
  );
}

// This is used specifically for the fixed tabs action
// bar, hence the weird marginInlineEnd below to get
// it to center properly.
// Also, when we also have pay as you go remote GPU
// Jupyter kernels, then this will be the sum of them
// and the pay as you go project...
export function PayAsYouGoCost({ project_id }) {
  const project = useRedux(["projects", "project_map", project_id]);
  if (!project) return null;
  const state = project.getIn(["state", "state"]);
  if (state != "running" && state != "starting") return null;
  const PAYG = project.getIn(["run_quota", "pay_as_you_go"]);
  if (PAYG?.get("account_id") != webapp_client.account_id) {
    // only show this when YOU are paying.
    return null;
  }
  const quota = PAYG?.get("quota")?.toJS();
  if (!quota || !quota.cost || !quota.start) {
    return null;
  }
  return (
    <div style={{ textAlign: "center" }}>
      <Tag color="green" style={{ marginInlineEnd: 0 }}>
        <DynamicallyUpdatingRate
          alwaysNonnegative
          costPerHour={quota.cost}
          start={quota.start}
        />
      </Tag>
    </div>
  );
}
