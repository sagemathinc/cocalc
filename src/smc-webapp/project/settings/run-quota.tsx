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
import * as misc from "smc-util/misc";
import { COLORS } from "smc-util/theme";
const PARAMS = PROJECT_UPGRADES.params;
import { Quota, Upgrades } from "smc-util/upgrades/quota";
type RunQuota = Partial<Quota>;
type Value = string | boolean;
type DisplayQuota = { [key in keyof Quota]: Value };

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

function quota2upgrade_key(key: string): keyof Upgrades {
  switch (key) {
    case "idle_timeout":
      return "mintime";
    case "memory_limit":
      return "memory";
    case "cpu_limit":
      return "cores";
    case "cpu_request":
      return "cpu_shares";
  }
  return key as keyof Upgrades;
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
  value: Value;
  maximum: string | undefined;
}

interface Props {
  project_id: string;
  project_state?: "opened" | "running" | "starting" | "stopping";
}

function render_val(val, unit) {
  val = misc.round2(val);
  return `${val} ${misc.plural(val, unit)}`;
}

function useRunQuota(project_id: string): DisplayQuota {
  const [run_quota, set_run_quota] = useState<DisplayQuota>({});
  const project_map = useTypedRedux("projects", "project_map");
  const rq = project_map?.getIn([project_id, "run_quota"]);
  if (rq != null) {
    const next = rq.toJS();
    for (const [key, val] of Object.entries(next)) {
      if (typeof val !== "number") continue;
      if (key == "idle_timeout") {
        next[key] = misc.seconds2hms(val, false, false);
      } else {
        const up_key = quota2upgrade_key(key);
        // no display factor!
        const unit = PARAMS[up_key].display_unit;
        next[key] = render_val(val, unit);
      }
    }
    if (!isEqual(next, run_quota)) {
      set_run_quota(next);
    }
  }
  return run_quota;
}

function useMaxUpgrades(): DisplayQuota {
  const [max_upgrades, set_max_upgrades] = useState<DisplayQuota>({});
  const mu = useTypedRedux("customize", "max_upgrades");
  if (mu != null) {
    const next = mu.toJS();
    for (const [key, val] of Object.entries(next)) {
      if (typeof val !== "number") continue;
      if (key == "idle_timeout") {
        next[key] = misc.seconds2hms(val, false, false);
      } else {
        const up_key = quota2upgrade_key(key);
        const dval = PARAMS[up_key].display_factor * val;
        const unit = PARAMS[up_key].display_unit;
        next[key] = render_val(dval, unit);
      }
    }
    if (!isEqual(next, max_upgrades)) {
      set_max_upgrades(next);
    }
  }
  return max_upgrades;
}

function useCurrentUsage(run_quota): DisplayQuota {
  const [cu, set_cu] = useState<DisplayQuota>({});
  const next: DisplayQuota = {};
  PROJECT_UPGRADES.field_order.map((name: string) => {
    const key = upgrade2quota_key(name);
    if (["member_host", "network", "always_running"].includes(name)) {
      next[name] = run_quota[name];
    } else {
      next[name] = name + "→" + key;
    }
  });
  if (!isEqual(next, cu)) {
    set_cu(next);
  }
  return cu;
}

export const RunQuota: React.FC<Props> = React.memo((props: Props) => {
  const { project_id, project_state: state } = props;
  const run_quota = useRunQuota(project_id);
  const max_upgrades = useMaxUpgrades();
  const cur_usage = useCurrentUsage(run_quota);

  function quota_limit(key: keyof RunQuota): string | boolean | number {
    const val = run_quota[key];
    if (val == null) return "N/A";
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
      const usage = cur_usage?.[name] ?? "";
      return { key, display, limit, maximum, desc, usage };
    });
  }, [run_quota, cur_usage, max_upgrades]);

  function render_value(record, type: "usage" | "limit") {
    if (state != "running") {
      const what = type === "usage" ? "current usage" : "effective quotas";
      return (
        <Tip
          tip={`The project is currently not running. Start the project to see the ${what}.`}
        >
          <PoweroffOutlined />
        </Tip>
      );
    }
    const val = record[type];
    if (record.key === "idle_timeout" && val === "&infin;") {
      return (
        <Q tip="If the project stops or the underlying VM goes into maintenance, the project will automatically restart.">
          &infin;
        </Q>
      );
    }

    if (typeof val === "boolean") {
      if (val) {
        return <CheckCircleTwoTone twoToneColor={COLORS.ANTD_GREEN} />;
      } else {
        return <CloseCircleTwoTone twoToneColor={COLORS.ANTD_RED} />;
      }
    }
    return <Text strong={type === "limit"}>{val}</Text>;
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
          render={(_, record) => render_value(record, "usage")}
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
          render={(_, record) => render_value(record, "limit")}
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
