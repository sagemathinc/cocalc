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
import { A, NoWrap, QuestionMarkText, Tip } from "@cocalc/frontend/components";
import { ProjectStatus } from "@cocalc/project/project-status/types";
import {
  KUCALC_COCALC_COM,
  KUCALC_DISABLED,
  KUCALC_ON_PREMISES,
} from "@cocalc/util/db-schema/site-defaults";
import { plural, round2, seconds2hms, server_time } from "@cocalc/util/misc";
import { PROJECT_UPGRADES } from "@cocalc/util/schema";
import { COLORS } from "@cocalc/util/theme";
import { upgrades } from "@cocalc/util/upgrade-spec";
import {
  Quota,
  quota2upgrade_key,
  upgrade2quota_key,
  Upgrades,
} from "@cocalc/util/upgrades/quota";
import { Table, Typography } from "antd";
import { fromPairs, isEqual } from "lodash";
import { IdleTimeoutPct, PercentBar } from "./run-quota-components";
import { Project } from "./types";

const { Text } = Typography;
const MAX_UPGRADES = upgrades.max_per_project;

const PARAMS = PROJECT_UPGRADES.params;

type RunQuota = Partial<Quota>;
type Value = string | boolean;
type DisplayQuota = { [key in keyof Quota]: Value };

const SHOW_MAX: readonly string[] = [
  "disk_quota",
  "cpu_limit",
  "memory_limit",
] as const;

//const QUOTAS_BOOLEAN = ["member_host", "network", "always_running"] as const;

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
  const [maxUpgrades, setMaxUpgrades] = useState<DisplayQuota>({});
  const customMaxUpgrades = useTypedRedux("customize", "max_upgrades");
  useEffect(() => {
    const maxUpgradesData = { ...MAX_UPGRADES, ...customMaxUpgrades?.toJS() };
    const next: any = {};
    for (const [key, val] of Object.entries(maxUpgradesData)) {
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
    if (!isEqual(next, maxUpgrades)) setMaxUpgrades(next);
  }, [customMaxUpgrades]);
  return maxUpgrades;
}

type Usage = { display: string; element: JSX.Element | boolean } | null;
type CurrentUsage = { [key in keyof RunQuota]: Usage };

function useCurrentUsage({ project_id }): CurrentUsage {
  const project_status = useTypedRedux({ project_id }, "status");

  const project_map = useTypedRedux("projects", "project_map");
  const last_edited = project_map?.getIn([project_id, "last_edited"]);
  const runQuota = project_map?.getIn([project_id, "run_quota"]);

  const [currentUsage, setCurrentUsage] = useState<CurrentUsage>({});

  function valPct(val, total): number {
    return Math.min(100, Math.round((100 * val) / total));
  }

  function pct(val, total) {
    if (typeof val !== "number") return null;
    const pct = valPct(val, total);
    return {
      element: <PercentBar percent={pct} />,
      display: `${round2(pct)}%`,
    };
  }

  useEffect(() => {
    const usage: Partial<ProjectStatus["usage"]> =
      project_status?.get("usage")?.toJS() ?? {};

    function disk() {
      const disk_quota = runQuota.get("disk_quota"); // mb
      return pct(usage.disk_mb, disk_quota);
    }

    function memory() {
      // this also displays the "dedicated memory" amount, past of entire limite
      const mem_req = runQuota.get("memory_request"); // mb
      const mem_limit = runQuota.get("memory_limit"); // mb
      const { mem_pct, mem_rss } = usage;

      if (
        typeof mem_limit !== "number" ||
        typeof mem_req !== "number" ||
        typeof mem_rss !== "number" ||
        typeof mem_pct !== "number"
      )
        return null;
      const pct2 = valPct(Math.min(mem_req, mem_rss), mem_limit);
      return {
        element: <PercentBar percent={mem_pct} percent2={pct2} />,
        display: `${Math.round(mem_rss)}MB (${round2(mem_pct)}%)`,
      };
    }

    function cpuTime() {
      const cpu = usage.cpu_tot;
      const pct = usage.cpu_pct;
      if (typeof cpu === "number") {
        const txt = seconds2hms(cpu, false, true);
        return {
          element: <PercentBar percent={pct} format={() => txt} />,
          display: `${pct}% at a total of ${txt} during this session.`,
        };
      }
      return null;
    }

    function whenWillProjectStopp() {
      const always_running = runQuota?.get("always_running") ?? false;
      if (always_running) return null; // not applicable
      const idle_timeout = runQuota?.get("idle_timeout"); // seconds
      const diff = Math.max(
        0,
        (server_time().valueOf() - last_edited.valueOf()) / 1000
      );
      if (typeof idle_timeout === "number") {
        return {
          display: seconds2hms(diff, false, false),
          element: (
            <IdleTimeoutPct
              idle_timeout={idle_timeout}
              last_edited={last_edited}
            />
          ),
        };
      }
      return null;
    }

    function getNetwork(key) {
      return {
        display: runQuota.get(key) ? "true" : "false",
        element: runQuota.get(key),
      };
    }

    const next: CurrentUsage = fromPairs(
      PROJECT_UPGRADES.field_order.map(
        (name: keyof Upgrades): [string, Usage] => {
          const key = upgrade2quota_key(name);
          switch (name) {
            case "mintime":
              return [key, whenWillProjectStopp()];
            case "disk_quota":
              return [key, disk()];
            case "memory_request":
              return [key, null];
            case "memory":
              return [key, memory()];
            case "cores":
              return [key, cpuTime()];
            case "cpu_shares": // dedicated cpu, nothing to show
              return [key, null];
            case "member_host":
            case "always_running":
            case "network":
              return [key, getNetwork(key)];
            default:
              return [key, { display: name, element: <>{name}</> }];
          }
        }
      )
    );

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
  const runQuota = useRunQuota(project_id);
  const maxUpgrades = useMaxUpgrades();
  //const projectStatus = project.get("status");
  const currentUsage = useCurrentUsage({ project_id });
  const is_commercial = useTypedRedux("customize", "is_commercial");
  const kucalc = useTypedRedux("customize", "kucalc");

  // on non cocalc.com setups, we hider the member hosting entry
  const displayedFields = useMemo(
    () =>
      PROJECT_UPGRADES.field_order.filter((key: keyof Upgrades) => {
        // we collect dedicated quotas in the overall limit
        if (key === "cpu_shares" || key === "memory_request") return false;

        switch (kucalc) {
          case KUCALC_COCALC_COM:
            // show all rows on cocalc.com
            return true;
          case KUCALC_ON_PREMISES:
            // there is no member hosting
            return "member_host" !== key;
          case KUCALC_DISABLED:
            // TODO there is probably nothing regarding quotas to show
            return "member_host" !== key && "disk_quota" !== key;
        }
      }),
    [kucalc]
  );

  function quotaValue(key: keyof RunQuota): string | boolean | number {
    const val = runQuota[key];
    if (val == null) return "N/A";
    return val;
  }

  function displayedName(name: keyof Upgrades): string {
    if (name === "cores") return "CPU";
    if (name === "memory") return "Memory";
    return PARAMS[name]?.display ?? name;
  }

  function getMaxDedicated(name) {
    if (name === "memory") return maxUpgrades?.["memory_request"] ?? "N/A";
    if (name === "cores") return maxUpgrades?.["cpu_shares"] ?? "N/A";
  }

  function getQuotaDedicated({ key, name }) {
    if (name === "memory") return quotaValue("memory_request");
    if (name === "cores") return quotaValue("cpu_request");
  }

  const data = React.useMemo(() => {
    const ar = !!runQuota.always_running;
    return displayedFields.map((name: keyof Upgrades) => {
      const key = upgrade2quota_key(name);
      return {
        key,
        display: displayedName(name),
        desc: PARAMS[name]?.desc ?? "",
        quota: key == "idle_timeout" && ar ? "&infin;" : quotaValue(key),
        quotaDedicated: getQuotaDedicated({ key, name }),
        maximum: maxUpgrades?.[name] ?? "N/A",
        maxDedicated: getMaxDedicated(name),
        usage: project_state === "running" ? currentUsage?.[key] ?? "" : "",
      };
    });
  }, [runQuota, currentUsage, maxUpgrades]);

  function renderExtraMaximum(record) {
    if (SHOW_MAX.includes(record.key)) {
      return (
        <>
          The maximum possible quota is {record.maximum}
          {record.maxDedicated != null && (
            <>, of which {record.maxDedicated} could be dedicated</>
          )}
          .
        </>
      );
    }
  }

  function renderExtraExplanation(record) {
    const dedicatedVM = (
      <>
        If you need more RAM or CPU, consider upgrading to a{" "}
        <A href={"https://cocalc.com/pricing/dedicated"}>Dedicated VM</A>.
      </>
    );

    const dedicatedDisk = (
      <>
        It is possible to rent a{" "}
        <A href={"https://cocalc.com/pricing/dedicated"}>Dedicated Disk</A> for
        much more storage, or attach{" "}
        <A href="https://doc.cocalc.com/project-settings.html#cloud-storage-remote-file-systems">
          files hosted online
        </A>
        .
      </>
    );

    switch (record.key) {
      case "memory_request":
      case "memory_limit":
      case "cpu_limit":
      case "cpu_request":
        return is_commercial ? dedicatedVM : <></>;
      case "disk_quota":
        return is_commercial ? dedicatedDisk : <></>;
      case "idle_timeout":
      default:
        return <></>;
    }
  }

  function renderQuotaValue({ quota, quotaDedicated, usage }) {
    return (
      `Usage right now is ${usage.display}. ` +
      `The quota limit is ${quota}` +
      (quotaDedicated != null
        ? `, of which ${quotaDedicated} are dedicated to this project.`
        : ".")
    );
  }

  function renderExtra(record) {
    return (
      <>
        {record.desc} {renderQuotaValue(record)} {renderExtraMaximum(record)}{" "}
        {renderExtraExplanation(record)}
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
    if (project_state != "running") return;
    const usage: Usage = record.usage;
    if (usage == null) return;
    const { element } = usage;
    if (typeof element === "boolean") {
      return renderBoolean(element);
    } else {
      // wrapped in "Text", because that works better with the table layout
      return (
        <Text>
          <NoWrap>{element}</NoWrap>
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
            <QuestionMarkText tip="Name of the quota. Click on [+] to expand details.">
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
          dataIndex="key"
          render={(_, record) => renderUsage(record)}
          width={1}
          align={"right"}
        />
        <Table.Column<QuotaData>
          key="key"
          title={
            <QuestionMarkText tip="Usage limit imposed by the current quota. Adjust quotas or licenses to change this limit.">
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
