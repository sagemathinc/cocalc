/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Map } from "immutable";

import { React, useRedux } from "@cocalc/frontend/app-framework";
import {
  BuildLogs,
  //  JobInfos
} from "./types";

export function useBuildLogs(name: string): BuildLogs {
  return useInfos<BuildLogs>(name, "build_logs");
}

// export function use_job_infos(name: string): JobInfos {
//   return use_infos<JobInfos>(name, "job_infos");
// }

function useInfos<T extends Map<string, any>>(
  name: string,
  aspect: "build_logs" | "job_infos",
) {
  const data_next: T = useRedux([name, aspect]) ?? Map<string, any>();
  const [data, set_data] = React.useState<T>(Map<string, any>() as any as T);

  // only update if any parsed logs or process infos differ
  for (const key of ["latex", "knitr", "pythontex", "sagetex"]) {
    // ATTN: previously, this code only checked for changes of the "parse" attribute.
    // But due to async execution, we update these objects dynamically and hence any change is a difference.
    // data_next.getIn([key, "parse"]) != data.getIn([key, "parse"])
    const isDiff = data_next.get(key) != data.get(key);
    if (isDiff) {
      set_data(data_next);
    }
  }

  return data;
}
