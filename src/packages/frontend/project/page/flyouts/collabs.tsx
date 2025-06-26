/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert } from "antd";
import { useIntl } from "react-intl";

import { useTypedRedux } from "@cocalc/frontend/app-framework";
import {
  AddCollaborators,
  CurrentCollaboratorsPanel,
} from "@cocalc/frontend/collaborators";
import { Icon, Loading, Paragraph, Title } from "@cocalc/frontend/components";
import { getStudentProjectFunctionality } from "@cocalc/frontend/course";
import { labels } from "@cocalc/frontend/i18n";
import { useProject } from "../common";

interface CollabsProps {
  project_id: string;
  wrap: Function;
}

export function CollabsFlyout({ project_id, wrap }: CollabsProps): React.JSX.Element {
  const intl = useIntl();
  const user_map = useTypedRedux("users", "user_map");
  const student = getStudentProjectFunctionality(project_id);
  const { project, group } = useProject(project_id);

  function renderSettings() {
    if (project == null) {
      return <Loading theme="medium" transparent />;
    }
    return wrap(
      <>
        <CurrentCollaboratorsPanel
          key="current-collabs"
          project={project}
          user_map={user_map}
          mode="flyout"
        />
        {!student.disableCollaborators && (
          <>
            <br />
            <Title level={3}>
              <Icon name="UserAddOutlined" /> Add New Collaborators
            </Title>
            <AddCollaborators
              project_id={project.get("project_id")}
              where="project-settings"
              mode="flyout"
            />
          </>
        )}
      </>,
    );
  }

  function renderAdmin() {
    if (group !== "admin") return;
    return (
      <Alert
        type="warning"
        banner
        closable
        showIcon={false}
        message={
          <h4>
            <strong>
              Warning: you are editing the project settings as an administrator.
            </strong>
          </h4>
        }
      />
    );
  }

  return (
    <>
      <Paragraph
        type="secondary"
        ellipsis={{ rows: 1, expandable: true, symbol: "more" }}
      >
        {intl.formatMessage(labels.collabs_info)}
      </Paragraph>
      {renderAdmin()}
      {renderSettings()}
    </>
  );
}
