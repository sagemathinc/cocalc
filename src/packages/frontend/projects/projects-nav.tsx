/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { TabsProps } from "antd";
import { Avatar, Popover, Tabs, Tooltip } from "antd";
import { CSSProperties, useMemo, useState } from "react";

import {
  CSS,
  redux,
  useActions,
  useRedux,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { set_window_title } from "@cocalc/frontend/browser";
import { Icon, Loading } from "@cocalc/frontend/components";
import {
  SortableTab,
  SortableTabs,
  useItemContext,
  useSortable,
} from "@cocalc/frontend/components/sortable-tabs";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import { ProjectAvatarImage } from "@cocalc/frontend/projects/project-avatar";
import { COMPUTE_STATES } from "@cocalc/util/schema";
import { COLORS } from "@cocalc/util/theme";
import { useProjectState } from "../project/page/project-state-hook";
import { useProjectHasInternetAccess } from "../project/settings/has-internet-access-hook";

const PROJECT_NAME_STYLE: CSS = {
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  maxWidth: "200px",
} as const;

interface ProjectTabProps {
  project_id: string;
}

function useProjectStatusAlerts(project_id: string) {
  const [any_alerts, set_any_alerts] = useState<boolean>(false);
  const project_status = useTypedRedux({ project_id }, "status");
  const any = project_status?.get("alerts").size > 0;
  useMemo(() => {
    set_any_alerts(any);
  }, [any]);
  return any_alerts;
}

function ProjectTab({ project_id }: ProjectTabProps) {
  const { width } = useItemContext();

  // determine, if the "no internet" icon + text is shown – only known for sure, if project is running
  const status = useProjectState(project_id);
  const isRunning = useMemo(
    () => status.get("state") === "running",
    [status.get("state")],
  );
  const hasInternet = useProjectHasInternetAccess(project_id);
  const showNoInternet = isRunning && !hasInternet;

  const { active } = useSortable({ id: project_id });
  const other_settings = useTypedRedux("account", "other_settings");
  const active_top_tab = useTypedRedux("page", "active_top_tab");
  const project = useRedux(["projects", "project_map", project_id]);
  const pageActions = useActions("page");
  const public_project_titles = useTypedRedux(
    "projects",
    "public_project_titles",
  );
  const any_alerts = useProjectStatusAlerts(project_id);

  const title = project?.get("title") ?? public_project_titles?.get(project_id);
  if (title == null) {
    if (active_top_tab == project_id) {
      set_window_title("Loading");
    }
    return <Loading key={project_id} />;
  }

  if (active_top_tab == project_id) {
    set_window_title(title);
  }

  const project_state = project?.getIn(["state", "state"]);

  const icon =
    any_alerts && project_state === "running" ? (
      <Icon name={"exclamation-triangle"} style={{ color: COLORS.BS_RED }} />
    ) : (
      <Icon name={COMPUTE_STATES[project_state]?.icon ?? "bullhorn"} />
    );

  function click_title(e) {
    // we intercept a click with a modification key in order to open that project in a new window
    if (e.ctrlKey || e.shiftKey || e.metaKey) {
      e.stopPropagation();
      e.preventDefault();
      const actions = redux.getProjectActions(project_id);
      actions.open_file({ path: "", new_browser_window: true });
    }
  }

  function noInternetInfo(mode: "tooltip" | "popover") {
    if (!showNoInternet) return;
    const fontStyle = {
      color: mode === "popover" ? COLORS.ANTD_RED_WARN : "white",
    };
    return (
      <>
        <div style={fontStyle}>
          This project does not have access to the internet.
        </div>
        {mode === "popover" ? <hr /> : null}
      </>
    );
  }

  function renderContent() {
    return (
      <div style={{ maxWidth: "400px", maxHeight: "50vh", overflow: "auto" }}>
        {noInternetInfo("popover")}
        <ProjectAvatarImage
          project_id={project_id}
          size={120}
          style={{ textAlign: "center" }}
        />
        <StaticMarkdown
          style={{ display: "inline-block" }}
          value={project?.get("description") ?? ""}
        />
        <hr />
        <div style={{ color: COLORS.GRAY }}>
          Hint: Shift+click any project or file tab to open it in new window.
        </div>
      </div>
    );
  }

  function renderNoInternet() {
    if (!showNoInternet) return;
    const noInternet = (
      <Icon name="global" style={{ color: COLORS.ANTD_RED_WARN }} />
    );
    if (other_settings.get("hide_project_popovers")) {
      return <Tooltip title={noInternetInfo("tooltip")}>{noInternet}</Tooltip>;
    } else {
      return noInternet;
    }
  }

  function renderAvatar() {
    const avatar = project?.get("avatar_image_tiny");
    const color = project?.get("color");

    if (avatar) {
      // Avatar exists: show it with colored border
      return (
        <Avatar
          style={{
            marginTop: "-2px",
            border: color ? `2px solid ${color}` : undefined,
          }}
          shape="circle"
          icon={<img src={project.get("avatar_image_tiny")} />}
          size={20}
        />
      );
    } else if (color) {
      // No avatar but has color: show colored circle
      return (
        <Avatar
          style={{
            marginTop: "-2px",
            backgroundColor: color,
          }}
          shape="circle"
          size={20}
        />
      );
    }

    return undefined;
  }

  function onMouseUp(e: React.MouseEvent) {
    // if middle mouse button has been clicked, close the project
    if (e.button === 1) {
      e.stopPropagation();
      e.preventDefault();
      pageActions.close_project_tab(project_id);
    }
  }

  const body = (
    <div
      onMouseUp={onMouseUp}
      style={{
        marginTop: "-4px" /* compensate for border */,
        ...(width != null ? { width } : undefined),
      }}
    >
      <div style={PROJECT_NAME_STYLE} onClick={click_title}>
        {icon}
        {renderNoInternet()}
        {renderAvatar()}{" "}
        <span style={{ marginLeft: 5, position: "relative" }}>{title}</span>
      </div>
    </div>
  );
  if (IS_MOBILE || other_settings.get("hide_project_popovers")) {
    return body;
  }
  return (
    <Popover
      zIndex={10000}
      title={
        <StaticMarkdown style={{ display: "inline-block" }} value={title} />
      }
      content={renderContent()}
      placement="bottom"
      open={active != null ? false : undefined}
      mouseEnterDelay={0.9}
    >
      {body}
    </Popover>
  );
}

interface ProjectsNavProps {
  style?: CSSProperties;
  height: number; // px
}

export function ProjectsNav(props: ProjectsNavProps) {
  const { style, height } = props;
  const actions = useActions("page");
  const projectActions = useActions("projects");
  const activeTopTab = useTypedRedux("page", "active_top_tab");
  const openProjects = useTypedRedux("projects", "open_projects");
  //const project_map = useTypedRedux("projects", "project_map");

  const items: TabsProps["items"] = useMemo(() => {
    if (openProjects == null) return [];
    return openProjects.toJS().map((project_id) => {
      return {
        label: <ProjectTab project_id={project_id} />,
        key: project_id,
      };
    });
  }, [openProjects]);

  const project_ids: string[] = useMemo(() => {
    if (openProjects == null) return [];
    return openProjects.toJS().map((project_id) => project_id);
  }, [openProjects]);

  function onEdit(project_id: string, action: "add" | "remove") {
    if (action === "add") {
      actions.set_active_tab("projects");
    } else {
      // close given project
      actions.close_project_tab(project_id);
    }
  }

  function onDragEnd(event) {
    const { active, over } = event;
    if (active == null || over == null || active.id == over.id) return;
    projectActions.move_project_tab({
      old_index: project_ids.indexOf(active.id),
      new_index: project_ids.indexOf(over.id),
    });
  }

  function onDragStart(event) {
    if (event?.active?.id != activeTopTab) {
      actions.set_active_tab(event?.active?.id);
    }
  }

  function renderTabBar0(tabBarProps, DefaultTabBar) {
    return (
      <DefaultTabBar {...tabBarProps}>
        {(node) => {
          const project_id = node.key;
          const isActive = project_id === activeTopTab;

          const wrapperStyle: CSS = {
            border: isActive
              ? `2px solid ${"#d3d3d3"}`
              : `2px solid  ${"transparent"}`,
            borderRadius: "8px",
          };

          // Kept for reference, this allows to tweak the node props directly
          // const styledNode = cloneElement(node, {
          //   style: {
          //     ...node.props.style,
          //     backgroundColor: wrapperStyle.backgroundColor,
          //   },
          // });

          return (
            <SortableTab key={node.key} id={node.key} style={wrapperStyle}>
              {node}
            </SortableTab>
          );
        }}
      </DefaultTabBar>
    );
  }

  return (
    <div
      style={{
        overflow: "hidden",
        height: `${height}px`,
        ...style,
      }}
    >
      {items.length > 0 && (
        <SortableTabs
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          items={project_ids}
        >
          <Tabs
            animated={false}
            moreIcon={<Icon style={{ fontSize: "18px" }} name="ellipsis" />}
            activeKey={activeTopTab}
            onEdit={onEdit}
            onChange={(project_id) => {
              actions.set_active_tab(project_id);
            }}
            type={"editable-card"}
            renderTabBar={renderTabBar0}
            items={items}
          />
        </SortableTabs>
      )}
    </div>
  );
}
