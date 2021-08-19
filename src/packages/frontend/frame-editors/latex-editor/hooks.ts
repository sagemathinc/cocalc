/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map } from "immutable";
import { React, useRedux } from "../../app-framework";
import { BuildLogs } from "./actions";

export function use_build_logs(name): BuildLogs {
  const build_logs_next: BuildLogs =
    useRedux([name, "build_logs"]) ?? Map<string, any>();
  const [build_logs, set_build_logs] = React.useState<BuildLogs>(
    Map<string, any>()
  );

  // only update if any parsed logs differ
  for (const key of ["latex", "knitr", "pythontex", "sagetex"]) {
    if (
      build_logs_next.getIn([key, "parse"]) != build_logs.getIn([key, "parse"])
    ) {
      set_build_logs(build_logs_next);
      break;
    }
  }

  return build_logs;
}

