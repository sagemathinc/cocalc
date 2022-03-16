/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  useEffect,
  useMemo,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { ProjectStatus } from "@cocalc/project/project-status/types";
import {
  KUCALC_COCALC_COM,
  KUCALC_DISABLED,
  KUCALC_ON_PREMISES,
} from "@cocalc/util/db-schema/site-defaults";
import { round1, seconds2hms, server_time } from "@cocalc/util/misc";
import { PROJECT_UPGRADES } from "@cocalc/util/schema";
import {
  quota2upgrade_key,
  upgrade2quota_key,
  Upgrades,
} from "@cocalc/util/upgrades/quota";
import { fromPairs, isEqual } from "lodash";
import { IdleTimeoutPct, PercentBar } from "./components";
import {
  CurrentUsage,
  DisplayQuota,
  MAX_UPGRADES,
  PARAMS,
  renderValueUnit,
  Usage,
} from "./misc";

export function useRunQuota(project_id: string): DisplayQuota {
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

export function useCurrentUsage({ project_id }): CurrentUsage {
  const project_status = useTypedRedux({ project_id }, "status");

  const project_map = useTypedRedux("projects", "project_map");
  const last_edited = project_map?.getIn([project_id, "last_edited"]);
  const runQuota = project_map?.getIn([project_id, "run_quota"]);

  const [currentUsage, setCurrentUsage] = useState<CurrentUsage>({});

  function disk(usage) {
    const disk_quota = runQuota.get("disk_quota"); // mb
    return pct(usage.disk_mb, disk_quota, "MB");
  }

  function memory(usage) {
    // this also displays the "dedicated memory" amount, past of entire limite
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
      const txt = `${pct}% (${hms})`;
      return {
        element: <PercentBar percent={pct} format={() => txt} />,
        display: `${pct}% (in total ${hms} of CPU time)`,
      };
    }
    return;
  }

  function whenWillProjectStopp() {
    const always_running = runQuota?.get("always_running") ?? false;
    if (always_running) return; // not applicable
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
    return;
  }

  function getNetwork(key) {
    return {
      display: runQuota.get(key) ? "true" : "false",
      element: runQuota.get(key),
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
              return [key, whenWillProjectStopp()];
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

// on non cocalc.com setups, we hider the member hosting entry
export function useDisplayedFields() {
  const kucalc = useTypedRedux("customize", "kucalc");

  return useMemo(
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
            // there is not much to show
            return "mintime" === key || "always_running" === key;
        }
      }),
    [kucalc]
  );
}
