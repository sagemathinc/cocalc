/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */
import { useEffect, useState } from "@cocalc/frontend/app-framework";
import { useRunQuota } from "./run-quota/hooks";

// this reacts to changes of settings, user contributions, and licenses
export function useProjectHasInternetAccess(project_id: string) {
  const [state, set_state] = useState<boolean>(false);

  const runQuota = useRunQuota(project_id, null);

  useEffect(() => {
    const network = runQuota?.network;
    if (typeof network === "boolean") {
      set_state(network);
    } else {
      set_state(false);
    }
  }, [runQuota?.network]);

  return state;
}
