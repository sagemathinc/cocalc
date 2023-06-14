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
  Icon,
  Loading,
  Paragraph,
  SettingBox,
  Title,
} from "@cocalc/frontend/components";
import { getStudentProjectFunctionality } from "../../course";
import {
  ICON_COLLABORATORS,
  ROOT_STYLE,
  TITLE_COLLABORATORS,
} from "../servers/consts";
import { useProject } from "./common";

export function ProjectCollaboratorsPage({ project_id }): JSX.Element {
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
          <SettingBox title="Add new collaborators" icon="UserAddOutlined">
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

  return (
    <div style={ROOT_STYLE}>
      <Title level={2}>
        <Icon name={ICON_COLLABORATORS} /> {TITLE_COLLABORATORS}
      </Title>
      <Paragraph>
        Collaborators are people who can access this project. They can view and
        edit the same files as you.
      </Paragraph>
      {renderAdmin()}
      {renderSettings()}
    </div>
  );
}
