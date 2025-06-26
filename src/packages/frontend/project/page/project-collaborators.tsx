/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useIntl } from "react-intl";

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
import { getStudentProjectFunctionality } from "@cocalc/frontend/course";
import { labels } from "@cocalc/frontend/i18n";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { ICON_USERS, ROOT_STYLE } from "../servers/consts";
import { SandboxProjectSettingsWarning } from "../settings/settings";
import { useProject } from "./common";

export function ProjectCollaboratorsPage(): React.JSX.Element {
  const intl = useIntl();
  const { project_id } = useProjectContext();
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
    <div style={ROOT_STYLE}>
      <Title level={2}>
        <Icon name={ICON_USERS} /> {intl.formatMessage(labels.users)}
      </Title>
      <Paragraph>{intl.formatMessage(labels.collabs_info)}</Paragraph>
      {renderAdmin()}
      {renderSettings()}
    </div>
  );
}
