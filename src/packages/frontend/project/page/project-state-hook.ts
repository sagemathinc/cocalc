/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */
import { useEffect, useRedux, useState } from "@cocalc/frontend/app-framework";
import { ProjectStatus } from "@cocalc/frontend/todo-types";

// this is a reasonable default in case we have no information yet or project_id is undefined.
export const init = new ProjectStatus({ state: "opened" });

// this tells you what state the project is in
export function useProjectState(project_id: string | undefined): ProjectStatus {
  const [state, set_state] = useState<ProjectStatus>(init);

  const project_state = useRedux([
    "projects",
    "project_map",
    project_id ?? "",
    "state",
  ]);

  useEffect(() => {
    if (project_state != null) {
      set_state(new ProjectStatus(project_state));
    }
  }, [project_state]);

  return state;
}
