/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useIntl } from "react-intl";
import AdminWarning from "@cocalc/frontend/project/page/admin-warning";
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
import { Alert } from "antd";
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
  const accountCustomize = useTypedRedux("account", "customize")?.toJS() as
    | { disableCollaborators?: boolean }
    | undefined;
  const student = getStudentProjectFunctionality(project_id);
  const { project, group } = useProject(project_id);
  const disableCollaborators =
    accountCustomize?.disableCollaborators || student.disableCollaborators;

  function renderSettings() {
    if (project == null) {
      return <Loading theme="medium" />;
    }
    if (disableCollaborators) {
      return (
        <Alert
          type="warning"
          showIcon
          message="Collaborator configuration is disabled."
        />
      );
    }
    return (
      <>
        <CurrentCollaboratorsPanel
          key="current-collabs"
          project={project}
          user_map={user_map}
        />
        <SettingBox title="Add New Collaborators" icon="UserAddOutlined">
          <AddCollaborators
            project_id={project.get("project_id")}
            where="project-settings"
          />
        </SettingBox>
      </>
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
        <Icon name={ICON_USERS} /> {intl.formatMessage(labels.users)}
      </Title>
      <Paragraph>{intl.formatMessage(labels.collabs_info)}</Paragraph>
      {renderAdmin()}
      {renderSettings()}
    </div>
  );
}
