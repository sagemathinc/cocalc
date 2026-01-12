/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { FormattedMessage } from "react-intl";

import { redux } from "@cocalc/frontend/app-framework";
import { Loading, Paragraph } from "@cocalc/frontend/components";
import { SandboxProjectSettingsWarning } from "@cocalc/frontend/project/settings/settings";
import { UpgradeUsage } from "@cocalc/frontend/project/settings/upgrade-usage";
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

  const store = redux.getStore("projects");
  const dedicated_resources =
    store.get_total_site_license_dedicated(project_id);

  function renderUsage(): React.JSX.Element {
    if (project == null) {
      return <Loading theme="medium" transparent />;
    }

    return wrap(
      <div>
        <UpgradeUsage
          project_id={project_id}
          project={project}
          dedicated_resources={dedicated_resources}
          mode="flyout"
        />
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
          "<p>This project is using the following resource quotas when running. You can add more resources with memberships.</p>"
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
