/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert, Col, Row, Typography } from "antd";
import React, { useEffect, useState } from "react";

import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import {
  LabeledRow,
  SettingBox,
  TextInput,
  TimeAgo,
} from "@cocalc/frontend/components";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import { ProjectsActions } from "@cocalc/frontend/todo-types";
import ProjectImage from "./image";

interface Props {
  project_title: string;
  project_id: string;
  name?: string;
  description: string;
  created?: Date;
  actions: ProjectsActions;
  mode?: "project" | "flyout";
}

export const AboutBox: React.FC<Props> = (props: Readonly<Props>) => {
  const {
    name,
    project_title,
    project_id,
    description,
    created,
    actions,
    mode = "project",
  } = props;
  const isFlyout = mode === "flyout";
  const [showNameInfo, setShowNameInfo] = useState<boolean>(false);
  const project_map = useTypedRedux("projects", "project_map");
  const courseProjectType = project_map?.getIn([
    project_id,
    "course",
    "type",
  ]) as any;
  const hasReadonlyFields = ["student", "shared"].includes(courseProjectType);
  const [error, setError] = useState<string>("");
  const [avatarImage, setAvatarImage] = useState<string | undefined>(undefined);

  useEffect(() => {
    (async () => {
      setAvatarImage(
        await redux.getStore("projects").getProjectAvatarImage(project_id)
      );
    })();
  }, []);

  function renderReadonly() {
    if (!hasReadonlyFields) return;
    return (
      <Row>
        <Col span={24}>
          <Typography.Text type="secondary" italic>
            Title and Description are controlled by the course managers in the
            course configuration tab.
          </Typography.Text>
        </Col>
      </Row>
    );
  }

  function renderBody() {
    return (
      <>
        {error && (
          <Alert
            banner={isFlyout}
            showIcon={!isFlyout}
            style={{ marginBottom: "15px" }}
            type="error"
            message={error}
          />
        )}
        {renderReadonly()}
        <LabeledRow label="Title" vertical={isFlyout}>
          <TextInput
            text={project_title}
            disabled={hasReadonlyFields}
            on_change={(title) => actions.set_project_title(project_id, title)}
          />
        </LabeledRow>
        <LabeledRow label="Description (markdown)" vertical={isFlyout}>
          <TextInput
            type="textarea"
            rows={2}
            text={description}
            disabled={hasReadonlyFields}
            on_change={(desc) =>
              actions.set_project_description(project_id, desc)
            }
          />
        </LabeledRow>
        <LabeledRow label="Name (optional)" vertical={isFlyout}>
          <TextInput
            type="textarea"
            rows={1}
            text={name ?? ""}
            on_change={(name) => actions.set_project_name(project_id, name)}
            onFocus={() => setShowNameInfo(true)}
            onBlur={() => setShowNameInfo(false)}
          />
          {showNameInfo && (
            <Alert
              style={{ margin: "15px 0" }}
              message={
                "The project name is currently only used to provide better URL's for publicly shared documents. It can be at most 100 characters long and must be unique among all projects you own. Only the project owner can change the project name.  To be useful, the owner should also set their username in Account Preferences." +
                (name
                  ? " TEMPORARY WARNING: If you change the project name, existing links using the previous name will no longer work, so change with caution."
                  : "")
              }
              type="info"
            />
          )}
        </LabeledRow>
        <LabeledRow label="Image (optional)" vertical={isFlyout}>
          <ProjectImage
            avatarImage={avatarImage}
            onChange={async (data) => {
              try {
                await actions.setProjectImage(project_id, data);
                setAvatarImage(data.full);
              } catch (err) {
                setError(`Error saving project image: ${err}`);
              }
            }}
          />
        </LabeledRow>
        {created && (
          <LabeledRow label="Created" vertical={isFlyout}>
            <TimeAgo date={created} />
          </LabeledRow>
        )}
      </>
    );
  }

  if (mode === "flyout") {
    return renderBody();
  } else {
    return (
      <SettingBox
        title={
          <>
            About{" "}
            <ProjectTitle
              style={{ float: "right" }}
              project_id={project_id}
              noClick
            />
          </>
        }
        icon="file-alt"
      >
        {renderBody()}
      </SettingBox>
    );
  }
};
