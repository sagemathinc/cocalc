/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Row, Col } from "antd";
import { redux } from "@cocalc/frontend//app-framework";
import { Alert } from "@cocalc/frontend/antd-bootstrap";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon, Loading, Paragraph, Title } from "@cocalc/frontend/components";
import { ICON_UPGRADES, ROOT_STYLE, TITLE_UPGRADES } from "../servers/consts";
import { SandboxProjectSettingsWarning } from "../settings/settings";
import { UpgradeUsage } from "../settings/upgrade-usage";
import { useProject } from "./common";
import Purchases from "@cocalc/frontend/purchases/purchases";

export function ProjectLicenses({ project_id }): JSX.Element {
  const { project, group } = useProject(project_id);
  const all_projects_have_been_loaded = useTypedRedux(
    "projects",
    "all_projects_have_been_loaded"
  );

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

  function renderBody(): JSX.Element {
    if (project == null) {
      return <Loading theme="medium" />;
    }
    return (
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
        mode="project"
      />
    );
  }

  function renderAdmin() {
    if (group !== "admin") return;
    return (
      <Alert bsStyle="warning" style={{ margin: "10px" }}>
        <h4>
          <strong>
            Warning: you are editing the project settings as an administrator.
          </strong>
        </h4>
      </Alert>
    );
  }

  if (group != "admin" && group != "owner" && project?.get("sandbox")) {
    return <SandboxProjectSettingsWarning />;
  }

  return (
    <div style={{ ...ROOT_STYLE, maxWidth: undefined }}>
      <Title level={2}>
        <Icon name={ICON_UPGRADES} /> Quotas and {TITLE_UPGRADES}
      </Title>
      <Paragraph>
        Licenses change the quotas and features available to a project.
      </Paragraph>
      {renderAdmin()}
      <div>
        <Row>
          <Col md={12} style={{ padding: "15px 30px" }}>
            {renderBody()}
          </Col>
          <Col md={12} style={{ padding: "15px 30px" }}>
            <Purchases project_id={project_id} group={true} />
          </Col>
        </Row>
      </div>
    </div>
  );
}
