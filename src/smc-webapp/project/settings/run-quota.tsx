/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { Table, Typography } from "antd";
const { Text } = Typography;
import {
  CheckCircleTwoTone,
  CloseCircleTwoTone,
  PoweroffOutlined,
  QuestionCircleOutlined,
} from "@ant-design/icons";
import { isEqual } from "lodash";
import { Tip } from "../../r_misc";
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

const Q: React.FC<{ children; tip }> = ({ children, tip }) => {
  return (
    <Tip tip={tip}>
      {children} <QuestionCircleOutlined />
    </Tip>
  );
};

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

  function quota_limit(key: keyof RunQuota): string | boolean | number {
    const val = run_quota[key];
    if (val == null) return "N/A";
    if (key == "idle_timeout" && typeof val === "number")
      return seconds2hms(val, true);
    return val;
  }

  const data = React.useMemo(() => {
    const ar = !!run_quota.always_running;
    return PROJECT_UPGRADES.field_order.map((name: string) => {
      const key = upgrade2quota_key(name);
      const display = PARAMS[name]?.display ?? name;
      const desc = PARAMS[name]?.desc ?? "";
      const limit = key == "idle_timeout" && ar ? "&infin;" : quota_limit(key);
      const maximum = max_upgrades?.[name] ?? "N/A";
      const usage = "123";
      return { key, display, limit, maximum, desc, usage };
    });
  }, [run_quota]);

  function render_limit(_, record) {
    if (state != "running") {
      return (
        <Tip
          tip={
            "The project is currently not running. Start the project to see the effective quotas."
          }
        >
          <PoweroffOutlined />
        </Tip>
      );
    }
    if (record.key === "idle_timeout" && record.limit === "&infin;") {
      return (
        <Q tip="If the project stops or the underlying VM goes into maintenance, the project will automatically restart.">
          &infin;
        </Q>
      );
    }

    const val = record.limit;
    if (typeof val === "boolean") {
      if (val) {
        return <CheckCircleTwoTone twoToneColor={COLORS.ANTD_GREEN} />;
      } else {
        return <CloseCircleTwoTone twoToneColor={COLORS.ANTD_RED} />;
      }
    }
    return <Text strong>{val}</Text>;
  }

  function render_usage(_, record) {
    return record.usage;
  }

  function render_maximum(text, record) {
    if (SHOW_MAX.includes(record.key)) {
      return <Text type="secondary">{text}</Text>;
    } else {
      return "";
    }
  }

  function render_extra(record) {
    return (
      <div>
        <p>{record.desc}</p>
      </div>
    );
  }

  function render_quotas() {
    return (
      <Table<QuotaData>
        dataSource={data}
        size="small"
        pagination={false}
        expandedRowRender={render_extra}
      >
        <Table.Column<QuotaData>
          key="key"
          title={
            <Q tip="Name of the quota. Click on [+] to expand its details">
              Quota
            </Q>
          }
          dataIndex="display"
          width={6}
        />
        <Table.Column<QuotaData>
          key="key"
          title={<Q tip="Current usage of the project.">Usage</Q>}
          dataIndex="usage"
          render={render_usage}
          width={1}
          align={"right"}
        />
        <Table.Column<QuotaData>
          key="key"
          title={
            <Q tip="Usage limit imposed by the current quota. Adjust Quotas or Licenses to change this limit.">
              Limit
            </Q>
          }
          dataIndex="value"
          render={render_limit}
          width={1}
          align={"right"}
        />
        <Table.Column<QuotaData>
          key="key"
          title={
            <Q tip="Largest possible quota value. Projects can't be upgraded beyond that limit.">
              Max. Quota
            </Q>
          }
          dataIndex="maximum"
          render={render_maximum}
          width={1}
          align={"right"}
        />
      </Table>
    );
  }

  return <div>{render_quotas()}</div>;
});
