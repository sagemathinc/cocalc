/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  useMemo,
  useStore,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { useProjectContext } from "./context";
import { NoInternetModal, useInternetWarningClosed } from "./no-internet-modal";
import { useRunQuota } from "./settings/run-quota/hooks";
import { TrialBanner } from "./trial-banner";

export const DOC_TRIAL = "https://doc.cocalc.com/trial.html";

export function ProjectWarningBanner() {
  const {
    isRunning: projectIsRunning,
    project_id,
    is_active,
  } = useProjectContext();
  const other_settings = useTypedRedux("account", "other_settings");
  const project_map = useTypedRedux("projects", "project_map");
  const projects_store = useStore("projects");

  const runQuota = useRunQuota(project_id, null);
  const isPaidStudentPayProject = useMemo(
    () => projects_store.isPaidStudentPayProject(project_id),
    [project_map, project_id],
  );
  const is_commercial = useTypedRedux("customize", "is_commercial");
  const dismissedInternetWarning = useInternetWarningClosed(project_id)[0];

  const noMemberHosting: boolean = !runQuota?.member_host;
  const noInternet: boolean = !runQuota?.network;

  function hideAllWarnings(): boolean {
    if (!projectIsRunning) {
      // if the project is not running, we don't show the trial banner
      return true;
    }
    if (!is_commercial) {
      return true;
    }
    return false;
  }

  function showNoInternetBanner(): boolean {
    if (!is_active) return false;
    if (hideAllWarnings()) return false;
    if (dismissedInternetWarning) return false;
    if (noInternet) return true;
    return false;
  }

  function showTrialBanner(): boolean {
    if (hideAllWarnings()) return false;

    // paying users are allowed to have a setting to hide banner unconditionally
    if (other_settings?.get("no_free_warnings")) {
      return false;
    }
    // we exclude students, but still show a warning about internet (see above)
    if (isPaidStudentPayProject) {
      return false;
    }
    if (noMemberHosting) {
      return true;
    }
    return false;
  }

  if (projectIsRunning == null) {
    return null;
  }

  function renderTrialBanner() {
    if (!showTrialBanner() || projectIsRunning == null) return null;

    return (
      <TrialBanner
        project_id={project_id}
        projectCreatedTS={project_map?.get(project_id)?.get("created")}
        noMemberHosting={noMemberHosting}
        noInternet={noInternet}
        projectIsRunning={projectIsRunning}
      />
    );
  }

  function renderNoInternetModal() {
    if (!showNoInternetBanner()) return null;

    return (
      <NoInternetModal
        isPaidStudentPayProject={isPaidStudentPayProject}
      />
    );
  }

  return (
    <>
      {renderTrialBanner()}
      {renderNoInternetModal()}
    </>
  );
}
