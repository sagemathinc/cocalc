/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Avatar, Button, Dropdown, Space, Tooltip } from "antd";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";

import { CSS, useActions, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon, TimeAgo } from "@cocalc/frontend/components";
import { sha1, trunc } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { useBookmarkedProjects } from "./use-bookmarked-projects";

const DROPDOWN_WIDTH = 100; // Width reserved for dropdown button + buffer

const STARRED_BAR_STYLE: CSS = {
  overflow: "hidden",
  overflowX: "hidden",
  width: "100%",
  position: "relative",
} as const;

const STARRED_BUTTON_STYLE: CSS = {
  maxWidth: "200px",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

function DraggableProjectButton({
  project,
  showTooltip = true,
  visibility,
  isOverlay = false,
  onProjectClick,
  renderTooltipContent,
}: {
  project: any;
  showTooltip?: boolean;
  visibility?: "hidden" | "visible";
  isOverlay?: boolean;
  onProjectClick: (
    project_id: string,
    e: React.MouseEvent<HTMLElement>,
  ) => void;
  renderTooltipContent: (project: any) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useSortable({ id: project.project_id });

  const buttonStyle = {
    ...STARRED_BUTTON_STYLE,
    ...(project.color && { borderColor: project.color, borderWidth: 2 }),
    ...(visibility && { visibility }),
    ...(isDragging && !isOverlay && { opacity: 0.5 }),
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
  } as const;

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
      onClick={(e) => onProjectClick(project.project_id, e)}
      onMouseDown={(e) => {
        // Support middle-click
        if (e.button === 1) {
          onProjectClick(project.project_id, e);
        }
      }}
      {...attributes}
      {...listeners}
      ref={setNodeRef}
    >
      {trunc(project.title, 15)}
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

export function StarredProjectsBar() {
  const actions = useActions("projects");
  const { bookmarkedProjects, setBookmarkedProjectsOrder } =
    useBookmarkedProjects();
  const project_map = useTypedRedux("projects", "project_map");

  // Get starred projects in bookmarked order (newest bookmarked first)
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
          avatar_image_tiny: project.get("avatar_image_tiny"),
          color: project.get("color"),
        };
      })
      .filter((p) => p != null);

    // Return projects in their bookmarked order
    return projects;
  }, [bookmarkedProjects, project_map]);

  // Hash only the fields that impact layout so we can avoid unnecessary re-measurements.
  const layoutKey = useMemo(() => {
    if (starredProjects.length === 0) {
      return "";
    }
    const signature = starredProjects
      .map((project) =>
        [
          project.project_id,
          project.title,
          project.color ?? "",
          project.avatar_image_tiny ?? "",
        ].join("|"),
      )
      .join("::");
    return sha1(signature);
  }, [starredProjects]);

  // Drag and drop sensors
  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: { distance: 5 }, // 5px to activate drag
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 100, tolerance: 5 },
  });
  const sensors = useSensors(mouseSensor, touchSensor);

  // State for tracking how many projects can be shown
  const [visibleCount, setVisibleCount] = useState<number>(0);
  const [measurementPhase, setMeasurementPhase] = useState<boolean>(true);
  const [containerHeight, setContainerHeight] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const spaceRef = useRef<HTMLDivElement>(null);
  const measurementContainerRef = useRef<HTMLDivElement>(null);
  const buttonWidthsRef = useRef<number[]>([]);

  // Calculate how many buttons fit based on measured widths
  const calculateVisibleCount = useCallback(() => {
    if (!containerRef.current) return;

    // First pass: measure without dropdown space
    let cumulativeWidth = 0;
    let countWithoutDropdown = 0;

    for (let i = 0; i < buttonWidthsRef.current.length; i++) {
      const buttonWidth = buttonWidthsRef.current[i];
      const spacing = i > 0 ? 8 : 0;
      cumulativeWidth += buttonWidth + spacing;

      if (cumulativeWidth <= containerRef.current.offsetWidth) {
        countWithoutDropdown++;
      } else {
        break;
      }
    }

    // If all projects fit, no dropdown needed
    if (countWithoutDropdown >= starredProjects.length) {
      setVisibleCount(starredProjects.length);
      return;
    }

    // If not all fit, recalculate with dropdown space reserved
    const availableWidth = containerRef.current.offsetWidth - DROPDOWN_WIDTH;
    cumulativeWidth = 0;
    let countWithDropdown = 0;

    for (let i = 0; i < buttonWidthsRef.current.length; i++) {
      const buttonWidth = buttonWidthsRef.current[i];
      const spacing = i > 0 ? 8 : 0;
      cumulativeWidth += buttonWidth + spacing;

      if (cumulativeWidth <= availableWidth) {
        countWithDropdown++;
      } else {
        break;
      }
    }

    // Show at least 1 project, or all if they fit
    const finalCount = countWithDropdown === 0 ? 1 : countWithDropdown;

    // Only update state if the value actually changed
    setVisibleCount((prev) => (prev !== finalCount ? finalCount : prev));
  }, [starredProjects.length]);

  // Reset measurement phase when projects change
  useLayoutEffect(() => {
    setMeasurementPhase(true);
    setVisibleCount(0);
  }, [layoutKey]);

  // Measure button widths from hidden container and calculate visible count
  useLayoutEffect(() => {
    if (!measurementPhase || starredProjects.length === 0) {
      return;
    }

    // Use requestAnimationFrame to ensure buttons are fully laid out before measuring
    const frameId = requestAnimationFrame(() => {
      if (!measurementContainerRef.current) {
        setMeasurementPhase(false);
        return;
      }

      const buttons =
        measurementContainerRef.current.querySelectorAll<HTMLElement>(
          ".starred-project-button",
        );

      // Capture the height of the measurement container to prevent height collapse
      const height = measurementContainerRef.current.offsetHeight;
      if (height > 0) {
        setContainerHeight(height);
      }

      if (buttons && buttons.length === starredProjects.length) {
        buttonWidthsRef.current = Array.from(buttons).map(
          (button) => button.offsetWidth,
        );
        // Calculate visible count immediately after measuring
        calculateVisibleCount();
      } else {
        // If measurement failed, show all projects
        setVisibleCount(starredProjects.length);
      }

      // Always exit measurement phase once we've attempted to measure
      setMeasurementPhase(false);
    });

    return () => cancelAnimationFrame(frameId);
  }, [starredProjects, calculateVisibleCount, measurementPhase]);

  // Set up ResizeObserver to recalculate visible count on container resize
  useLayoutEffect(() => {
    if (!containerRef.current || buttonWidthsRef.current.length === 0) {
      return;
    }

    // Recalculate on resize with debounce to prevent flicker
    let timeoutId: NodeJS.Timeout;
    const resizeObserver = new ResizeObserver(() => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(calculateVisibleCount, 16); // ~60fps
    });

    resizeObserver.observe(containerRef.current);
    return () => {
      resizeObserver.disconnect();
      clearTimeout(timeoutId);
    };
  }, [calculateVisibleCount]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (!over || active.id === over.id) {
        return;
      }

      // Find the indices of the dragged and target items
      const activeIndex = starredProjects.findIndex(
        (p) => p.project_id === active.id,
      );
      const overIndex = starredProjects.findIndex(
        (p) => p.project_id === over.id,
      );

      if (activeIndex === -1 || overIndex === -1) {
        return;
      }

      // Create new ordered list
      const newProjects = [...starredProjects];
      const [movedProject] = newProjects.splice(activeIndex, 1);
      newProjects.splice(overIndex, 0, movedProject);

      // Update bookmarked projects with new order
      const newBookmarkedOrder = newProjects.map((p) => p.project_id);
      setBookmarkedProjectsOrder(newBookmarkedOrder);
    },
    [starredProjects, setBookmarkedProjectsOrder],
  );

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

  // Get overflow projects for the dropdown menu
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
          <TimeAgo date={project.last_edited} />
        </div>
      </div>
    );
  };

  // Create dropdown menu items for overflow projects
  const overflowMenuItems = overflowProjects.map((project) => ({
    key: project.project_id,
    label: (
      <div
        style={{
          alignItems: "center",
          display: "flex",
          borderLeft: `5px solid ${
            project.color ? project.color : "transparent"
          }`,
        }}
        onClick={(e) => {
          e.stopPropagation();
          handleProjectClick(project.project_id, e as any);
        }}
      >
        <span
          style={{
            maxWidth: "50vw",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            paddingLeft: "5px",
          }}
        >
          {project.avatar_image_tiny ? (
            <Avatar src={project.avatar_image_tiny} size={20} />
          ) : (
            <Icon name="star-filled" style={{ color: COLORS.STAR }} />
          )}{" "}
          {project.title}
        </span>
      </div>
    ),
  }));

  // Get all project IDs for SortableContext
  const allProjectIds = starredProjects.map((p) => p.project_id);

  return (
    <DndContext onDragEnd={handleDragEnd} sensors={sensors}>
      <SortableContext
        items={allProjectIds}
        strategy={horizontalListSortingStrategy}
      >
        <div
          ref={containerRef}
          style={{
            ...STARRED_BAR_STYLE,
            minHeight: containerHeight > 0 ? `${containerHeight}px` : undefined,
          }}
        >
          {/* Hidden measurement container - rendered off-screen so it doesn't cause visual flicker */}
          {measurementPhase && (
            <div
              ref={measurementContainerRef}
              style={{
                position: "fixed",
                visibility: "hidden",
                width: containerRef.current?.offsetWidth ?? "100%",
                display: "flex",
                gap: "8px",
                pointerEvents: "none",
                top: -9999,
                left: -9999,
              }}
            >
              {starredProjects.map((project) => (
                <DraggableProjectButton
                  key={project.project_id}
                  project={project}
                  showTooltip={false}
                  visibility="visible"
                  onProjectClick={handleProjectClick}
                  renderTooltipContent={renderTooltipContent}
                />
              ))}
            </div>
          )}

          {/* Actual visible content - only rendered after measurement phase */}
          <Space size="small" ref={spaceRef}>
            {!measurementPhase && (
              <>
                {starredProjects.slice(0, visibleCount).map((project) => (
                  <DraggableProjectButton
                    key={project.project_id}
                    project={project}
                    showTooltip={true}
                    onProjectClick={handleProjectClick}
                    renderTooltipContent={renderTooltipContent}
                  />
                ))}
                {/* Show overflow dropdown if there are hidden projects */}
                {overflowProjects.length > 0 && (
                  <Dropdown
                    menu={{ items: overflowMenuItems }}
                    placement="bottomRight"
                    trigger={["click"]}
                  >
                    <Button
                      icon={<Icon name="ellipsis" />}
                      style={{ backgroundColor: "white", marginLeft: "auto" }}
                    >
                      +{overflowProjects.length}
                    </Button>
                  </Dropdown>
                )}
              </>
            )}
          </Space>
        </div>
      </SortableContext>
    </DndContext>
  );
}
