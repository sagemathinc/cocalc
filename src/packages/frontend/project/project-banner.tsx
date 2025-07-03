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
  const { isRunning: projectIsRunning, project_id } = useProjectContext();
  const other_settings = useTypedRedux("account", "other_settings");
  const is_anonymous = useTypedRedux("account", "is_anonymous");
  const project_map = useTypedRedux("projects", "project_map");
  const projects_store = useStore("projects");
  const computeServers = useTypedRedux({ project_id }, "compute_servers");
  const hasComputeServers =
    computeServers != null &&
    computeServers.filter((x) => x.get("state") != "deprovisioned").size >= 1;

  const runQuota = useRunQuota(project_id, null);
  // list of all licenses applied to this project
  const projectSiteLicenses =
    project_map?.get(project_id)?.get("site_license")?.keySeq().toJS() ?? [];
  const isPaidStudentPayProject = useMemo(
    () => projects_store.isPaidStudentPayProject(project_id),
    [project_map, project_id],
  );
  const is_commercial = useTypedRedux("customize", "is_commercial");
  const isSandbox = project_map?.getIn([project_id, "sandbox"]);
  const dismissedInternetWarning = useInternetWarningClosed(project_id)[0];

  const noMemberHosting: boolean = !runQuota?.member_host;
  const noInternet: boolean = !runQuota?.network;

  // fallback case for showBanner
  function showNoInternetBanner(): boolean {
    if (dismissedInternetWarning) {
      return false;
    }
    if (projectIsRunning && noInternet) {
      return true;
    } else {
      return false;
    }
  }

  function showTrialBanner(): boolean {
    if (!projectIsRunning) {
      // if the project is not running, we don't show the trial banner
      return false;
    }
    // paying users are allowed to have a setting to hide banner unconditionally
    if (other_settings?.get("no_free_warnings")) {
      return false;
    }
    if (!is_commercial) {
      return false;
    }
    if (is_anonymous) {
      // No need to provide all these warnings and scare anonymous users, who are just
      // playing around for the first time (and probably wouldn't read this, and should
      // assume strong limitations since they didn't even make an account).
      return false;
    }
    if (isSandbox) {
      // don't bother for sandbox project, since users can't upgrade it anyways.
      return false;
    }
    // we exclude students
    if (isPaidStudentPayProject) {
      return false;
    }
    if (!noMemberHosting) {
      return false;
    }
    // if none of the above cases apply, we show the trial banner
    return true;
  }

  if (projectIsRunning == null) {
    return null;
  }

  function renderTrialBanner() {
    if (!showTrialBanner() || projectIsRunning == null) return null;

    return (
      <TrialBanner
        project_id={project_id}
        projectSiteLicenses={projectSiteLicenses}
        projectCreatedTS={project_map?.get(project_id)?.get("created")}
        noMemberHosting={noMemberHosting}
        noInternet={noInternet}
        projectIsRunning={projectIsRunning}
        hasComputeServers={hasComputeServers}
      />
    );
  }

  function renderNoInternetModal() {
    if (!showNoInternetBanner()) return null;

    return (
      <NoInternetModal
        project_id={project_id}
        projectSiteLicenses={projectSiteLicenses}
        isPaidStudentPayProject={isPaidStudentPayProject}
        hasComputeServers={hasComputeServers}
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
