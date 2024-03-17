/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert } from "@cocalc/frontend/antd-bootstrap";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import {
  AddCollaborators,
  CurrentCollaboratorsPanel,
} from "@cocalc/frontend/collaborators";
import {
  CloseX2,
  Icon,
  Loading,
  Paragraph,
  SettingBox,
  Title,
} from "@cocalc/frontend/components";
import { getStudentProjectFunctionality } from "@cocalc/frontend/course";
import { useProjectContext } from "../context";
import { ICON_USERS, ROOT_STYLE, TITLE_USERS } from "../servers/consts";
import { SandboxProjectSettingsWarning } from "../settings/settings";
import { useProject } from "./common";

export function ProjectCollaboratorsPage(): JSX.Element {
  const { project_id, actions } = useProjectContext();
  const user_map = useTypedRedux("users", "user_map");
  const student = getStudentProjectFunctionality(project_id);
  const { project, group } = useProject(project_id);

  function renderSettings() {
    if (project == null) {
      return <Loading theme="medium" />;
    }
    return (
      <>
        <CurrentCollaboratorsPanel
          key="current-collabs"
          project={project}
          user_map={user_map}
        />
        {!student.disableCollaborators && (
          <SettingBox title="Add New Collaborators" icon="UserAddOutlined">
            <AddCollaborators
              project_id={project.get("project_id")}
              where="project-settings"
            />
          </SettingBox>
        )}
      </>
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
    <div
      style={{
        ...ROOT_STYLE,
        width: "1000px",
        maxWidth: "100%",
        margin: "auto",
      }}
    >
      <Title level={2}>
        <Icon name={ICON_USERS} /> {TITLE_USERS}
        <CloseX2 close={() => actions?.set_active_tab("home")} />
      </Title>
      <Paragraph>{COLLABS_INFO_TEXT}</Paragraph>
      {renderAdmin()}
      {renderSettings()}
    </div>
  );
}

export const COLLABS_INFO_TEXT =
  "Users (collaborators) are people who can access this project. They can view and edit the same files as you.";
