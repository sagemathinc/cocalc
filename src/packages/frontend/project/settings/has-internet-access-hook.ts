/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */
import { useRedux, useEffect, useState } from "../../app-framework";
import { has_internet_access } from "../../upgrades/upgrade-utils";

// this reacts to changes of settings, user contributions, and licenses
export function useProjectHasInternetAccess(project_id: string) {
  const [state, set_state] = useState<boolean>(false);

  const users = useRedux(["projects", "project_map", project_id, "users"]);

  const settings = useRedux([
    "projects",
    "project_map",
    project_id,
    "settings",
  ]);

  const site_license = useRedux([
    "projects",
    "project_map",
    project_id,
    "site_license",
  ]);

  useEffect(() => {
    set_state(has_internet_access(project_id));
  }, [users, settings, site_license]);

  return state;
}
