/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import ShowError from "@cocalc/frontend/components/error";
import { Alert, Button, Col, Flex, Modal, Row, Typography } from "antd";
import React, { useState } from "react";
import { useIntl } from "react-intl";

import {
  redux,
  useAsyncEffect,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  CopyToClipBoard,
  HelpIcon,
  Icon,
  LabeledRow,
  Paragraph,
  SettingBox,
  TextInput,
  TimeAgo,
} from "@cocalc/frontend/components";
import { avatar_fontcolor } from "@cocalc/frontend/account/avatar/font-color";
import { ColorPicker } from "@cocalc/frontend/colorpicker";
import { COLORS } from "@cocalc/util/theme";
import { labels } from "@cocalc/frontend/i18n";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import { ProjectsActions } from "@cocalc/frontend/todo-types";
import ProjectImage from "./image";
import { useBookmarkedProjects } from "@cocalc/frontend/projects/use-bookmarked-projects";

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
  const projectLabel = intl.formatMessage(labels.project);
  const projectLabelLower = projectLabel.toLowerCase();
  const projectsLabelLower = intl.formatMessage(labels.projects).toLowerCase();
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
  const [color, setColor] = useState<string | undefined>(
    project_map?.getIn([project_id, "color"]) as string | undefined,
  );
  const [showColorModal, setShowColorModal] = useState<boolean>(false);
  const [nextColor, setNextColor] = useState<string | undefined>(color);

  const { isProjectBookmarked, setProjectBookmarked } = useBookmarkedProjects();

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
          label={intl.formatMessage(labels.starred)}
          vertical={isFlyout}
          style={{ marginBottom: "15px" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Icon
                name={isProjectBookmarked(project_id) ? "star-filled" : "star"}
                style={{
                  color: isProjectBookmarked(project_id)
                    ? COLORS.STAR
                    : COLORS.GRAY,
                  fontSize: "18px",
                  cursor: "pointer",
                }}
                onClick={() =>
                  setProjectBookmarked(
                    project_id,
                    !isProjectBookmarked(project_id),
                  )
                }
              />
              <Typography.Text>
                {isProjectBookmarked(project_id) ? "Enabled" : "Disabled"}
              </Typography.Text>
            </div>
            <HelpIcon title={`${projectLabel} Starring`}>
              {intl.formatMessage(
                {
                  id: "project.settings.about-box.starred.help",
                  defaultMessage:
                    "Starred {projectsLabel} can be filtered by clicking the starred filter button in your {projectsLabel} list.",
                  description:
                    "Help text explaining how project starring works",
                },
                { projectsLabel: projectsLabelLower },
              )}
            </HelpIcon>
          </div>
        </LabeledRow>
        <LabeledRow
          label={intl.formatMessage({
            id: "project.settings.about-box.image.label",
            defaultMessage: "Image (optional)",
            description: "Optional picture (avatar) related to that project",
          })}
          vertical={isFlyout}
        >
          <div
            style={{ display: "flex", flexDirection: "column", gap: "10px" }}
          >
            <ProjectImage
              avatarImage={avatarImage}
              onChange={async (data) => {
                try {
                  await actions.setProjectImage(project_id, data);
                  setAvatarImage(data.full);
                } catch (err) {
                  setError(`Error saving ${projectLabelLower} image: ${err}`);
                }
              }}
            />
            {avatarImage && (
              <Button
                danger
                onClick={async () => {
                  try {
                    await actions.setProjectImage(project_id, {
                      full: "",
                      tiny: "",
                    });
                    setAvatarImage(undefined);
                  } catch (err) {
                    setError(`Error deleting ${projectLabelLower} image: ${err}`);
                  }
                }}
              >
                Delete Image
              </Button>
            )}
          </div>
        </LabeledRow>
        <LabeledRow
          label={intl.formatMessage({
            id: "project.settings.about-box.color.label",
            defaultMessage: "Color (optional)",
            description:
              "Optional color for visual identification of the project",
          })}
          vertical={isFlyout}
        >
          <div style={{ display: "flex", gap: "8px" }}>
            <Button
              size="small"
              style={{
                flex: 2,
                backgroundColor: color || "transparent",
                color: color ? avatar_fontcolor(color) : undefined,
                border: color ? "none" : undefined,
              }}
              onClick={() => {
                setNextColor(color);
                setShowColorModal(true);
              }}
            >
              {intl.formatMessage(
                {
                  id: "project.settings.about-box.color.button",
                  defaultMessage:
                    "{haveColor, select, true {Change Color} other {Select Color}}",
                  description: "Button label for changing the color",
                },
                { haveColor: !!color },
              )}
            </Button>
            {color && (
              <Button
                size="small"
                style={{ flex: 1 }}
                onClick={async () => {
                  try {
                    await actions.setProjectColor(project_id, "");
                    setColor(undefined);
                  } catch (err) {
                    setError(`Error removing project color: ${err}`);
                  }
                }}
              >
                {intl.formatMessage(labels.remove)}
              </Button>
            )}
          </div>
          <Modal
            title={intl.formatMessage(
              {
                id: "project.settings.about-box.color.modal.title",
                defaultMessage: "Select {projectLabel} Color",
                description:
                  "Title of modal dialog for selecting project color",
              },
              { projectLabel },
            )}
            open={showColorModal}
            okText={intl.formatMessage(labels.select)}
            onOk={async () => {
              try {
                await actions.setProjectColor(project_id, nextColor ?? "");
                setColor(nextColor);
                setShowColorModal(false);
              } catch (err) {
                setError(`Error saving ${projectLabelLower} color: ${err}`);
              }
            }}
            onCancel={() => {
              setShowColorModal(false);
              setNextColor(color);
            }}
          >
            <ColorPicker
              color={nextColor}
              justifyContent="flex-start"
              onChange={(value) => {
                setNextColor(value);
              }}
            />
          </Modal>
        </LabeledRow>
        {created && (
          <LabeledRow
            label={intl.formatMessage(labels.created)}
            vertical={isFlyout}
            style={{ marginBottom: "15px" }}
          >
            <TimeAgo date={created} />
          </LabeledRow>
        )}

        <LabeledRow
          key="project_id"
          label={`${projectLabel} ID`}
          vertical={isFlyout}
          style={{ marginTop: "15px" }}
        >
          {!isFlyout ? (
            <CopyToClipBoard
              inputWidth={"330px"}
              value={project_id}
              style={{ display: "inline-block", width: "100%", margin: 0 }}
            />
          ) : (
            <Paragraph
              copyable={{
                text: project_id,
                tooltips: [`Copy ${projectLabel} ID`, "Copied!"],
              }}
              code
              style={{ marginBottom: 0 }}
            >
              {project_id}
            </Paragraph>
          )}
        </LabeledRow>
      </>
    );
  }

  if (mode === "flyout") {
    return renderBody();
  } else {
    return (
      <SettingBox
        title={
          <Flex
            justify="space-between"
            align="center"
            wrap
            gap="10px"
            style={{ width: "100%" }}
          >
            {intl.formatMessage(labels.about)}
            <ProjectTitle project_id={project_id} noClick />
          </Flex>
        }
        icon="file-alt"
      >
        {renderBody()}
      </SettingBox>
    );
  }
};
