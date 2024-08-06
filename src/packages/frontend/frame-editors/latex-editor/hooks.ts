/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Map } from "immutable";
import { isEqual } from "lodash";

import { React, useRedux } from "@cocalc/frontend/app-framework";
import { BuildLogs, JobInfos } from "./types";

export function use_build_logs(name: string): BuildLogs {
  return use_infos<BuildLogs>(name, "build_logs");
}

export function use_job_infos(name: string): JobInfos {
  return use_infos<JobInfos>(name, "job_infos");
}

function use_infos<T extends Map<string, any>>(
  name: string,
  aspect: "build_logs" | "job_infos",
) {
  const data_next: T = useRedux([name, aspect]) ?? Map<string, any>();
  const [data, set_data] = React.useState<T>(Map<string, any>() as any as T);

  // only update if any parsed logs or process infos differ
  for (const key of ["latex", "knitr", "pythontex", "sagetex"]) {
    const isDiff =
      aspect === "build_logs"
        ? data_next.getIn([key, "parse"]) != data.getIn([key, "parse"])
        : !isEqual(data_next.get(key), data.get(key));
    if (isDiff) {
      set_data(data_next);
    }
  }

  return data;
}
