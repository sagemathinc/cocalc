/* Hook to get kernel usage info.

name = name of the redux store for the Jupyter notebook.
Not getting this from context, since we want to be able to
use this hook elsewhere.
*/

import { useRedux } from "@cocalc/frontend/app-framework";
import { useEffect, useMemo, useRef, useState } from "react";
import { ImmutableUsageInfo } from "@cocalc/project/usage-info/types";
import { Usage, BackendState } from "./types";
import { Map as immutableMap } from "immutable";
import { compute_usage } from "./usage";

export default function useKernelUsage(name: string): {
  usage: Usage;
  expected_cell_runtime: number;
} {
  const kernel_state: undefined | string = useRedux([name, "kernel_state"]);
  const kernel_usage: undefined | ImmutableUsageInfo = useRedux([
    name,
    "kernel_usage",
  ]);
  const backend_state: undefined | BackendState = useRedux([
    name,
    "backend_state",
  ]);
  // cell timing statistic
  // map from ids to cells
  const cells: undefined | immutableMap<string, any> = useRedux([
    name,
    "cells",
  ]);
  const cell_timings = useMemo(() => calc_cell_timings(cells), [cells]);
  const expected_cell_runtime = useMemo(
    () => calc_quantile(cell_timings),
    [cell_timings]
  );

  // state of UI, derived from usage, timing stats, etc.
  const [cpu_start, set_cpu_start] = useState<number | undefined>();
  const [cpu_runtime, set_cpu_runtime] = useState<number>(0);
  const timer1 = useRef<ReturnType<typeof setInterval> | undefined>();

  // reset cpu_start time when state changes
  useEffect(() => {
    if (kernel_state == "busy") {
      set_cpu_start(Date.now());
    } else if (cpu_start != null) {
      set_cpu_start(undefined);
    }
  }, [kernel_state]);

  // count seconds when kernel is busy & reset counter
  useEffect(() => {
    if (cpu_start != null) {
      timer1.current = setInterval(() => {
        if (kernel_state == "busy") {
          set_cpu_runtime((Date.now() - cpu_start) / 1000);
        } else {
          set_cpu_runtime(0);
        }
      }, 100);
    } else if (timer1.current != null) {
      set_cpu_runtime(0);
      clearInterval(timer1.current);
    }
    return () => {
      if (timer1.current != null) clearInterval(timer1.current);
    };
  }, [cpu_start, kernel_state]);

  // based on the info we know, we derive the "usage" object
  // the "status.tsx" Kernel component and other UI details will visualize it
  const usage: Usage = useMemo(
    () =>
      compute_usage({
        kernel_usage,
        backend_state,
        cpu_runtime,
        expected_cell_runtime,
      }),
    [kernel_usage, backend_state, cpu_runtime, expected_cell_runtime]
  );

  return { usage, expected_cell_runtime };
}

// derive sorted list of timings from all cells
function calc_cell_timings(cells?: immutableMap<string, any>): number[] {
  if (cells == null) return [];
  return cells
    .toList()
    .map((v) => {
      const start = v.get("start");
      const end = v.get("end");
      if (start != null && end != null) {
        return (end - start) / 1000;
      } else {
        return null;
      }
    })
    .filter((v) => v != null)
    .sort()
    .toJS();
}

// for the sorted list of cell timing, get the median or quantile.
// a quick approximation is good enough for us!
// we basically want to ignore long running cells, treat them as outliers.
// Using the 75% quantile is quick and easy, avoids working with inter quantile differences
// and proper outlier detection – like for boxplots, etc.
// we also cap the lower end with a reasonable minimum.
// Maybe another choice of quantile works better, something for later …
function calc_quantile(data: number[], min_val = 3, q = 0.75): number {
  if (data.length == 0) return min_val;
  const idx_last = data.length - 1;
  const idx_q = Math.floor(q * idx_last);
  const idx = Math.min(idx_last, idx_q);
  return Math.max(min_val, data[idx]);
}
