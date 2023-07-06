/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Context, createContext, useContext, useMemo } from "react";

import {
  ProjectActions,
  useActions,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { UserGroup } from "@cocalc/frontend/projects/store";
import { ProjectStatus } from "@cocalc/frontend/todo-types";
import { useProject } from "./page/common";
import {
  init as INIT_PROJECT_STATE,
  useProjectState,
} from "./page/project-state-hook";
import { useProjectStatus } from "./page/project-status-hook";
import { useProjectHasInternetAccess } from "./settings/has-internet-access-hook";
import { Project } from "./settings/types";

export interface ProjectContextState {
  actions?: ProjectActions;
  active_project_tab?: string;
  group?: UserGroup;
  hasInternet?: boolean | undefined;
  is_active: boolean;
  isRunning?: boolean | undefined;
  project_id: string;
  project?: Project;
  status: ProjectStatus;
}

export const ProjectContext: Context<ProjectContextState> =
  createContext<ProjectContextState>({
    actions: undefined,
    active_project_tab: undefined,
    group: undefined,
    project: undefined,
    is_active: false,
    project_id: "",
    isRunning: undefined,
    status: INIT_PROJECT_STATE,
    hasInternet: undefined,
  });

export function useProjectContext() {
  const context = useContext(ProjectContext);
  if (context.project_id === "") {
    throw new Error(
      "useProjectContext() must be used inside a <ProjectContext.Provider>"
    );
  }
  return context;
}

export function useProjectContextProvider(
  project_id: string,
  is_active: boolean
): ProjectContextState {
  const actions = useActions({ project_id });
  const { project, group } = useProject(project_id);
  const status: ProjectStatus = useProjectState(project_id);
  useProjectStatus(actions);
  const hasInternet = useProjectHasInternetAccess(project_id);
  const isRunning = useMemo(
    () => status.get("state") === "running",
    [status.get("state")]
  );
  const active_project_tab = useTypedRedux(
    { project_id },
    "active_project_tab"
  );

  return {
    actions,
    active_project_tab,
    group,
    hasInternet,
    is_active,
    isRunning,
    project_id,
    project,
    status,
  };
}
