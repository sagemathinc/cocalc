/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Avatar, Button, Space, Tooltip } from "antd";
import { useMemo } from "react";

import { CSS, useActions, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon, TimeAgo } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";
import { useBookmarkedProjects } from "./use-bookmarked-projects";
import { blendBackgroundColor } from "./util";

const STARRED_BAR_STYLE: CSS = {
  padding: "12px 0",
  marginBottom: "8px",
} as const;

const STARRED_BUTTON_STYLE: CSS = {
  maxWidth: "200px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

export function StarredProjectsBar() {
  const actions = useActions("projects");
  const { bookmarkedProjects } = useBookmarkedProjects();
  const project_map = useTypedRedux("projects", "project_map");

  // Get starred projects sorted by title
  const starredProjects = useMemo(() => {
    if (!bookmarkedProjects || !project_map) return [];

    const projects = bookmarkedProjects
      .map((project_id) => {
        const project = project_map.get(project_id);
        if (!project) return null;
        return {
          project_id,
          title: project.get("title") ?? "Untitled",
          description: project.get("description") ?? "",
          last_edited: project.get("last_edited"),
          state: project.get("state"),
          avatar_image_tiny: project.get("avatar_image_tiny"),
          users: project.get("users"),
          color: project.get("color"),
        };
      })
      .filter((p) => p != null);

    // Sort by title
    return projects.sort((a, b) => {
      const titleA = a.title.toLowerCase();
      const titleB = b.title.toLowerCase();
      return titleA.localeCompare(titleB);
    });
  }, [bookmarkedProjects, project_map]);

  const handleProjectClick = (
    project_id: string,
    e: React.MouseEvent<HTMLElement>,
  ) => {
    e.preventDefault();
    const switch_to = !(e.button === 1 || e.ctrlKey || e.metaKey);
    actions.open_project({ project_id, switch_to });
  };

  if (!starredProjects || starredProjects.length === 0) {
    return null; // Hide bar if no starred projects
  }

  const renderTooltipContent = (project: any) => {
    return (
      <div style={{ maxWidth: "300px" }}>
        <div style={{ fontWeight: 500, marginBottom: "4px" }}>
          {project.title}
        </div>
        {project.description && (
          <div
            style={{
              color: COLORS.GRAY_L,
              marginBottom: "8px",
              fontSize: "12px",
            }}
          >
            {project.description}
          </div>
        )}
        <div style={{ fontSize: "12px", color: COLORS.GRAY_L }}>
          <div>
            <TimeAgo date={project.last_edited} />
          </div>
          {project.state && (
            <div style={{ marginTop: "4px" }}>
              <Icon name="server" /> {project.state?.get("state") ?? "stopped"}
            </div>
          )}
        </div>
      </div>
    );
  };

  const truncateTitle = (title: string, maxLength: number = 20) => {
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength) + "...";
  };

  return (
    <div style={STARRED_BAR_STYLE}>
      <Space wrap size="small">
        {starredProjects.map((project) => {
          // Create background color with faint hint of project color
          const backgroundColor = blendBackgroundColor(
            project.color,
            "white",
            true,
          );

          const buttonStyle = {
            ...STARRED_BUTTON_STYLE,
            backgroundColor,
          };

          return (
            <Tooltip
              key={project.project_id}
              title={renderTooltipContent(project)}
              placement="bottom"
            >
              <Button
                style={buttonStyle}
                icon={
                  project.avatar_image_tiny ? (
                    <Avatar src={project.avatar_image_tiny} size={20} />
                  ) : (
                    <Icon name="star-filled" style={{ color: COLORS.STAR }} />
                  )
                }
                onClick={(e) => handleProjectClick(project.project_id, e)}
                onMouseDown={(e) => {
                  // Support middle-click
                  if (e.button === 1) {
                    handleProjectClick(project.project_id, e as any);
                  }
                }}
              >
                {truncateTitle(project.title)}
              </Button>
            </Tooltip>
          );
        })}
      </Space>
    </div>
  );
}
