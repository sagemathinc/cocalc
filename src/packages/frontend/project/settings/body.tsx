/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import {
  AddCollaborators,
  CurrentCollaboratorsPanel,
} from "@cocalc/frontend/collaborators";
import { Icon, SettingBox } from "@cocalc/frontend/components";
import { getStudentProjectFunctionality } from "@cocalc/frontend/course";
import { commercial } from "@cocalc/frontend/customize";
import {
  is_available,
  ProjectConfiguration,
} from "@cocalc/frontend/project_configuration";
import { Customer, ProjectMap, UserMap } from "@cocalc/frontend/todo-types";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import {
  KUCALC_COCALC_COM,
  KUCALC_ON_PREMISES,
} from "@cocalc/util/db-schema/site-defaults";
import { is_different } from "@cocalc/util/misc";
import { List } from "immutable";
import React from "react";
import { Col, Row } from "react-bootstrap";
import { NamedServerPanel } from "../named-server-panel";
import { NoNetworkProjectWarning } from "../warnings/no-network";
import { NonMemberProjectWarning } from "../warnings/non-member";
import { AboutBox } from "./about-box";
import { Datastore } from "./datastore";
import { Environment } from "./environment";
import { HideDeleteBox } from "./hide-delete-box";
import { ProjectCapabilities } from "./project-capabilites";
import { ProjectControl } from "./project-control";
import { SagewsControl } from "./sagews-control";
import SavingProjectSettingsError from "./saving-project-settings-error";
import { SSHPanel } from "./ssh";
import { Project } from "./types";
import { UpgradeUsage } from "./upgrade-usage";

interface ReactProps {
  project_id: string;
  account_id?: string;
  project: Project;
  user_map: UserMap;
  customer?: Customer;
  email_address?: string;
  project_map?: ProjectMap; // if this changes, then available upgrades change, so we may have to re-render, if editing upgrades.
  name: string;
}

const is_same = (prev: ReactProps, next: ReactProps) => {
  return !(
    is_different(prev, next, ["project", "user_map", "project_map"]) ||
    (next.customer != null && !next.customer.equals(prev.customer))
  );
};

export const Body: React.FC<ReactProps> = React.memo((props: ReactProps) => {
  const { project_id, account_id, project, user_map, email_address, name } =
    props;

  const get_total_upgrades = redux.getStore("account").get_total_upgrades;
  const groups = useTypedRedux("account", "groups") ?? List<string>();

  const kucalc = useTypedRedux("customize", "kucalc");
  const ssh_gateway = useTypedRedux("customize", "ssh_gateway");
  const datastore = useTypedRedux("customize", "datastore");

  const projects_store = redux.getStore("projects");
  const {
    get_course_info,
    get_total_upgrades_you_have_applied,
    get_upgrades_you_applied_to_project,
    get_total_project_quotas,
    get_upgrades_to_project,
  } = projects_store;

  const all_projects_have_been_loaded = useTypedRedux(
    "projects",
    "all_projects_have_been_loaded"
  );

  const configuration: ProjectConfiguration | undefined = useTypedRedux(
    { project_id },
    "configuration"
  );

  // get the description of the share, in case the project is being shared
  const id = project_id;

  const upgrades_you_can_use = get_total_upgrades();

  const course_info = get_course_info(project_id);
  const upgrades_you_applied_to_all_projects =
    get_total_upgrades_you_have_applied();
  const upgrades_you_applied_to_this_project =
    get_upgrades_you_applied_to_project(id);
  const total_project_quotas = get_total_project_quotas(id); // only available for non-admin for now.
  const all_upgrades_to_this_project = get_upgrades_to_project(id);
  const store = redux.getStore("projects");
  const site_license_upgrades =
    store.get_total_site_license_upgrades_to_project(project_id);
  const site_license_ids: string[] = store.get_site_license_ids(project_id);
  const dedicated_resources =
    store.get_total_site_license_dedicated(project_id);

  const available = is_available(configuration);
  const have_jupyter_lab = available.jupyter_lab;
  const have_jupyter_notebook = available.jupyter_notebook;
  const student = getStudentProjectFunctionality(project_id);
  const showDatastore =
    kucalc === KUCALC_COCALC_COM ||
    (kucalc === KUCALC_ON_PREMISES && datastore);

  return (
    <div>
      {commercial &&
      total_project_quotas != undefined &&
      !total_project_quotas.member_host ? (
        <NonMemberProjectWarning
          upgrade_type="member_host"
          upgrades_you_can_use={upgrades_you_can_use}
          upgrades_you_applied_to_all_projects={
            upgrades_you_applied_to_all_projects
          }
          course_info={course_info}
          account_id={webapp_client.account_id}
          email_address={email_address}
        />
      ) : undefined}
      {commercial &&
      total_project_quotas != undefined &&
      !total_project_quotas.network ? (
        <NoNetworkProjectWarning
          upgrade_type="network"
          upgrades_you_can_use={upgrades_you_can_use}
          upgrades_you_applied_to_all_projects={
            upgrades_you_applied_to_all_projects
          }
        />
      ) : undefined}
      <h1 style={{ marginTop: "0px" }}>
        <Icon name="wrench" /> Project Settings
      </h1>
      <SavingProjectSettingsError project_id={project_id} />
      <Row>
        <Col sm={6}>
          <AboutBox
            project_id={id}
            project_title={project.get("title") ?? ""}
            description={project.get("description") ?? ""}
            created={project.get("created")}
            name={project.get("name")}
            actions={redux.getActions("projects")}
          />
          <UpgradeUsage
            project_id={id}
            project={project}
            actions={redux.getActions("projects")}
            user_map={user_map}
            account_groups={groups.toJS()}
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
          />

          <HideDeleteBox
            key="hidedelete"
            project={project}
            actions={redux.getActions("projects")}
          />
          {!student.disableSSH &&
          (ssh_gateway || kucalc === KUCALC_COCALC_COM) ? (
            <SSHPanel
              key="ssh-keys"
              project={project}
              account_id={account_id}
            />
          ) : undefined}
          <Environment key="environment" project_id={project_id} />
          {showDatastore && (
            <Datastore key="datastore" project_id={project_id} />
          )}
          <ProjectCapabilities
            name={name}
            key={"capabilities"}
            project={project}
            project_id={project_id}
          />
        </Col>
        <Col sm={6}>
          <CurrentCollaboratorsPanel
            key="current-collabs"
            project={project}
            user_map={user_map}
          />
          {!student.disableCollaborators && (
            <SettingBox title="Add new collaborators" icon="UserAddOutlined">
              <AddCollaborators project_id={project.get("project_id")} />
            </SettingBox>
          )}
          <ProjectControl key="control" project={project} />
          <SagewsControl key="worksheet" project={project} />
          {have_jupyter_notebook && (
            <NamedServerPanel project_id={id} name={"jupyter"} />
          )}
          {have_jupyter_lab && (
            <NamedServerPanel project_id={id} name={"jupyterlab"} />
          )}
          {available.vscode && (
            <NamedServerPanel project_id={id} name={"code"} />
          )}
          {available.julia && (
            <NamedServerPanel project_id={id} name={"pluto"} />
          )}
        </Col>
      </Row>
    </div>
  );
}, is_same);
