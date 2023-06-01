/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Context, createContext, useContext, useMemo } from "react";

import {
  useProjectState,
  init as INIT_PROJECT_STATE,
} from "./page/project-state-hook";
import { ProjectStatus } from "@cocalc/frontend/todo-types";
import { useProjectHasInternetAccess } from "./settings/has-internet-access-hook";
import { useProjectStatus } from "./page/project-status-hook";
import { useActions } from "@cocalc/frontend/app-framework";

export interface ProjectState {
  project_id: string;
  is_active: boolean;
  isRunning: boolean | undefined;
  hasInternet: boolean | undefined;
  status: ProjectStatus;
}

const contexts: { [project_id: string]: Context<ProjectState> } = {};

export function createProjectContext(project_id: string) {
  if (contexts[project_id] != null) {
    return contexts[project_id];
  }
  const ctx = createContext<ProjectState>({
    is_active: false,
    project_id,
    isRunning: undefined,
    status: INIT_PROJECT_STATE,
    hasInternet: undefined,
  });
  contexts[project_id] = ctx;
  return ctx;
}

export function useProjectContext(project_id: string) {
  const ctx = contexts[project_id];
  if (ctx == null) {
    throw new Error(`No project context for project ${project_id}`);
  }
  return useContext(ctx);
}

export function useProjectContextProvider(
  project_id: string,
  is_active: boolean
): ProjectState {
  const actions = useActions({ project_id });
  const status: ProjectStatus = useProjectState(project_id);
  useProjectStatus(actions);
  const hasInternet = useProjectHasInternetAccess(project_id);
  const isRunning = useMemo(
    () => status.get("state") === "running",
    [status.get("state")]
  );

  return { project_id, status, hasInternet, isRunning, is_active };
}

export function deleteProjectContext(project_id: string) {
  delete contexts[project_id];
}
