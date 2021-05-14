/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { isEqual } from "lodash";
import { useTypedRedux, useState } from "../../app-framework";
import { PROJECT_UPGRADES } from "smc-util/schema";
const PARAMS = PROJECT_UPGRADES.params;
import { Quota } from "smc-util/upgrades/quota";
type RunQuota = Partial<Quota>;

// this could be in a more general place, upgrades/quota.ts could use it
function upgrade2quota_key(key: keyof RunQuota) {
  switch (key) {
    case "memory_limit":
      return "memory";
    case "cpu_limit":
      return "cpres";
    case "cpu_request":
      return "cpu_shares";
  }
  return key;
}

interface Props {
  project_id: string;
  project_state?: "opened" | "running" | "starting" | "stopping";
}

function useRunQuota(project_id: string): RunQuota {
  const [run_quota, set_run_quota] = useState<RunQuota>({});
  const project_map = useTypedRedux("projects", "project_map");
  const rq = project_map?.getIn([project_id, "run_quota"]);
  if (rq != null) {
    const next = rq.toJS();
    if (!isEqual(next, run_quota)) set_run_quota(next);
  }
  return run_quota;
}

export const RunQuota: React.FC<Props> = React.memo((props: Props) => {
  const { project_id, project_state: state } = props;
  const run_quota = useRunQuota(project_id);

  function render_row(name: keyof RunQuota) {
    const quota_key = upgrade2quota_key(name);
    const display = PARAMS[name]?.display ?? name;
    return (
      <pre key={name}>
        {display}: {run_quota[quota_key] ?? "N/A"}
      </pre>
    );
  }

  function render_quotas(): JSX.Element[] {
    return PROJECT_UPGRADES.field_order.map(render_row);
  }

  return (
    <div>
      <h3>Current Quotas</h3>
      <p>state: {state}</p>
      {render_quotas()}
      <pre>{JSON.stringify(run_quota, null, 2)}</pre>
    </div>
  );
});
