/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Expanded row content for the Projects Table
 *
 * Shows additional project details when a row is expanded:
 * - Collaborators
 * - Project ID (copyable)
 * - Software image
 * - Project state
 * - Action buttons
 */

import { Button, Descriptions, Dropdown, MenuProps, Space } from "antd";
import { useState } from "react";
import { useIntl } from "react-intl";

import {
  redux,
  useActions,
  useRedux,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import useAppContext from "@cocalc/frontend/app/use-context";
import { AddCollaborators } from "@cocalc/frontend/collaborators";
import {
  CopyToClipBoard,
  Icon,
  ProjectState,
  TimeAgo,
} from "@cocalc/frontend/components";
import {
  compute_image2basename,
  is_custom_image,
} from "@cocalc/frontend/custom-software/util";
import { labels } from "@cocalc/frontend/i18n";
import { FIXED_PROJECT_TABS } from "@cocalc/frontend/project/page/file-tab";
import { useStarredFilesManager } from "@cocalc/frontend/project/page/flyouts/store";
import { RestartProject } from "@cocalc/frontend/project/settings/restart-project";
import { StopProject } from "@cocalc/frontend/project/settings/stop-project";
import { DEFAULT_COMPUTE_IMAGE } from "@cocalc/util/db-schema";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";
import { COLORS } from "@cocalc/util/theme";
import { ProjectUsers } from "./project-users";
import {
  OpenedFile,
  useFilesMenuItems,
  useRecentFiles,
  useServersMenuItems,
} from "./util";

interface Props {
  project_id: string;
}

export function ProjectRowExpandedContent({ project_id }: Props) {
  const { displayI18N } = useAppContext();
  const [show_add_collab, set_show_add_collab] = useState<boolean>(false);
  const intl = useIntl();

  const actions = useActions("projects");
  const project = useRedux(["projects", "project_map", project_id]);
  const images = useTypedRedux("compute_images", "images");
  const kucalc = useTypedRedux("customize", "kucalc");
  const software = useTypedRedux("customize", "software");
  const is_anonymous = useTypedRedux("account", "is_anonymous");
  const project_log = useTypedRedux({ project_id }, "project_log");

  // Get recent files - always enabled since component only renders when expanded
  const recentFiles: OpenedFile[] = useRecentFiles(project_log, 100);

  // Get starred files - always enabled since component only renders when expanded
  const { starred } = useStarredFilesManager(project_id, true);

  const starredFilesMenu: MenuProps["items"] = useFilesMenuItems(starred, {
    emptyLabel: "No starred files",
    onClick: openFile,
  });

  const recentFilesMenu: MenuProps["items"] = useFilesMenuItems(recentFiles, {
    emptyLabel: "No recent files",
    onClick: openFile,
  });

  // Get available servers/apps
  const serversMenu: MenuProps["items"] = useServersMenuItems(project_id);

  if (!project) {
    return null;
  }

  const color = project.get("color");

  function openProjectSettings() {
    actions.open_project({
      project_id,
      switch_to: true,
      target: "settings",
    });
  }

  function openProjectTab(tab: string) {
    actions.open_project({
      project_id,
      switch_to: true,
      target: tab,
    });
  }

  function openFile(path: string) {
    const project_actions = redux.getProjectActions(project_id);
    if (project_actions) {
      project_actions.open_file({ path });
    }
  }

  function renderSoftwareImage() {
    const ci = project.get("compute_image");
    if (ci == null || images == null) return "Default";

    if (is_custom_image(ci)) {
      const id = compute_image2basename(ci);
      const img = images.get(id);
      if (img == null) return ci;
      const name = img.get("display");
      return (
        <span>
          {name}{" "}
          <span
            style={{ color: COLORS.GRAY }}
            title="Custom image created by a third party"
          >
            (custom)
          </span>
        </span>
      );
    } else {
      if (ci === DEFAULT_COMPUTE_IMAGE) return "Default";
      const name = software?.getIn(["environments", ci, "title"]) ?? ci;
      const descr = software?.getIn(["environments", ci, "descr"]) ?? "";
      return (
        <span title={descr}>
          {name}
          {kucalc === KUCALC_COCALC_COM && (
            <span
              style={{ color: COLORS.GRAY, marginLeft: "4px" }}
              title="Official image created by CoCalc"
            >
              (official)
            </span>
          )}
        </span>
      );
    }
  }

  function renderCollaborators() {
    if (is_anonymous) return null;

    return (
      <div>
        <div style={{ marginBottom: "8px" }}>
          <ProjectUsers
            project={project}
            none={<span>No collaborators</span>}
          />
        </div>
        {show_add_collab ? (
          <AddCollaborators
            project_id={project_id}
            autoFocus
            where="projects-table-expanded"
          />
        ) : (
          <Button
            size="small"
            onClick={() => set_show_add_collab(true)}
            icon={<Icon name="user-plus" />}
          >
            Add Collaborator
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        margin: "0 0 15px 0",
        padding: "0",
        borderRadius: "0 0 5px 5px",
        borderLeft: `5px solid ${color ? color : "transparent"}`,
      }}
    >
      <style>
        {`
          .cc-expanded-starred-dropdown,
          .cc-expanded-recent-dropdown,
          .cc-expanded-apps-dropdown {
            max-height: 50vh;
            overflow-y: auto;
          }
          .cc-projects-row-expand-descriptions .ant-descriptions-view {
            border: none !IMPORTANT;
            border-radius: 0;
          }
        `}
      </style>
      <Descriptions
        column={3}
        size="small"
        bordered
        layout="vertical"
        style={{ margin: 0 }}
        className={"cc-projects-row-expand-descriptions"}
      >
        <Descriptions.Item label={intl.formatMessage(labels.open)} span={3}>
          <Space>
            <Button
              type="text"
              size="small"
              onClick={() => openProjectTab("files")}
              icon={<Icon name={FIXED_PROJECT_TABS.files.icon} />}
            >
              {intl.formatMessage(labels.explorer)}
            </Button>
            <Dropdown
              menu={{
                items: starredFilesMenu,
                className: "cc-expanded-starred-dropdown",
              }}
              trigger={["click"]}
              placement="bottomLeft"
            >
              <Button
                type="text"
                size="small"
                icon={<Icon name="star-filled" />}
              >
                Starred <Icon name="caret-down" />
              </Button>
            </Dropdown>
            <Dropdown
              menu={{
                items: recentFilesMenu,
                className: "cc-expanded-recent-dropdown",
              }}
              trigger={["click"]}
              placement="bottomLeft"
            >
              <Button
                type="text"
                size="small"
                icon={<Icon name="history" />}
                onClick={(e) => {
                  e.stopPropagation();
                  // Initialize project_log if not loaded
                  if (project_log == null) {
                    redux.getProjectStore(project_id).init_table("project_log");
                  }
                }}
              >
                {intl.formatMessage(labels.recent)} <Icon name="caret-down" />
              </Button>
            </Dropdown>
            <Dropdown
              menu={{
                items: serversMenu,
                className: "cc-expanded-apps-dropdown",
              }}
              trigger={["click"]}
              placement="bottomLeft"
            >
              <Button type="text" size="small" icon={<Icon name="server" />}>
                Apps <Icon name="caret-down" />
              </Button>
            </Dropdown>
            <Button
              type="text"
              size="small"
              onClick={() => openProjectTab("new")}
              icon={<Icon name={FIXED_PROJECT_TABS.new.icon} />}
            >
              {intl.formatMessage(labels.new)}
            </Button>
            <Button
              type="text"
              size="small"
              onClick={() => openProjectTab("log")}
              icon={<Icon name={FIXED_PROJECT_TABS.log.icon} />}
            >
              {displayI18N(FIXED_PROJECT_TABS.log.label)}
            </Button>
            <Button
              type="text"
              size="small"
              onClick={() => openProjectTab("users")}
              icon={<Icon name={FIXED_PROJECT_TABS.users.icon} />}
            >
              {displayI18N(FIXED_PROJECT_TABS.users.label)}
            </Button>
            <Button
              type="text"
              size="small"
              onClick={() => openProjectTab("servers")}
              icon={<Icon name={FIXED_PROJECT_TABS.servers.icon} />}
            >
              {displayI18N(FIXED_PROJECT_TABS.servers.label)}
            </Button>
            <Button
              type="text"
              size="small"
              onClick={openProjectSettings}
              icon={<Icon name={FIXED_PROJECT_TABS.settings.icon} />}
            >
              {displayI18N(FIXED_PROJECT_TABS.settings.label)}
            </Button>
          </Space>
        </Descriptions.Item>
        <Descriptions.Item label="Created">
          {project.get("created") ? (
            <TimeAgo date={project.get("created")} />
          ) : (
            <span style={{ color: COLORS.GRAY }}>Unknown</span>
          )}
        </Descriptions.Item>
        <Descriptions.Item label="Last Edited">
          {project.get("last_edited") ? (
            <TimeAgo date={project.get("last_edited")} />
          ) : (
            <span style={{ color: COLORS.GRAY }}>Never</span>
          )}
        </Descriptions.Item>
        <Descriptions.Item label={intl.formatMessage(labels.state)}>
          <ProjectState state={project.get("state")} />{" "}
          <Space.Compact>
            <RestartProject project_id={project_id} size="small" />
            <StopProject
              project_id={project_id}
              disabled={project.getIn(["state", "state"]) !== "running"}
              size="small"
            />
          </Space.Compact>
        </Descriptions.Item>

        {!is_anonymous && (
          <>
            <Descriptions.Item
              label={intl.formatMessage(labels.collaborators)}
              span={3}
            >
              {renderCollaborators()}
            </Descriptions.Item>
          </>
        )}

        <Descriptions.Item label="Software Image" span={2}>
          {renderSoftwareImage()}
        </Descriptions.Item>
        <Descriptions.Item label="Project ID">
          <CopyToClipBoard
            value={project_id}
            display={`${project_id.slice(0, 20)}...`}
            inputStyle={{ fontSize: "11px" }}
          />
        </Descriptions.Item>
      </Descriptions>
    </div>
  );
}
