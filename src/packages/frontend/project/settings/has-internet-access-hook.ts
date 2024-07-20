/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */
import {
  useEffect,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { KUCALC_DISABLED } from "@cocalc/util/db-schema/site-defaults";
import { useRunQuota } from "./run-quota/hooks";

// this reacts to changes of settings, user contributions, and licenses
export function useProjectHasInternetAccess(project_id: string) {
  const [state, set_state] = useState<boolean>(false);
  const customize_kucalc = useTypedRedux("customize", "kucalc");
  const noKubernetes = customize_kucalc === KUCALC_DISABLED;
  const runQuota = useRunQuota(project_id, null);

  useEffect(() => {
    // special case: we assume in any non-kubernetes environments, projects have internet access
    if (noKubernetes) {
      set_state(true);
      return;
    }
    // otherwise, we use the run quota information, which is set server-side after processing
    // the default quotas and any licenses/upgrades on top of it.
    const network = runQuota?.network;
    if (typeof network === "boolean") {
      set_state(network);
    } else {
      set_state(false);
    }
  }, [runQuota?.network]);

  return state;
}
