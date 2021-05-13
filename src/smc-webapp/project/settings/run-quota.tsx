/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { useTypedRedux, useState } from "../../app-framework";
import { isEqual } from "lodash";

interface Props {
  project_id: string;
  project_state?: "opened" | "running" | "starting" | "stopping";
}

function useRunQuota(project_id: string) {
  const [run_quota, set_run_quota] = useState<object>({});
  const project_map = useTypedRedux("projects", "project_map");
  const rq = project_map?.getIn([project_id, "run_quota"]);
  if (!isEqual(rq, run_quota)) set_run_quota(rq);
  return run_quota;
}

export const RunQuota: React.FC<Props> = React.memo((props: Props) => {
  const { project_id, project_state: state } = props;
  const run_quota = useRunQuota(project_id);

  return (
    <div>
      <h3>Current Quotas</h3>
      <p>state: {state}</p>
      <pre>{JSON.stringify(run_quota, null, 2)}</pre>
    </div>
  );
});
