/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */
import { useRedux, useEffect, useState } from "../../app-framework";
import { ProjectStatus } from "../../todo-types";

// this is a reasonable default in case we have no information yet
const init = new ProjectStatus({ state: "opened" });

// this tells you what state the project is in
export function useProjectState(project_id: string) {
  const [state, set_state] = useState<ProjectStatus>(init);

  const project_state = useRedux([
    "projects",
    "project_map",
    project_id,
    "state",
  ]);

  useEffect(() => {
    set_state(new ProjectStatus(project_state));
  }, [project_state]);

  return state;
}
