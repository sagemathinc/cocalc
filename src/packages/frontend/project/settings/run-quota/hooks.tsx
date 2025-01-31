/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// cSpell: ignore dval

import { List, Map } from "immutable";
import { fromPairs, isEqual } from "lodash";

import { ProjectStatus } from "@cocalc/comm/project-status/types";
import {
  TypedMap,
  useEffect,
  useMemo,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  KUCALC_COCALC_COM,
  KUCALC_DISABLED,
  KUCALC_ON_PREMISES,
} from "@cocalc/util/db-schema/site-defaults";
import { round1, seconds2hms, server_time } from "@cocalc/util/misc";
import { PROJECT_UPGRADES } from "@cocalc/util/schema";
import { GPU } from "@cocalc/util/types/site-licenses";
import {
  Upgrades,
  quota2upgrade_key,
  upgrade2quota_key,
} from "@cocalc/util/upgrades/quota";
import { IdleTimeoutPct, PercentBar, renderBoolean } from "./components";
import {
  CurrentUsage,
  DisplayQuota,
  MAX_UPGRADES,
  PARAMS,
  Usage,
  booleanValueStr,
  renderValueUnit,
} from "./misc";

export function useRunQuota(
  project_id: string,
  projectIsRunning: boolean | null,
): DisplayQuota {
  const [runQuota, setRunQuota] = useState<DisplayQuota>({});
  const project_map = useTypedRedux("projects", "project_map");
  const rq = project_map?.get(project_id)?.get("run_quota");
  // NOTE: even if project is NOT running, we do know the run quota
  // the problem is this information is not accurate, because only upon
  // startup the validity of a license is determined.
  // Still: if we don't set projectIsRunning, we use the stale information
  const next = useMemo(() => {
    if (rq == null || projectIsRunning === false) {
      return {};
    } else {
      return rq
        .map((val, key) => {
          if (key === "gpu") {
            const v = val as boolean | TypedMap<GPU>;
            if (typeof v === "boolean") {
              return v ? 1 : null;
            } else {
              return v?.get("num", 0);
            }
          } else if (typeof val !== "number") {
            return val;
          } else if (key == "idle_timeout") {
            return seconds2hms(val, false, false);
          } else {
            const up_key = quota2upgrade_key(key);
            // no display factor!
            const unit = PARAMS[up_key].display_unit;
            return renderValueUnit(val, unit);
          }
        })
        .toJS();
    }
  }, [rq, projectIsRunning]);
  if (!isEqual(next, runQuota)) {
    setRunQuota(next);
  }
  return runQuota;
}

export function useMaxUpgrades(): DisplayQuota {
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

function valPct(val, total): number {
  return Math.min(100, Math.round((100 * val) / total));
}

function pct(val, total, unit) {
  if (typeof val !== "number") return;
  const pct = valPct(val, total);
  const exceed = val > total ? ">" : "";
  const pctStr = `(${exceed}${round1(pct)}%)`;
  return {
    element: <PercentBar percent={pct} />,
    display: `${Math.round(val)}${unit} ${pctStr}`,
  };
}

export function useCurrentUsage({
  project_id,
  shortStr = false,
}): CurrentUsage {
  const project_status = useTypedRedux({ project_id }, "status");

  const project_map = useTypedRedux("projects", "project_map");
  const last_edited: Date | undefined = project_map
    ?.get(project_id)
    ?.get("last_edited");
  const runQuota:
    | Map<string, number | Map<string, number | string> | List<object>>
    | undefined = project_map?.get(project_id)?.get("run_quota");

  const [currentUsage, setCurrentUsage] = useState<CurrentUsage>({});

  function disk(usage) {
    if (runQuota == null) return;
    const disk_quota = runQuota.get("disk_quota"); // mb
    return pct(usage.disk_mb, disk_quota, "MB");
  }

  function memory(usage) {
    if (runQuota == null) return;
    // this also displays the "dedicated memory" amount, past of entire limit
    const mem_req = runQuota.get("memory_request"); // mb
    const mem_limit = runQuota.get("memory_limit"); // mb
    const { mem_rss } = usage;

    if (
      typeof mem_limit !== "number" ||
      typeof mem_req !== "number" ||
      typeof mem_rss !== "number"
    ) {
      return;
    }
    // we don't use the percent value calculated by the project in "usage"
    const mem_pct = valPct(mem_rss, mem_limit);
    // this draws a second bar, shorter, to indicate using "dedicated memory"
    const pct2 = valPct(Math.min(mem_req, mem_rss), mem_limit);
    return {
      element: <PercentBar percent={mem_pct} percent2={pct2} />,
      display: `${Math.round(mem_rss)}MB (${round1(mem_pct)}%)`,
    };
  }

  function cpuTime(usage) {
    const cpu = usage.cpu_tot;
    const pct = usage.cpu_pct;
    if (typeof cpu === "number" && typeof pct === "number") {
      const hms = seconds2hms(cpu, false, true);
      // In a flyout, hms overlaps with the quota value column next to it
      const txt = `${pct}%${shortStr ? "" : ` (${hms})`}`;
      return {
        element: <PercentBar percent={pct} format={() => txt} />,
        display: `${pct}% (in total ${hms} of CPU time)`,
      };
    }
    return;
  }

  function whenWillProjectStop() {
    if (last_edited == null) return;
    const always_running = runQuota?.get("always_running") ?? false;
    if (always_running) return; // not applicable
    const idle_timeout = runQuota?.get("idle_timeout"); // seconds
    const diff = Math.max(
      0,
      (server_time().valueOf() - last_edited.valueOf()) / 1000,
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
    return;
  }

  function getBoolean(key) {
    if (runQuota == null) return;
    const val = runQuota.get(key);
    return {
      display: booleanValueStr(val),
      element: renderBoolean(val, true), // due to how this is used, we can assume the project is running
    };
  }

  useEffect(() => {
    const usage: Partial<ProjectStatus["usage"]> =
      project_status?.get("usage")?.toJS() ?? {};

    const next: CurrentUsage = fromPairs(
      PROJECT_UPGRADES.field_order.map(
        (name: keyof Upgrades): [string, Usage] => {
          const key = upgrade2quota_key(name);
          switch (name) {
            case "mintime":
              return [key, whenWillProjectStop()];
            case "disk_quota":
              return [key, disk(usage)];
            case "memory_request":
              return [key, undefined];
            case "memory":
              return [key, memory(usage)];
            case "cores":
              return [key, cpuTime(usage)];
            case "cpu_shares": // dedicated cpu, nothing to show
              return [key, undefined];
            case "member_host":
            case "always_running":
            case "network":
            case "ext_rw":
              return [key, getBoolean(key)];
            case "patch":
              const p = runQuota?.get(key);
              const x = List.isList(p) ? p?.size : "N/A";
              return [key, { display: `${x}`, element: <>{x}</> }];
            case "gpu":
              const gpu = runQuota?.get(key);
              if (!gpu) return [key, { display: "N/A", element: <>N/A</> }];
              const num = Map.isMap(gpu) ? gpu.get("num", 1) : 1;
              return [
                key,
                { display: `${num}`, element: <>{JSON.stringify(num)}</> },
              ];
            default:
              return [key, { display: name, element: <>{name}</> }];
          }
        },
      ),
    );

    if (!isEqual(next, currentUsage)) setCurrentUsage(next);
  }, [
    runQuota,
    last_edited,
    project_status?.get("usage"), // don't use "usage" directly, because it is a plain JS object
  ]);

  return currentUsage;
}

// on non cocalc.com setups, we hider the member hosting entry
export function useDisplayedFields(): string[] {
  const kucalc = useTypedRedux("customize", "kucalc");

  return useMemo(() => {
    // we have to make a copy, because we might modify it below
    const fields: string[] = [...PROJECT_UPGRADES.field_order];

    // on kucalc on-prem, we add ext_rw, patch and gpu
    if (kucalc === KUCALC_ON_PREMISES) {
      fields.push(...["ext_rw", "patch", "gpu"]);
    }

    return fields.filter((key: keyof Upgrades) => {
      // don't show these, because we collect dedicated quotas in the overall limit
      if (key === "cpu_shares" || key === "memory_request") return false;

      switch (kucalc) {
        case KUCALC_COCALC_COM:
          return true; // show everything except the two above
        case KUCALC_ON_PREMISES:
          // there is no member hosting and no disk quota
          return "member_host" !== key && "disk_quota" !== key;
        case KUCALC_DISABLED:
          // there is not much to show
          return "mintime" === key || "always_running" === key;
      }
    });
  }, [kucalc]);
}
