/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { SortableContainer, SortableElement } from "react-sortable-hoc";
import { Nav, NavItem } from "react-bootstrap";

import { trunc } from "smc-util/misc";
import { COLORS } from "smc-util/theme";
import { COMPUTE_STATES } from "smc-util/schema";

import { IS_TOUCH } from "../feature";
import { set_window_title } from "../browser";
import {
  React,
  ReactDOM,
  useActions,
  useEffect,
  useRedux,
  useRef,
  useState,
  useTypedRedux,
} from "../app-framework";
import { Loading, Icon, Tip } from "../r_misc";
import { NavTab } from "../app/nav-tab";
import { WebsocketIndicator } from "../project/websocket/websocket-indicator";

const NavWrapper = ({ style, children, id, className }) =>
  React.createElement(Nav, { style, id, className }, children);

const SortableNavTab = SortableElement(NavTab);
const SortableNav = SortableContainer(NavWrapper);

const GHOST_STYLE: React.CSSProperties = {
  flexShrink: 1,
  width: "200px",
  height: "36px",
  overflow: "hidden",
} as const;

const PROJECT_NAME_STYLE: React.CSSProperties = {
  whiteSpace: "nowrap",
  overflow: "hidden",
} as const;

const PROJECT_TAB_STYLE: React.CSSProperties = {
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

const ProjectTab: React.FC<ProjectTabProps> = React.memo(
  ({ project_id, index }) => {
    /* This href hack below is to workaround issues with Firefox.  Without this hack,
    in the project bar in the dev app, I can grab the tab for a project and pull it down
    from the bar. Just the label, not the whole browser tab. And when I let go, the
    tab returns to the project bar but its horizontal motion still tracks mouse
    cursor position. Clicking mouse releases the tab to a correct position in the
    project bar. That does not happen in with Chrome.  I reproduced the above with
    the latest Firefox in June 2020.
    My plan to get rid of this is that it'll hopefully just "go away" when I rewrite
    the navbar using antd.
    */
    const tab_ref = useRef(null);
    useEffect(() => {
      ReactDOM.findDOMNode(tab_ref.current)?.children[0].removeAttribute(
        "href"
      );
    });

    const [x_hovered, set_x_hovered] = useState<boolean>(false);
    const actions = useActions("page");
    const active_top_tab = useTypedRedux("page", "active_top_tab");
    const project = useRedux(["projects", "project_map", project_id]);
    const public_project_titles = useTypedRedux(
      "projects",
      "public_project_titles"
    );
    const project_websockets = useTypedRedux("projects", "project_websockets");
    const is_anonymous = useTypedRedux("account", "is_anonymous");

    function close_tab(e) {
      e.stopPropagation();
      e.preventDefault();
      actions.close_project_tab(project_id);
    }

    function render_websocket_indicator() {
      return (
        <span style={{ paddingRight: "5px" }}>
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
        <Icon
          name="times"
          onClick={close_tab}
          onMouseOver={() => {
            set_x_hovered(true);
          }}
          onMouseOut={() => {
            actions.clear_ghost_tabs();
            set_x_hovered(false);
          }}
        />
      );
    }

    const title =
      project?.get("title") ?? public_project_titles?.get(project_id);
    if (title == null) {
      if (active_top_tab == project_id) {
        set_window_title("Loading");
      }
      return <Loading key={project_id} />;
    }

    if (active_top_tab == project_id) {
      set_window_title(title);
    }

    return (
      <SortableNavTab
        ref={tab_ref}
        index={index}
        name={project_id}
        active_top_tab={active_top_tab}
        style={{
          ...PROJECT_TAB_STYLE,
          color:
            project_id === active_top_tab
              ? COLORS.TOP_BAR.TEXT_ACTIVE
              : undefined,
        }}
        is_project={true}
      >
        <div
          style={{
            float: "right",
            whiteSpace: "nowrap",
            color: x_hovered ? COLORS.TOP_BAR.X_HOVER : COLORS.TOP_BAR.X,
          }}
        >
          {render_websocket_indicator()}
          {render_close_x()}
        </div>
        <div style={PROJECT_NAME_STYLE}>
          <Tip
            title={title}
            tip={trunc(project?.get("description") ?? "", 128)}
            placement="bottom"
            size="small"
          >
            <Icon
              name={
                COMPUTE_STATES[project?.getIn(["state", "state"])]?.icon ??
                "bullhorn"
              }
            />
            <span style={{ marginLeft: 5, position: "relative" }}>
              {trunc(title, 24)}
            </span>
          </Tip>
        </div>
      </SortableNavTab>
    );
  }
);

export const ProjectsNav: React.FC = React.memo(() => {
  const actions = useActions("projects");

  const num_ghost_tabs = useTypedRedux("page", "num_ghost_tabs");
  const open_projects = useTypedRedux("projects", "open_projects");

  function on_sort_end({ oldIndex, newIndex }) {
    actions.move_project_tab({
      old_index: oldIndex,
      new_index: newIndex,
    });
  }

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
      }}
    >
      <SortableNav
        id={"smc-project-tab-floating"}
        className="smc-project-tab-sorter"
        style={{ display: "flex", overflow: "hidden", margin: "0" }}
        helperClass={"smc-project-tab-floating"}
        onSortEnd={on_sort_end}
        axis={"x"}
        lockAxis={"x"}
        lockToContainerEdges={true}
        distance={!IS_TOUCH ? 3 : undefined}
        pressDelay={IS_TOUCH ? 200 : undefined}
      >
        {render_project_tabs()}
      </SortableNav>
    </div>
  );
});
