/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import React, { useMemo } from "react";

import { Col, Row } from "@cocalc/frontend/antd-bootstrap";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { getStudentProjectFunctionality } from "@cocalc/frontend/course";
import { Customer, ProjectMap } from "@cocalc/frontend/todo-types";
import {
  KUCALC_COCALC_COM,
  KUCALC_ON_PREMISES,
} from "@cocalc/util/db-schema/site-defaults";
import { is_different } from "@cocalc/util/misc";
import { NoNetworkProjectWarning } from "../warnings/no-network";
import { NonMemberProjectWarning } from "../warnings/non-member";
import { AboutBox } from "./about-box";
import { ApiKeys } from "./api-keys";
import { Datastore } from "./datastore";
import { Environment } from "./environment";
import { HideDeleteBox } from "./hide-delete-box";
import { ProjectCapabilities } from "./project-capabilites";
import { ProjectControl } from "./project-control";
import { useRunQuota } from "./run-quota/hooks";
import SavingProjectSettingsError from "./saving-project-settings-error";
import { SSHPanel } from "./ssh";
import { Project } from "./types";
import { lite } from "@cocalc/frontend/lite";

interface ReactProps {
  project_id: string;
  account_id?: string;
  project: Project;
  customer?: Customer;
  email_address?: string;
  project_map?: ProjectMap; // if this changes, then available upgrades change, so we may have to re-render, if editing upgrades.
}

const is_same = (prev: ReactProps, next: ReactProps) => {
  return !(
    is_different(prev, next, ["project", "project_map"]) ||
    (next.customer != null && !next.customer.equals(prev.customer))
  );
};

export const Body: React.FC<ReactProps> = React.memo((props: ReactProps) => {
  const { project_id, account_id, project } = props;
  const kucalc = useTypedRedux("customize", "kucalc");
  const runQuota = useRunQuota(project_id, null);
  const ssh_gateway = useTypedRedux("customize", "ssh_gateway");
  const datastore = useTypedRedux("customize", "datastore");
  const commercial = useTypedRedux("customize", "commercial");

  // get the description of the share, in case the project is being shared
  const id = project_id;

  const student = getStudentProjectFunctionality(project_id);
  const showDatastore =
    kucalc === KUCALC_COCALC_COM ||
    (kucalc === KUCALC_ON_PREMISES && datastore);

  // this very rarely changes, so just call this once
  const isPaidStudentPayProject = useMemo(
    () => redux.getProjectsStore().isPaidStudentPayProject(project_id),
    [project_id],
  );
  const showNonMemberWarning =
    !isPaidStudentPayProject &&
    commercial &&
    runQuota != null &&
    !runQuota.member_host;
  const showNoInternetWarning =
    !isPaidStudentPayProject &&
    commercial &&
    runQuota != null &&
    !runQuota.network;

  return (
    <div>
      {showNonMemberWarning ? <NonMemberProjectWarning /> : undefined}
      {showNoInternetWarning ? <NoNetworkProjectWarning /> : undefined}
      <h1 style={{ marginTop: "0px" }}>
        <Icon name="wrench" /> Project Settings and Controls
      </h1>
      <SavingProjectSettingsError project_id={project_id} />
      <Row>
        {lite && <Col sm={3} />}
        <Col sm={6}>
          <AboutBox
            project_id={id}
            project_title={project.get("title") ?? ""}
            description={project.get("description") ?? ""}
            created={project.get("created")}
            name={project.get("name")}
            actions={redux.getActions("projects")}
          />
          {!lite && (
            <HideDeleteBox
              key="hide-delete"
              project={project}
              actions={redux.getActions("projects")}
            />
          )}
          {!lite && <Environment key="environment" project_id={project_id} />}
          {!lite && showDatastore && (
            <Datastore key="datastore" project_id={project_id} />
          )}
          <ProjectCapabilities
            key={"capabilities"}
            project={project}
            project_id={project_id}
          />
        </Col>
        {!lite && (
          <Col sm={6}>
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
        )}
      </Row>
    </div>
  );
}, is_same);
