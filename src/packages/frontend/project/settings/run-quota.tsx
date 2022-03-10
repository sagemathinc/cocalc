/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  CheckCircleTwoTone,
  CloseCircleTwoTone,
  PoweroffOutlined,
} from "@ant-design/icons";
import {
  React,
  useEffect,
  useMemo,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { NoWrap, QuestionMarkText, Tip } from "@cocalc/frontend/components";
import { plural, round2, seconds2hms, server_time } from "@cocalc/util/misc";
import { PROJECT_UPGRADES } from "@cocalc/util/schema";
import { COLORS } from "@cocalc/util/theme";
import { Quota } from "@cocalc/util/upgrades/quota";
import { Upgrades } from "@cocalc/util/upgrades/types";
import { Table, Typography } from "antd";
import { isEqual } from "lodash";
import { useInterval } from "react-interval-hook";
import { Project } from "./types";
import { ProjectStatus } from "@cocalc/project/project-status/types";
const { Text } = Typography;

const PARAMS = PROJECT_UPGRADES.params;

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

const QUOTAS_BOOLEAN = ["member_host", "network", "always_running"] as const;

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

interface QuotaData {
  key: string;
  display: string;
  value: Value;
  maximum: string | undefined;
}

interface Props {
  project_id: string;
  project_state?: "opened" | "running" | "starting" | "stopping";
  project: Project;
}

function render_val(val, unit) {
  val = round2(val);
  return `${val} ${plural(val, unit)}`;
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
        next[key] = seconds2hms(val, false, false);
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
  console.log("mu", mu?.toJS());
  useEffect(() => {
    if (mu != null) {
      const next: any = {};
      for (const [key, val] of Object.entries(mu.toJS())) {
        console.log("useMaxUpgrades", key, val);
        if (typeof val !== "number") continue;
        if (key == "idle_timeout") {
          next[key] = seconds2hms(val, false, false);
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
  }, [mu]);
  return max_upgrades;
}

const IdleTimeoutPct: React.FC<{ idle_timeout: number; last_edited: Date }> = ({
  idle_timeout,
  last_edited,
}) => {
  const [pct, setPct] = useState<string>(calc());

  function calc() {
    const used = Math.max(0, server_time().valueOf() - last_edited.valueOf());
    const pct = Math.ceil(100 * Math.min(1, used / (1000 * idle_timeout)));
    return `${pct}%`;
  }

  useInterval(() => {
    setPct(calc());
  }, 1000 * 30);

  return <>{pct}</>;
};

type CurrentUsage = { [key in keyof RunQuota]: number | string | JSX.Element };

function useCurrentUsage({
  project_id,
  run_quota,
  projectStatus,
}): CurrentUsage {
  const project_status = useTypedRedux({ project_id }, "status");
  const usage: Partial<ProjectStatus["usage"]> = useMemo(() => {
    return project_status?.get("usage")?.toJS() ?? {};
  }, [project_status]);

  const project_map = useTypedRedux("projects", "project_map");
  const last_edited = project_map?.getIn([project_id, "last_edited"]);
  const runQuota = project_map?.getIn([project_id, "run_quota"]);

  const [cu, set_cu] = useState<CurrentUsage>({});

  function disk() {
    const disk_quota = runQuota.get("disk_quota"); // mb
    if (typeof usage.disk_mb === "number") {
      const pct = Math.round((100 * Math.min(1, usage.disk_mb)) / disk_quota);
      return `${pct}%`;
    }
    return "N/A";
  }

  function memory() {
    if (typeof usage.mem_pct === "number") {
      return 
    }
    return "N/A";
  }

  function cpuTime() {
    const cpu = projectStatus.getIn(["cpu", "usage"]);
    if (typeof cpu === "number") {
      return seconds2hms(cpu, true);
    }
    return "N/A";
  }

  function whenStopps() {
    const idle_timeout = runQuota?.get("idle_timeout"); // seconds
    if (typeof idle_timeout === "number") {
      return (
        <IdleTimeoutPct idle_timeout={idle_timeout} last_edited={last_edited} />
      );
    }
    return "N/A";
  }

  useEffect(() => {
    const next: CurrentUsage = {};

    PROJECT_UPGRADES.field_order.map((name: string) => {
      const key = upgrade2quota_key(name);
      switch (name) {
        case "member_host":
        case "network":
        case "always_running":
          next[key] = run_quota[name];
          break;
        case "mintime":
          next[key] = whenStopps();
          break;
        case "disk_quota":
          next[key] = disk();
          break;
        case "memory":
          next[key] = memory();
          break;
        case "cores":
          next[key] = cpuTime();
          break;
        default:
          next[key] = "";
      }
    });
    if (!isEqual(next, cu)) set_cu(next);
  }, [runQuota, last_edited, projectStatus]);
  return cu;
}

export const RunQuota: React.FC<Props> = React.memo((props: Props) => {
  const { project_id, project_state: state, project } = props;
  const run_quota = useRunQuota(project_id);
  const max_upgrades = useMaxUpgrades();
  const projectStatus = project.get("status");
  const cur_usage = useCurrentUsage({ project_id, run_quota, projectStatus });

  function quotaValue(key: keyof RunQuota): string | boolean | number {
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
      const quota = key == "idle_timeout" && ar ? "&infin;" : quotaValue(key);
      const maximum = max_upgrades?.[name] ?? "N/A";
      const usage = cur_usage?.[key] ?? "";
      return { key, display, quota, maximum, desc, usage };
    });
  }, [run_quota, cur_usage, max_upgrades]);

  function renderExtraMaximum(record) {
    if (SHOW_MAX.includes(record.key)) {
      return <>The maximum possible quota is {record.maximum}.</>;
    }
  }

  function renderExtraDedicated(record) {
    return <>dedicated {record.key}</>;
  }

  function renderExtra(record) {
    return (
      <>
        {record.desc}. {renderExtraMaximum(record)}{" "}
        {renderExtraDedicated(record)}
      </>
    );
  }

  function renderBoolean(val) {
    if (val) {
      return <CheckCircleTwoTone twoToneColor={COLORS.ANTD_GREEN} />;
    } else {
      return <CloseCircleTwoTone twoToneColor={COLORS.ANTD_RED} />;
    }
  }

  function renderUsage(record) {
    if (QUOTAS_BOOLEAN.includes(record.key)) return;
    if (state != "running") return;
    const val = record["usage"];
    if (typeof val === "boolean") {
      return renderBoolean(val);
    } else if (typeof val === "number") {
      if (record.key === "idle_timeout") {
        return val;
      }
    } else {
      return (
        <Text>
          <NoWrap>{val}</NoWrap>
        </Text>
      );
    }
  }

  function renderQuotaLimit(record) {
    if (state != "running") {
      return (
        <Tip
          tip={`The project is currently not running. Start the project to see the effective quotas.`}
        >
          <PoweroffOutlined style={{ color: COLORS.GRAY_L }} />
        </Tip>
      );
    }

    const val = record["quota"];

    if (record.key === "idle_timeout" && val === "&infin;") {
      return (
        <QuestionMarkText tip="If the project stops or the underlying VM goes into maintenance, the project will automatically restart.">
          &infin;
        </QuestionMarkText>
      );
    }

    if (typeof val === "boolean") {
      return renderBoolean(val);
    } else if (typeof val === "number") {
      if (record.key === "idle_timeout") {
        return val;
      }
    } else {
      return (
        <Text strong={true}>
          <NoWrap>{val}</NoWrap>
        </Text>
      );
    }
  }

  function renderQuotas() {
    return (
      <Table<QuotaData>
        dataSource={data}
        size="small"
        pagination={false}
        rowClassName={() => "cursor-pointer"}
        expandable={{
          expandedRowRender: (record) => renderExtra(record),
          expandRowByClick: true,
        }}
      >
        <Table.Column<QuotaData>
          key="key"
          title={
            <QuestionMarkText tip="Name of the quota. Click on [+] to expand its details">
              Quota
            </QuestionMarkText>
          }
          render={(text) => <NoWrap>{text}</NoWrap>}
          dataIndex="display"
          width={6}
        />
        <Table.Column<QuotaData>
          key="key"
          title={
            <QuestionMarkText tip="Current usage of the project.">
              Usage
            </QuestionMarkText>
          }
          dataIndex="usage"
          render={(_, record) => renderUsage(record)}
          width={1}
          align={"right"}
        />
        <Table.Column<QuotaData>
          key="key"
          title={
            <QuestionMarkText tip="Usage limit imposed by the current quota. Adjust Quotas or Licenses to change this limit.">
              Limit
            </QuestionMarkText>
          }
          dataIndex="limit"
          render={(_, record) => renderQuotaLimit(record)}
          width={1}
          align={"right"}
        />
      </Table>
    );
  }

  return <div>{renderQuotas()}</div>;
});
