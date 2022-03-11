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
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { NoWrap, QuestionMarkText, Tip } from "@cocalc/frontend/components";
import { ProjectStatus } from "@cocalc/project/project-status/types";
import { plural, round2, seconds2hms } from "@cocalc/util/misc";
import { PROJECT_UPGRADES } from "@cocalc/util/schema";
import { COLORS } from "@cocalc/util/theme";
import {
  Quota,
  quota2upgrade_key,
  upgrade2quota_key,
} from "@cocalc/util/upgrades/quota";
import { Table, Typography } from "antd";
import { isEqual } from "lodash";
import { IdleTimeoutPct, PercentBar } from "./run-quota-components";
import { Project } from "./types";
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

function renderValueUnit(val, unit) {
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
        next[key] = renderValueUnit(val, unit);
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
  //console.log("mu", mu?.toJS());
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
          next[key] = renderValueUnit(dval, unit);
        }
      }
      if (!isEqual(next, max_upgrades)) {
        set_max_upgrades(next);
      }
    }
  }, [mu]);
  return max_upgrades;
}

type CurrentUsage = { [key in keyof RunQuota]: number | string | JSX.Element };

function useCurrentUsage({ project_id }): CurrentUsage {
  const project_status = useTypedRedux({ project_id }, "status");

  const project_map = useTypedRedux("projects", "project_map");
  const last_edited = project_map?.getIn([project_id, "last_edited"]);
  const runQuota = project_map?.getIn([project_id, "run_quota"]);

  const [currentUsage, setCurrentUsage] = useState<CurrentUsage>({});

  function pct(val, total) {
    if (typeof val !== "number") return "";
    const valPct = Math.min(100, Math.round((100 * val) / total));
    return <PercentBar percent={valPct} />;
  }

  useEffect(() => {
    const usage: Partial<ProjectStatus["usage"]> =
      project_status?.get("usage")?.toJS() ?? {};

    function disk() {
      const disk_quota = runQuota.get("disk_quota"); // mb
      return pct(usage.disk_mb, disk_quota);
    }

    function memory_shared() {
      return <PercentBar percent={usage.mem_pct} />;
    }

    function memory_dedicated() {
      const mem_req = runQuota.get("memory_request"); // mb
      if (typeof mem_req === "number" && typeof usage.mem_rss === "number") {
        return pct(Math.min(mem_req, usage.mem_rss), mem_req);
      } else {
        return "";
      }
    }

    function cpuTime() {
      const cpu = usage.cpu_tot;
      const pct = usage.cpu_pct;
      if (typeof cpu === "number") {
        const txt = seconds2hms(cpu, false, true);
        return <PercentBar percent={pct} format={() => txt} />;
      }
      return "";
    }

    function whenWillProjectStopp() {
      const always_running = runQuota?.get("always_running") ?? false;
      if (always_running) return ""; // not applicable
      const idle_timeout = runQuota?.get("idle_timeout"); // seconds
      if (typeof idle_timeout === "number") {
        return (
          <IdleTimeoutPct
            idle_timeout={idle_timeout}
            last_edited={last_edited}
          />
        );
      }
      return "";
    }

    const next: CurrentUsage = {};

    PROJECT_UPGRADES.field_order.map((name) => {
      const key = upgrade2quota_key(name);
      switch (name) {
        case "mintime":
          next[key] = whenWillProjectStopp();
          break;
        case "disk_quota":
          next[key] = disk();
          break;
        case "memory_request":
          next[key] = memory_dedicated();
          break;
        case "memory":
          next[key] = memory_shared();
          break;
        case "cores":
          next[key] = cpuTime();
          break;
        case "cpu_shares": // dedicated, nothing to show
          next[key] = "";
          break;
        default:
          next[key] = name;
      }
    });
    if (!isEqual(next, currentUsage)) setCurrentUsage(next);
  }, [
    runQuota,
    last_edited,
    project_status?.get("usage"), // don't use "usage" directly, because it is a plain JS object
  ]);

  return currentUsage;
}

export const RunQuota: React.FC<Props> = React.memo((props: Props) => {
  const { project_id, project_state /* project */ } = props;
  const run_quota = useRunQuota(project_id);
  const max_upgrades = useMaxUpgrades();
  //const projectStatus = project.get("status");
  const currentUsage = useCurrentUsage({ project_id });

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
      const usage =
        project_state === "running" ? currentUsage?.[key] ?? "" : "";
      return { key, display, quota, maximum, desc, usage };
    });
  }, [run_quota, currentUsage, max_upgrades]);

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
    if (project_state != "running") return;
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
    if (project_state != "running") {
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
