/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Context, createContext, useContext, useMemo, useState } from "react";

import {
  ProjectActions,
  redux,
  useActions,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { UserGroup } from "@cocalc/frontend/projects/store";
import { ProjectStatus } from "@cocalc/frontend/todo-types";
import { LLMServicesAvailable } from "@cocalc/util/db-schema/llm-utils";
import {
  KUCALC_COCALC_COM,
  KUCALC_DISABLED,
} from "@cocalc/util/db-schema/site-defaults";
import { useProject } from "./page/common";
import { FlyoutActiveStarred } from "./page/flyouts/state";
import { useStarredFilesManager } from "./page/flyouts/store";
import {
  init as INIT_PROJECT_STATE,
  useProjectState,
} from "./page/project-state-hook";
import { useProjectHasInternetAccess } from "./settings/has-internet-access-hook";
import { Project } from "./settings/types";

export interface ProjectContextState {
  actions?: ProjectActions;
  active_project_tab?: string;
  compute_image: string | undefined;
  enabledLLMs: LLMServicesAvailable;
  flipTabs: [number, React.Dispatch<React.SetStateAction<number>>];
  group?: UserGroup;
  hasInternet?: boolean | undefined;
  is_active: boolean;
  isRunning?: boolean | undefined;
  mainWidthPx: number;
  manageStarredFiles: {
    starred: FlyoutActiveStarred;
    setStarredPath: (path: string, starState: boolean) => void;
  };
  onCoCalcCom: boolean;
  onCoCalcDocker: boolean;
  project_id: string;
  project?: Project;
  status: ProjectStatus;
}

export const emptyProjectContext = {
  actions: undefined,
  active_project_tab: undefined,
  group: undefined,
  project: undefined,
  is_active: false,
  project_id: "",
  isRunning: undefined,
  status: INIT_PROJECT_STATE,
  hasInternet: undefined,
  flipTabs: [0, () => {}],
  onCoCalcCom: true,
  onCoCalcDocker: false,
  enabledLLMs: {
    openai: false,
    google: false,
    ollama: false,
    mistralai: false,
    anthropic: false,
    custom_openai: false,
    user: false,
  },
  mainWidthPx: 0,
  manageStarredFiles: {
    starred: [],
    setStarredPath: () => {},
  },
  compute_image: undefined,
} as ProjectContextState;

export const ProjectContext: Context<ProjectContextState> =
  createContext<ProjectContextState>(emptyProjectContext);

export function useProjectContext() {
  return useContext(ProjectContext);
}

export function useProjectContextProvider({
  project_id,
  is_active,
  mainWidthPx,
}: {
  project_id: string;
  is_active: boolean;
  mainWidthPx: number;
}): ProjectContextState {
  const actions = useActions({ project_id });
  const { project, group, compute_image } = useProject(project_id);
  const status: ProjectStatus = useProjectState(project_id);
  const hasInternet = useProjectHasInternetAccess(project_id);
  const isRunning = useMemo(
    () => status.get("state") === "running",
    [status.get("state")],
  );
  const active_project_tab = useTypedRedux(
    { project_id },
    "active_project_tab",
  );
  // shared data: used to flip through the open tabs in the active files flyout
  const flipTabs = useState<number>(0);

  // manage starred files (active tabs)
  // This is put here, to only sync the starred files when the project is opened,
  // not each time the active tab is opened!
  const manageStarredFiles = useStarredFilesManager(project_id);

  const kucalc = useTypedRedux("customize", "kucalc");
  const onCoCalcCom = kucalc === KUCALC_COCALC_COM;
  const onCoCalcDocker = kucalc === KUCALC_DISABLED;

  const haveOpenAI = useTypedRedux("customize", "openai_enabled");
  const haveGoogle = useTypedRedux("customize", "google_vertexai_enabled");
  const haveOllama = useTypedRedux("customize", "ollama_enabled");
  const haveCustomOpenAI = useTypedRedux("customize", "custom_openai_enabled");
  const haveMistral = useTypedRedux("customize", "mistral_enabled");
  const haveAnthropic = useTypedRedux("customize", "anthropic_enabled");
  const userDefinedLLM = useTypedRedux("customize", "user_defined_llm");

  const enabledLLMs = useMemo(() => {
    const projectsStore = redux.getStore("projects");
    return projectsStore.whichLLMareEnabled(project_id);
  }, [
    haveAnthropic,
    haveCustomOpenAI,
    haveGoogle,
    haveMistral,
    haveOllama,
    haveOpenAI,
    userDefinedLLM,
  ]);

  return {
    actions,
    active_project_tab,
    compute_image,
    enabledLLMs,
    flipTabs,
    group,
    hasInternet,
    is_active,
    isRunning,
    mainWidthPx,
    manageStarredFiles,
    onCoCalcCom,
    onCoCalcDocker,
    project_id,
    project,
    status,
  };
}
