/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { Table } from "antd";
import { CheckCircleTwoTone, CloseCircleTwoTone } from "@ant-design/icons";
import { isEqual } from "lodash";
import { useTypedRedux, useState } from "../../app-framework";
import { PROJECT_UPGRADES } from "smc-util/schema";
import { seconds2hms } from "smc-util/misc";
import { COLORS } from "smc-util/theme";
const PARAMS = PROJECT_UPGRADES.params;
import { Quota } from "smc-util/upgrades/quota";
type RunQuota = Partial<Quota>;

const SHOW_MAX: readonly string[] = [
  "disk_quota",
  "memory_request",
  "cpu_request",
  "cpu_limit",
  "memory_limit",
] as const;

// this could be in a more general place, upgrades/quota.ts could use it
function upgrade2quota_key(key: string): keyof RunQuota {
  switch (key) {
    case "mintime":
      return "idle_timeout";
    case "memory":
      return "memory_limit";
    case "cores":
      return "cpu_limit";
    case "cpu_shares":
      return "cpu_request";
  }
  return key as keyof RunQuota;
}

interface QuotaData {
  key: string;
  display: string;
  value: string | boolean;
  maximum: string | undefined;
}

interface Props {
  project_id: string;
  project_state?: "opened" | "running" | "starting" | "stopping";
}

function useRunQuota(project_id: string): RunQuota {
  const [run_quota, set_run_quota] = useState<RunQuota>({});
  const project_map = useTypedRedux("projects", "project_map");
  const rq = project_map?.getIn([project_id, "run_quota"]);

  if (rq != null) {
    const next = rq.toJS();
    if (!isEqual(next, run_quota)) set_run_quota(next);
  }
  return run_quota;
}

function useMaxUpgrades(): RunQuota {
  const [max_upgrades, set_max_upgrades] = useState<RunQuota>({});
  const mu = useTypedRedux("customize", "max_upgrades");
  if (mu != null) {
    const next = mu.toJS();
    if (!isEqual(next, max_upgrades)) set_max_upgrades(next);
  }
  return max_upgrades;
}

export const RunQuota: React.FC<Props> = React.memo((props: Props) => {
  const { project_id, project_state: state } = props;
  const run_quota = useRunQuota(project_id);
  const max_upgrades = useMaxUpgrades();

  function quota_value(key: keyof RunQuota): string | boolean | number {
    const val = run_quota[key];
    if (val == null) return "N/A";
    if (key == "idle_timeout" && typeof val === "number")
      return seconds2hms(val, true);
    return val;
  }

  const data = React.useMemo(() => {
    return PROJECT_UPGRADES.field_order.map((name: string) => {
      const key = upgrade2quota_key(name);
      const display = PARAMS[name]?.display ?? name;
      const value = quota_value(key);
      const maximum = max_upgrades?.[name] ?? "N/A";
      return { key, display, value, maximum };
    });
  }, [run_quota]);

  function render_quotas() {
    return (
      <Table<QuotaData> dataSource={data} size="small" pagination={false}>
        <Table.Column<QuotaData> key="key" title="Quota" dataIndex="display" />
        <Table.Column<QuotaData>
          key="key"
          title="Value"
          dataIndex="value"
          render={(_, record) => {
            const val = record.value;
            if (typeof val === "boolean") {
              if (val) {
                return <CheckCircleTwoTone twoToneColor={COLORS.ANTD_GREEN} />;
              } else {
                return <CloseCircleTwoTone twoToneColor={COLORS.ANTD_RED} />;
              }
            }
            return val;
          }}
        />
        <Table.Column<QuotaData>
          key="key"
          title="Maximum"
          dataIndex="maximum"
          render={(text, record) => {
            console.log("render max", text, record.key);
            if (SHOW_MAX.includes(record.key)) {
              return text;
            } else {
              return "";
            }
          }}
        />
      </Table>
    );
  }

  return (
    <div>
      <h3>Current Quotas</h3>
      <p>state: {state}</p>
      {render_quotas()}
    </div>
  );
});
