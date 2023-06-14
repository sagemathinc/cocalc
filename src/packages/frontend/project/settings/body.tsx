/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";
import { Col, Row } from "react-bootstrap";

import {
  redux,
  useActions,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon, Paragraph, SettingBox } from "@cocalc/frontend/components";
import { getStudentProjectFunctionality } from "@cocalc/frontend/course";
import { commercial } from "@cocalc/frontend/customize";
import { Customer, ProjectMap } from "@cocalc/frontend/todo-types";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import {
  KUCALC_COCALC_COM,
  KUCALC_ON_PREMISES,
} from "@cocalc/util/db-schema/site-defaults";
import { is_different } from "@cocalc/util/misc";
import { NewFileButton } from "../new/new-file-button";
import {
  ICON_COLLABORATORS,
  ICON_LICENSES,
  TITLE_COLLABORATORS,
  TITLE_LICENSES,
} from "../servers/consts";
import { NoNetworkProjectWarning } from "../warnings/no-network";
import { NonMemberProjectWarning } from "../warnings/non-member";
import { AboutBox } from "./about-box";
import { ApiKeys } from "./api-keys";
import { Datastore } from "./datastore";
import { Environment } from "./environment";
import { HideDeleteBox } from "./hide-delete-box";
import { ProjectCapabilities } from "./project-capabilites";
import { ProjectControl } from "./project-control";
import SavingProjectSettingsError from "./saving-project-settings-error";
import { SSHPanel } from "./ssh";
import { Project } from "./types";

interface ReactProps {
  project_id: string;
  account_id?: string;
  project: Project;
  customer?: Customer;
  email_address?: string;
  project_map?: ProjectMap; // if this changes, then available upgrades change, so we may have to re-render, if editing upgrades.
  name: string;
}

const is_same = (prev: ReactProps, next: ReactProps) => {
  return !(
    is_different(prev, next, ["project", "project_map"]) ||
    (next.customer != null && !next.customer.equals(prev.customer))
  );
};

export const Body: React.FC<ReactProps> = React.memo((props: ReactProps) => {
  const { project_id, account_id, project, email_address, name } = props;

  const project_actions = useActions({ project_id });

  const get_total_upgrades = redux.getStore("account").get_total_upgrades;

  const kucalc = useTypedRedux("customize", "kucalc");
  const ssh_gateway = useTypedRedux("customize", "ssh_gateway");
  const datastore = useTypedRedux("customize", "datastore");

  const projects_store = redux.getStore("projects");
  const {
    get_course_info,
    get_total_upgrades_you_have_applied,
    get_total_project_quotas,
  } = projects_store;

  // get the description of the share, in case the project is being shared
  const id = project_id;

  const upgrades_you_can_use = get_total_upgrades();

  const course_info = get_course_info(project_id);
  const upgrades_you_applied_to_all_projects =
    get_total_upgrades_you_have_applied();
  const total_project_quotas = get_total_project_quotas(id); // only available for non-admin for now.

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
        <Icon name="wrench" /> Project Settings and Controls
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
          <SettingBox title="Quotas and Licenses moved" icon="move">
            <Paragraph>
              The panel for checking up on quotas, adding licenses and
              configuring updates has been moved to the "Licenses" tab.
            </Paragraph>
            <NewFileButton
              name={`Moved to "${TITLE_LICENSES}" tab.`}
              icon={ICON_LICENSES}
              on_click={() => {
                project_actions?.set_active_tab("licenses", {
                  change_history: true,
                });
              }}
            />
          </SettingBox>
          <HideDeleteBox
            key="hidedelete"
            project={project}
            actions={redux.getActions("projects")}
          />
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
          <SettingBox title="Collaborators moved" icon="move">
            <Paragraph>
              The panel for configuring collaborators has been moved to the
              "Collaborators" tab.
            </Paragraph>
            <NewFileButton
              name={`Moved to "${TITLE_COLLABORATORS}" tab.`}
              icon={ICON_COLLABORATORS}
              on_click={() => {
                project_actions?.set_active_tab("collaborators", {
                  change_history: true,
                });
              }}
            />
          </SettingBox>
          <ProjectControl key="control" project={project} />
          {!student.disableSSH &&
            (ssh_gateway || kucalc === KUCALC_COCALC_COM) && (
              <SSHPanel
                key="ssh-keys"
                project={project}
                account_id={account_id}
              />
            )}
          <ApiKeys project_id={project_id} />
        </Col>
      </Row>
    </div>
  );
}, is_same);
