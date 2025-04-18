/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import ShowError from "@cocalc/frontend/components/error";
import { Alert, Col, Row, Typography } from "antd";
import React, { useState } from "react";
import { useIntl } from "react-intl";
import {
  redux,
  useAsyncEffect,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  LabeledRow,
  SettingBox,
  TextInput,
  TimeAgo,
} from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
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
  const intl = useIntl();
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

  useAsyncEffect(async () => {
    setAvatarImage(
      await redux.getStore("projects").getProjectAvatarImage(project_id),
    );
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
        <ShowError error={error} setError={setError} />
        {renderReadonly()}
        <LabeledRow
          label={intl.formatMessage({
            id: "project.settings.about-box.title.label",
            defaultMessage: "Title",
            description: "Title of the given project",
          })}
          vertical={isFlyout}
        >
          <TextInput
            style={{ width: "100%" }}
            text={project_title}
            disabled={hasReadonlyFields}
            on_change={async (title) => {
              try {
                await actions.set_project_title(project_id, title);
              } catch (err) {
                setError(`${err}`);
              }
            }}
          />
        </LabeledRow>
        <LabeledRow
          label={intl.formatMessage({
            id: "project.settings.about-box.description.label",
            defaultMessage: "Description (markdown)",
            description:
              "Optional description of that project, which could be markdown formatted text",
          })}
          vertical={isFlyout}
        >
          <TextInput
            style={{ width: "100%" }}
            type="textarea"
            rows={2}
            text={description}
            disabled={hasReadonlyFields}
            on_change={async (desc) => {
              try {
                await actions.set_project_description(project_id, desc);
              } catch (err) {
                setError(`${err}`);
              }
            }}
          />
        </LabeledRow>
        <LabeledRow
          label={intl.formatMessage({
            id: "project.settings.about-box.name.label",
            defaultMessage: "Name (optional)",
            description: "Optional name of that project",
          })}
          vertical={isFlyout}
        >
          <TextInput
            style={{ width: "100%" }}
            type="textarea"
            rows={1}
            text={name ?? ""}
            on_change={async (name) => {
              try {
                await actions.set_project_name(project_id, name);
              } catch (err) {
                setError(`${err}`);
              }
            }}
            onFocus={() => setShowNameInfo(true)}
            onBlur={() => setShowNameInfo(false)}
          />
        </LabeledRow>
        {showNameInfo ? (
          <Alert
            style={{ margin: "0 0 15px 0" }}
            showIcon={false}
            banner={isFlyout}
            message={
              "The project name is currently only used to provide better URL's for publicly shared documents. It can be at most 100 characters long and must be unique among all projects you own. Only the project owner can change the project name.  To be useful, the owner should also set their username in Account Preferences." +
              (name
                ? " TEMPORARY WARNING: If you change the project name, existing links using the previous name will no longer work, so change with caution."
                : "")
            }
            type="info"
          />
        ) : undefined}
        <LabeledRow
          label={intl.formatMessage({
            id: "project.settings.about-box.image.label",
            defaultMessage: "Image (optional)",
            description: "Optional picture (avatar) related to that project",
          })}
          vertical={isFlyout}
        >
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
          <LabeledRow
            label={intl.formatMessage(labels.created)}
            vertical={isFlyout}
          >
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
            {intl.formatMessage(labels.about)}{" "}
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
