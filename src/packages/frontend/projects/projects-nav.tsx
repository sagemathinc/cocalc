/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Avatar, Popover, Tabs } from "antd";
import type { TabsProps } from "antd";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import { trunc } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { COMPUTE_STATES } from "@cocalc/util/schema";
import { ProjectAvatarImage } from "@cocalc/frontend/projects/project-row";
import { set_window_title } from "@cocalc/frontend/browser";
import {
  redux,
  useActions,
  useRedux,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { useMemo, useState, CSSProperties } from "react";
import { Loading, Icon } from "@cocalc/frontend//components";
import { WebsocketIndicator } from "@cocalc/frontend/project/websocket/websocket-indicator";
import {
  SortableTabs,
  useSortable,
  renderTabBar,
} from "@cocalc/frontend/components/sortable-tabs";

const PROJECT_NAME_STYLE: CSSProperties = {
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
  const { active } = useSortable({ id: project_id });
  const active_top_tab = useTypedRedux("page", "active_top_tab");
  const project = useRedux(["projects", "project_map", project_id]);
  const public_project_titles = useTypedRedux(
    "projects",
    "public_project_titles"
  );
  const project_websockets = useTypedRedux("projects", "project_websockets");
  const any_alerts = useProjectStatusAlerts(project_id);

  function renderWebsocketIndicator() {
    return (
      // Hiding this on very skinny devices isn't necessarily bad, since the exact same information is
      // now visible via a big "Connecting..." banner after a few seconds.
      <span
        style={{ paddingLeft: "15px", marginRight: "-15px" }}
        className="hidden-xs"
      >
        <WebsocketIndicator state={project_websockets?.get(project_id)} />
      </span>
    );
  }

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

  const nav_style_inner: CSSProperties = {
    float: "right",
    whiteSpace: "nowrap",
  };

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

  function renderContent() {
    return (
      <div style={{ maxWidth: "400px" }}>
        <ProjectAvatarImage
          project_id={project_id}
          size={120}
          style={{ textAlign: "center" }}
        />
        <div style={{ textAlign: "center" }}>
          {trunc(project?.get("description") ?? "", 128)}
        </div>
        <hr />
        <div style={{ color: COLORS.GRAY }}>
          Hint: shift+click any project or file tab to open it in new window.
        </div>
      </div>
    );
  }
  const body = (
    <div>
      <div style={nav_style_inner}>{renderWebsocketIndicator()}</div>
      <div style={PROJECT_NAME_STYLE} onClick={click_title}>
        {icon}
        {project?.get("avatar_image_tiny") && (
          <Avatar
            style={{ marginTop: "-2px" }}
            shape="circle"
            icon={<img src={project.get("avatar_image_tiny")} />}
            size={20}
          />
        )}{" "}
        <span style={{ marginLeft: 5, position: "relative" }}>{title}</span>
      </div>
    </div>
  );
  if (IS_MOBILE) {
    return body;
  }
  return (
    <Popover
      zIndex={10000}
      title={title}
      content={renderContent()}
      placement="bottom"
      open={active != null ? false : undefined}
      mouseEnterDelay={0.9}
    >
      {body}
    </Popover>
  );
}

export function ProjectsNav({ style }: { style?: CSSProperties }) {
  const actions = useActions("page");
  const projectActions = useActions("projects");
  const activeTopTab = useTypedRedux("page", "active_top_tab");
  const openProjects = useTypedRedux("projects", "open_projects");
  const isAnonymous = useTypedRedux("account", "is_anonymous");

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

  const onEdit = (project_id: string, action: "add" | "remove") => {
    if (action == "add") {
      actions.set_active_tab("projects");
    } else {
      // close given project
      actions.close_project_tab(project_id);
    }
  };

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

  return (
    <div
      style={{
        flex: 1,
        overflow: "hidden",
        height: "36px",
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
            type={isAnonymous ? "card" : "editable-card"}
            renderTabBar={renderTabBar}
            items={items}
          />
        </SortableTabs>
      )}
    </div>
  );
}
