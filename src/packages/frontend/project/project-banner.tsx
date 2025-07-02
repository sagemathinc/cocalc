/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  React,
  useMemo,
  useStore,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { useProjectContext } from "./context";
import { NoInternetBanner } from "./no-internet-banner";
import { useRunQuota } from "./settings/run-quota/hooks";
import { TrialBanner } from "./trial-banner";

export const DOC_TRIAL = "https://doc.cocalc.com/trial.html";

export const ProjectWarningBanner: React.FC<{}> = React.memo(() => {
  const { isRunning: projectIsRunning, project_id } = useProjectContext();
  const other_settings = useTypedRedux("account", "other_settings");
  const is_anonymous = useTypedRedux("account", "is_anonymous");
  const project_map = useTypedRedux("projects", "project_map");
  const projects_store = useStore("projects");
  const computeServers = useTypedRedux({ project_id }, "compute_servers");
  const runQuota = useRunQuota(project_id, null);
  const isPaidStudentPayProject = useMemo(
    () => projects_store.isPaidStudentPayProject(project_id),
    [project_map, project_id],
  );
  const is_commercial = useTypedRedux("customize", "is_commercial");
  const isSandbox = project_map?.getIn([project_id, "sandbox"]);

  const noMemberHosting: boolean = !runQuota?.member_host;
  const noInternet: boolean = !runQuota?.network;

  // fallback case for showBanner
  function showNoInternetBanner(): "no-internet" | null {
    if (projectIsRunning && noInternet) {
      return "no-internet";
    } else {
      return null;
    }
  }

  function showBanner(): "trial" | "no-internet" | null {
    // paying users are allowed to have a setting to hide banner unconditionally
    if (other_settings?.get("no_free_warnings")) {
      return showNoInternetBanner();
    }
    if (!is_commercial) {
      return null;
    }
    if (is_anonymous) {
      // No need to provide all these warnings and scare anonymous users, who are just
      // playing around for the first time (and probably wouldn't read this, and should
      // assume strong limitations since they didn't even make an account).
      return null;
    }
    if (isSandbox) {
      // don't bother for sandbox project, since users can't upgrade it anyways.
      return null;
    }
    // we exclude students, but still show a warning about internet
    if (isPaidStudentPayProject) {
      if (noInternet) {
        return showNoInternetBanner();
      }
      return null;
    }
    if (!noMemberHosting && !noInternet) {
      return null;
    }
    if (!noMemberHosting && noInternet) {
      return showNoInternetBanner();
    }
    // if none of the above cases apply, we show the trial banner
    return "trial";
  }

  if (projectIsRunning == null) {
    return null;
  }

  switch (showBanner()) {
    case "trial":
      // list of all licenses applied to this project
      const projectSiteLicenses =
        project_map?.get(project_id)?.get("site_license")?.keySeq().toJS() ??
        [];
      const hasComputeServers =
        computeServers != null &&
        computeServers.filter((x) => x.get("state") != "deprovisioned").size >=
          1;

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

    case "no-internet":
      return (
        <NoInternetBanner
          project_id={project_id}
          projectSiteLicenses={projectSiteLicenses}
          isPaidStudentPayProject={isPaidStudentPayProject}
        />
      );
  }
  return null;
});
