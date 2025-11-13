/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { FormattedMessage } from "react-intl";

import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Loading, Paragraph } from "@cocalc/frontend/components";
import { SandboxProjectSettingsWarning } from "@cocalc/frontend/project/settings/settings";
import { UpgradeUsage } from "@cocalc/frontend/project/settings/upgrade-usage";
import Purchases from "@cocalc/frontend/purchases/purchases";
import { useProject } from "../common";

interface ProjectUpgradesProps {
  project_id: string;
  wrap: Function;
}

export function ProjectUpgradesFlyout({
  project_id,
  wrap,
}: ProjectUpgradesProps): React.JSX.Element {
  const { project, group } = useProject(project_id);

  // TODO this duplicates a lot with settings/body.tsx → make this one or more hooks

  const projects_store = redux.getStore("projects");
  const {
    get_total_upgrades_you_have_applied,
    get_upgrades_you_applied_to_project,
    get_total_project_quotas,
  } = projects_store;

  const get_total_upgrades = redux.getStore("account").get_total_upgrades;

  const upgrades_you_can_use = get_total_upgrades();

  const upgrades_you_applied_to_all_projects =
    get_total_upgrades_you_have_applied();
  const upgrades_you_applied_to_this_project =
    get_upgrades_you_applied_to_project(project_id);
  const total_project_quotas = get_total_project_quotas(project_id); // only available for non-admin for now.
  const store = redux.getStore("projects");
  const site_license_ids: string[] = store.get_site_license_ids(project_id);
  const dedicated_resources =
    store.get_total_site_license_dedicated(project_id);

  const all_projects_have_been_loaded = useTypedRedux(
    "projects",
    "all_projects_have_been_loaded",
  );

  function renderUsage(): React.JSX.Element {
    if (project == null) {
      return <Loading theme="medium" transparent />;
    }

    return wrap(
      <div>
        <UpgradeUsage
          project_id={project_id}
          project={project}
          upgrades_you_can_use={upgrades_you_can_use}
          upgrades_you_applied_to_all_projects={
            upgrades_you_applied_to_all_projects
          }
          upgrades_you_applied_to_this_project={
            upgrades_you_applied_to_this_project
          }
          total_project_quotas={total_project_quotas}
          all_projects_have_been_loaded={all_projects_have_been_loaded}
          site_license_ids={site_license_ids}
          dedicated_resources={dedicated_resources}
          mode="flyout"
        />
        <Purchases project_id={project_id} group={true} />
      </div>,
    );
  }

  if (group != "admin" && group != "owner" && project?.get("sandbox")) {
    return <SandboxProjectSettingsWarning />;
  }

  return (
    <>
      <FormattedMessage
        id="page.flyouts.licenses.upgrades_explanation"
        defaultMessage={
          "<p>This project is using the following resource quotas when running. You can add more resources by adding licenses or applying upgrades.</p>"
        }
        values={{
          p: (ch) => (
            <Paragraph ellipsis={{ expandable: true, rows: 1, symbol: "more" }}>
              {ch}
            </Paragraph>
          ),
        }}
      />
      {renderUsage()}
    </>
  );
}
