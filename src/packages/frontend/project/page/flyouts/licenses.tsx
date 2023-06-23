/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Loading, Paragraph } from "@cocalc/frontend/components";
import { Project } from "@cocalc/frontend/project/settings/types";
import { UpgradeUsage } from "@cocalc/frontend/project/settings/upgrade-usage";
import { SandboxProjectSettingsWarning } from "../../settings/settings";
import { useProject } from "../common";

interface LicensesProps {
  project_id: string;
  wrap: Function;
}

export function LicensesFlyout({
  project_id,
  wrap,
}: LicensesProps): JSX.Element {
  const { project, group } = useProject(project_id);

  // TODO this duplicates a lot with settings/body.tsx → make this one or more hooks

  const projects_store = redux.getStore("projects");
  const {
    get_total_upgrades_you_have_applied,
    get_upgrades_you_applied_to_project,
    get_total_project_quotas,
    get_upgrades_to_project,
  } = projects_store;

  const get_total_upgrades = redux.getStore("account").get_total_upgrades;

  const upgrades_you_can_use = get_total_upgrades();

  const upgrades_you_applied_to_all_projects =
    get_total_upgrades_you_have_applied();
  const upgrades_you_applied_to_this_project =
    get_upgrades_you_applied_to_project(project_id);
  const total_project_quotas = get_total_project_quotas(project_id); // only available for non-admin for now.
  const all_upgrades_to_this_project = get_upgrades_to_project(project_id);
  const store = redux.getStore("projects");
  const site_license_upgrades =
    store.get_total_site_license_upgrades_to_project(project_id);
  const site_license_ids: string[] = store.get_site_license_ids(project_id);
  const dedicated_resources =
    store.get_total_site_license_dedicated(project_id);

  const all_projects_have_been_loaded = useTypedRedux(
    "projects",
    "all_projects_have_been_loaded"
  );

  function renderUsage(): JSX.Element {
    if (project == null) return <Loading />;

    return wrap(
      <UpgradeUsage
        project_id={project_id}
        project={project as any as Project}
        upgrades_you_can_use={upgrades_you_can_use}
        upgrades_you_applied_to_all_projects={
          upgrades_you_applied_to_all_projects
        }
        upgrades_you_applied_to_this_project={
          upgrades_you_applied_to_this_project
        }
        total_project_quotas={total_project_quotas}
        all_upgrades_to_this_project={all_upgrades_to_this_project}
        all_projects_have_been_loaded={all_projects_have_been_loaded}
        site_license_upgrades={site_license_upgrades}
        site_license_ids={site_license_ids}
        dedicated_resources={dedicated_resources}
        mode="flyout"
      />
    );
  }

  if (group != "admin" && group != "owner" && project?.get("sandbox")) {
    return <SandboxProjectSettingsWarning />;
  }

  return (
    <>
      <Paragraph
        ellipsis={{ expandable: true, rows: 1, symbol: "more" }}
      >
        This project is using the following resource quotas when running. You
        can add more resources by adding licenses or applying upgrades.
      </Paragraph>
      {renderUsage()}
    </>
  );
}
