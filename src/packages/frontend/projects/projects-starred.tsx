/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Avatar, Button, Dropdown, Space, Tooltip } from "antd";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { CSS, useActions, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon, TimeAgo } from "@cocalc/frontend/components";
import { trunc } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { useBookmarkedProjects } from "./use-bookmarked-projects";
import { blendBackgroundColor, sortProjectsLastEdited } from "./util";

const DROPDOWN_WIDTH = 100; // Width reserved for dropdown button + buffer

const STARRED_BAR_STYLE: CSS = {
  overflow: "hidden",
} as const;

const STARRED_BUTTON_STYLE: CSS = {
  maxWidth: "200px",
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

    // Sort by last edited, newest first
    return projects.sort(sortProjectsLastEdited).reverse();
  }, [bookmarkedProjects, project_map]);

  // State for tracking how many projects can be shown
  const [visibleCount, setVisibleCount] = useState<number>(
    starredProjects.length,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const spaceRef = useRef<HTMLDivElement>(null);
  const buttonWidthsRef = useRef<number[]>([]);
  const [measurementComplete, setMeasurementComplete] = useState(false);

  // Reset measurement when projects change
  useLayoutEffect(() => {
    setMeasurementComplete(false);
    setVisibleCount(starredProjects.length);
  }, [starredProjects]);

  // Measure buttons on first render and when projects change
  useLayoutEffect(() => {
    if (
      !spaceRef.current ||
      starredProjects.length === 0 ||
      measurementComplete
    ) {
      return;
    }

    // Measure all button widths
    const buttons = spaceRef.current.querySelectorAll<HTMLElement>(
      ".starred-project-button",
    );

    if (buttons.length === starredProjects.length) {
      buttonWidthsRef.current = Array.from(buttons).map(
        (button) => button.offsetWidth,
      );
      setMeasurementComplete(true);
    }
  }, [starredProjects, measurementComplete]);

  // Calculate how many buttons fit based on measured widths
  useLayoutEffect(() => {
    if (
      !containerRef.current ||
      !measurementComplete ||
      buttonWidthsRef.current.length === 0
    ) {
      return;
    }

    const calculateVisibleCount = () => {
      if (!containerRef.current) return;
      const availableWidth = containerRef.current.offsetWidth - DROPDOWN_WIDTH;

      let cumulativeWidth = 0;
      let count = 0;

      for (let i = 0; i < buttonWidthsRef.current.length; i++) {
        const buttonWidth = buttonWidthsRef.current[i];
        // Account for Space component's gap (8px for "small" size)
        const spacing = i > 0 ? 8 : 0;
        cumulativeWidth += buttonWidth + spacing;

        if (cumulativeWidth <= availableWidth) {
          count++;
        } else {
          break;
        }
      }

      // Show at least 1 project if there's any space, or all if they all fit
      const newVisibleCount = count === 0 ? 1 : count;

      // Only show dropdown if there are actually hidden projects
      if (newVisibleCount >= starredProjects.length) {
        setVisibleCount(starredProjects.length);
      } else {
        setVisibleCount(newVisibleCount);
      }
    };

    // Initial calculation
    calculateVisibleCount();

    // Recalculate on resize
    const resizeObserver = new ResizeObserver(() => {
      calculateVisibleCount();
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, [measurementComplete, starredProjects.length]);

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

  // Split projects into visible and overflow
  const visibleProjects = starredProjects.slice(0, visibleCount);
  const overflowProjects = starredProjects.slice(visibleCount);

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

  // Helper to render a project button
  function renderProjectButton(project: any, showTooltip: boolean = true) {
    // Create background color with faint hint of project color
    const backgroundColor = blendBackgroundColor(project.color, "white", true);

    const buttonStyle = {
      ...STARRED_BUTTON_STYLE,
      backgroundColor,
    };

    const button = (
      <Button
        className="starred-project-button"
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
            handleProjectClick(project.project_id, e);
          }
        }}
      >
        {trunc(project.title, 20)}
      </Button>
    );

    if (!showTooltip) {
      return button;
    }

    return (
      <Tooltip
        key={project.project_id}
        title={renderTooltipContent(project)}
        placement="bottom"
      >
        {button}
      </Tooltip>
    );
  }

  // Create dropdown menu items for overflow projects
  const overflowMenuItems = overflowProjects.map((project) => ({
    key: project.project_id,
    label: (
      <div
        style={{ display: "flex", alignItems: "center", gap: "5px" }}
        onClick={(e) => handleProjectClick(project.project_id, e as any)}
      >
        {project.avatar_image_tiny ? (
          <Avatar src={project.avatar_image_tiny} size={20} />
        ) : (
          <Icon name="star-filled" style={{ color: COLORS.STAR }} />
        )}
        <span>{project.title}</span>
      </div>
    ),
  }));

  return (
    <div ref={containerRef} style={STARRED_BAR_STYLE}>
      <Space size="small" ref={spaceRef}>
        {/* Show all buttons during initial measurement, then only visible ones */}
        {(!measurementComplete ? starredProjects : visibleProjects).map(
          (project) => renderProjectButton(project),
        )}
        {measurementComplete && overflowProjects.length > 0 && (
          <Dropdown
            menu={{ items: overflowMenuItems }}
            placement="bottomRight"
            trigger={["click"]}
          >
            <Button icon={<Icon name="ellipsis" />}>
              +{overflowProjects.length}
            </Button>
          </Dropdown>
        )}
      </Space>
    </div>
  );
}
