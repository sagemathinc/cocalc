/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Avatar } from "antd";
import { Nav, NavItem } from "react-bootstrap";
import CloseX from "@cocalc/frontend/project/page/close-x";
import { trunc } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { COMPUTE_STATES } from "@cocalc/util/schema";
import { ProjectAvatarImage } from "@cocalc/frontend/projects/project-row";
import { set_window_title } from "@cocalc/frontend/browser";
import {
  redux,
  useActions,
  useMemo,
  useRedux,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { createElement, useState, CSSProperties } from "react";
import { Loading, Icon, Tip } from "@cocalc/frontend//components";
import { NavTab } from "@cocalc/frontend//app/nav-tab";
import { WebsocketIndicator } from "@cocalc/frontend/project/websocket/websocket-indicator";

const NavWrapper = ({
  style,
  children,
  id,
  className,
}: {
  style: CSSProperties;
  children;
  id?: string;
  className?: string;
}) => createElement(Nav, { style, id, className }, children);

const SortableNavTab = NavTab;
const SortableNav = NavWrapper;

const GHOST_STYLE: CSSProperties = {
  flexShrink: 1,
  width: "200px",
  height: "36px",
  overflow: "hidden",
} as const;

const PROJECT_NAME_STYLE: CSSProperties = {
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
} as const;

const PROJECT_TAB_STYLE: CSSProperties = {
  flexShrink: 1,
  width: "200px",
  maxWidth: "200px",
  height: "36px",
  overflow: "hidden",
  lineHeight: "1.75em",
} as const;

interface ProjectTabProps {
  index: number;
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
  const actions = useActions("page");
  const active_top_tab = useTypedRedux("page", "active_top_tab");
  const project = useRedux(["projects", "project_map", project_id]);
  const public_project_titles = useTypedRedux(
    "projects",
    "public_project_titles"
  );
  const project_websockets = useTypedRedux("projects", "project_websockets");
  const is_anonymous = useTypedRedux("account", "is_anonymous");
  const any_alerts = useProjectStatusAlerts(project_id);

  function render_websocket_indicator() {
    return (
      // Hiding this on very skinny devices isn't necessarily bad, since the exact same information is
      // now visible via a big "Connecting..." banner after a few seconds.
      <span style={{ paddingRight: "5px" }} className="hidden-xs">
        <WebsocketIndicator state={project_websockets?.get(project_id)} />
      </span>
    );
  }

  function render_close_x() {
    if (is_anonymous) {
      // you have one project and you can't close it.
      return;
    }
    return (
      <CloseX
        closeFile={() => actions.close_project_tab(project_id)}
        clearGhostFileTabs={() => actions.clear_ghost_tabs()}
      />
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

  const nav_style: CSSProperties = {
    ...PROJECT_TAB_STYLE,
    color:
      project_id === active_top_tab ? COLORS.TOP_BAR.TEXT_ACTIVE : undefined,
  };

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

  function render_tip() {
    return (
      <>
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
      </>
    );
  }

  return (
    <SortableNavTab
      name={project_id}
      active_top_tab={active_top_tab}
      style={nav_style}
      is_project={true}
    >
      <div style={nav_style_inner}>
        {render_websocket_indicator()}
        {render_close_x()}
      </div>
      <div style={PROJECT_NAME_STYLE} onClick={click_title}>
        <Tip title={title} tip={render_tip()} placement="bottom" size="small">
          {icon}
          {project?.get("avatar_image_tiny") && (
            <Avatar
              style={{ marginTop: "-2px" }}
              shape="circle"
              icon={<img src={project.get("avatar_image_tiny")} />}
              size={20}
            />
          )}
          <span style={{ marginLeft: 5, position: "relative" }}>{title}</span>
        </Tip>
      </div>
    </SortableNavTab>
  );
}

export function ProjectsNav({ style }: { style?: CSSProperties }) {
  const num_ghost_tabs = useTypedRedux("page", "num_ghost_tabs");
  const open_projects = useTypedRedux("projects", "open_projects");

  //const actions = useActions("projects");
  //   function on_sort_end({ oldIndex, newIndex }) {
  //     actions.move_project_tab({
  //       old_index: oldIndex,
  //       new_index: newIndex,
  //     });
  //   }

  function render_project_tabs(): undefined | JSX.Element[] {
    if (open_projects == null) {
      return;
    }
    const v: JSX.Element[] = [];
    open_projects.map((project_id, index) => {
      v.push(
        <ProjectTab index={index} project_id={project_id} key={project_id} />
      );
    });

    if (num_ghost_tabs === 0) {
      return v;
    }

    const num_real_tabs = open_projects.size;
    const num_tabs = num_real_tabs + num_ghost_tabs;
    for (let index = num_real_tabs; index < num_tabs; index++) {
      v.push(<NavItem key={index} style={GHOST_STYLE} />);
    }
    return v;
  }

  // NOTE!!! The margin:'0' in the style in SortableNav below is
  // critical; without it, when you make the screen skinny, the tabs
  // get mangled looking.  DO NOT delete without being aware of this!
  return (
    <div
      style={{
        display: "flex",
        flex: "1",
        overflow: "hidden",
        height: "36px",
        margin: "0",
        ...style,
      }}
    >
      <SortableNav style={{ display: "flex", overflow: "hidden", margin: "0" }}>
        {render_project_tabs()}
      </SortableNav>
    </div>
  );
}
