/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  redux,
  useMemo,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";

export function useProjectRunning(project_id: string) {
  const [isRunning, setIsRunning] = useState<boolean>(false);

  const projState = useTypedRedux("projects", "project_map")?.getIn([
    project_id,
    "state",
    "state",
  ]);

  useMemo(() => {
    const myGroup = redux.getStore("projects").get_my_group(project_id);
    // regardless of consequences, for admins a project is always running
    // see https://github.com/sagemathinc/cocalc/issues/3863
    if (myGroup === "admin") {
      //project_state = new ProjectStatus({ state: "running" });
      setIsRunning(true);
    } else {
      setIsRunning(projState === "running");
    }
  }, [projState, project_id]);

  return isRunning;
}
