/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { FormattedMessage } from "react-intl";
import { redux } from "@cocalc/frontend//app-framework";
import { Icon, Loading, Paragraph, Title } from "@cocalc/frontend/components";
import { ICON_UPGRADES, ROOT_STYLE } from "../servers/consts";
import { SandboxProjectSettingsWarning } from "../settings/settings";
import { UpgradeUsage } from "../settings/upgrade-usage";
import { useProject } from "./common";
import AdminWarning from "@cocalc/frontend/project/page/admin-warning";

export function ProjectLicenses({ project_id }): React.JSX.Element {
  const { project, group } = useProject(project_id);
  const store = redux.getStore("projects");
  const gpu = store.get_total_site_license_gpu(project_id);

  function renderBody(): React.JSX.Element {
    if (project == null) {
      return <Loading theme="medium" />;
    }
    return (
      <UpgradeUsage
        project_id={project_id}
        project={project}
        gpu={gpu}
        mode="project"
      />
    );
  }

  function renderAdmin() {
    if (group !== "admin") return;
    return <AdminWarning />;
  }

  if (group != "admin" && group != "owner" && project?.get("sandbox")) {
    return <SandboxProjectSettingsWarning />;
  }

  return (
    <div style={ROOT_STYLE}>
      <Title level={2}>
        <Icon name={ICON_UPGRADES} />{" "}
        <FormattedMessage
          id="project.page.project-licenses.header"
          defaultMessage={"Quotas and memberships"}
        />
      </Title>
      <Paragraph>
        <FormattedMessage
          id="project.page.project-licenses.intro"
          defaultMessage={
            "Memberships change the quotas and features available to a project."
          }
        />
      </Paragraph>
      {renderAdmin()}
      {renderBody()}
    </div>
  );
}
