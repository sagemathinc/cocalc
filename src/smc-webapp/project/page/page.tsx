import { NavItem, Nav } from "react-bootstrap";
import { DeletedProjectWarning, Loading } from "../../r_misc";
import { Content } from "./content";
import { path_split, path_to_tab, tab_to_path } from "smc-util/misc";
import { React, useActions, useRedux } from "../../app-framework";
import { SortableContainer, SortableElement } from "react-sortable-hoc";
import { ChatIndicator } from "../../chat/chat-indicator";
import { ShareIndicator } from "../../share/share-indicator";
import { IS_TOUCH } from "../../feature";
const { file_options } = require("../../editor");
import { file_tab_labels } from "../file-tab-labels";
import { DiskSpaceWarning } from "../warnings/disk-space";
import { RamWarning } from "../warnings/ram";
import { OOMWarning } from "../warnings/oom";
import { TrialBanner } from "../trial-banner";

// TODO: maybe when FileTab is in typescript the ":any" below
// won't be needed.
//import { DEFAULT_FILE_TAB_STYLES, FileTab } from "../file-tab";
const { DEFAULT_FILE_TAB_STYLES, FileTab } = require("../file-tab");
const SortableFileTab: any = SortableElement(FileTab);

const PAGE_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  overflow: "auto",
} as const;

// TODO: why the wrapper and not just Nav directly???
const NavWrapper = ({ style, children, id, className, bsStyle }) =>
  React.createElement(Nav, { style, id, className, bsStyle }, children);
const SortableNav = SortableContainer(NavWrapper);

const INDICATOR_STYLE: React.CSSProperties = {
  paddingTop: "1px",
  overflow: "hidden",
  paddingLeft: "5px",
  height: "32px",
} as const;

const FIXED_PROJECT_PAGES = {
  files: {
    label: "Files",
    icon: "folder-open-o",
    tooltip: "Browse files",
  },
  new: {
    label: "New",
    icon: "plus-circle",
    tooltip: "Create new file, folder, worksheet or terminal",
    no_anonymous: true,
  },
  log: {
    label: "Log",
    icon: "history",
    tooltip: "Log of project activity",
    no_anonymous: true,
  },
  search: {
    label: "Find",
    icon: "search",
    tooltip: "Search files in the project",
    no_anonymous: true,
  },
  settings: {
    label: "Settings",
    icon: "wrench",
    tooltip: "Project settings and controls",
    no_anonymous: true,
  },
} as const;

interface Props {
  project_id: string;
  is_active: boolean;
}

export const ProjectPage: React.FC<Props> = ({ project_id, is_active }) => {
  const actions = useActions(project_id);
  const is_deleted = useRedux([
    "projects",
    "project_map",
    project_id,
    "deleted",
  ]);

  const open_files_order = useRedux(["open_files_order"], project_id);
  const open_files = useRedux(["open_files"], project_id);
  const active_project_tab = useRedux(["active_project_tab"], project_id);
  const current_path = useRedux(["current_path"], project_id);
  const num_ghost_file_tabs = useRedux(["num_ghost_file_tabs"], project_id);

  const is_anonymous = useRedux(["account", "is_anonymous"]);
  const fullscreen = useRedux(["page", "fullscreen"]);

  function on_sort_end({ oldIndex, newIndex }): void {
    actions.move_file_tab({
      old_index: oldIndex,
      new_index: newIndex,
    });
  }

  function file_tabs() {
    if (open_files_order == null) {
      return;
    }
    const paths: string[] = [];
    open_files_order.map((path) => {
      if (path == null) {
        // see https://github.com/sagemathinc/cocalc/issues/3450
        // **This should never fail** so be loud if it does.
        throw Error(
          "BUG -- each entry in open_files_order must be defined -- " +
            JSON.stringify(open_files_order.toJS())
        );
      }
      paths.push(path);
    });
    const labels = file_tab_labels(paths);
    const tabs: JSX.Element[] = [];
    for (let index = 0; index < labels.length; index++) {
      tabs.push(file_tab(paths[index], index, labels[index]));
    }
    if (num_ghost_file_tabs === 0) {
      return tabs;
    }

    const num_real_tabs = open_files_order.size;
    const num_tabs = num_real_tabs + num_ghost_file_tabs;
    for (let index = num_real_tabs; index < num_tabs; index++) {
      // Push a "ghost tab":
      tabs.push(<NavItem style={DEFAULT_FILE_TAB_STYLES} key={index} />);
    }
    return tabs;
  }

  function file_tab(path: string, index: number, label): JSX.Element {
    const filename = path_split(path).tail;
    // get the file_associations[ext] just like it is defined in the editor

    const icon = file_options(filename)?.icon ?? "code-o";
    return (
      <SortableFileTab
        index={index}
        key={path}
        name={path_to_tab(path)}
        label={label}
        icon={icon}
        tooltip={path}
        project_id={project_id}
        file_tab={true}
        has_activity={open_files.getIn([path, "has_activity"])}
        is_active={active_project_tab === path_to_tab(path)}
      />
    );
  }

  function render_chat_indicator(
    shrink_fixed_tabs: boolean
  ): JSX.Element | undefined {
    if (is_anonymous) {
      // anonymous users have no possibility to chat
      return;
    }
    if (!active_project_tab?.startsWith("editor-")) {
      // TODO: This is the place in the code where we could support project-wide
      // side chat, or side chats for each individual Files/Search, etc. page.
      return;
    }
    const path = tab_to_path(active_project_tab);
    const is_chat_open = open_files.getIn([path, "is_chat_open"]);
    return (
      <div style={INDICATOR_STYLE}>
        <ChatIndicator
          project_id={project_id}
          path={path}
          is_chat_open={is_chat_open}
          shrink_fixed_tabs={shrink_fixed_tabs}
        />
      </div>
    );
  }

  function render_share_indicator(shrink_fixed_tabs) {
    if (is_anonymous) {
      // anon users can't share anything
      return;
    }
    const path =
      active_project_tab === "files"
        ? current_path
        : tab_to_path(active_project_tab);
    if (path == null) {
      // nothing specifically to share
      return;
    }
    if (path === "") {
      // sharing whole project not implemented
      return;
    }
    return (
      <div style={INDICATOR_STYLE}>
        <ShareIndicator
          project_id={project_id}
          path={path}
          shrink_fixed_tabs={shrink_fixed_tabs}
        />
      </div>
    );
  }

  function fixed_tabs_array(shrink_fixed_tabs) {
    const tabs: JSX.Element[] = [];
    for (let k in FIXED_PROJECT_PAGES) {
      const v = FIXED_PROJECT_PAGES[k];
      if (is_anonymous && v.no_anonymous) {
        continue;
      }
      const tab = (
        <FileTab
          key={k}
          name={k}
          label={v.label}
          icon={v.icon}
          tooltip={v.tooltip}
          project_id={project_id}
          is_active={active_project_tab === k}
          shrink={shrink_fixed_tabs}
        />
      );
      tabs.push(tab);
    }
    return tabs;
  }

  function render_file_tabs() {
    const width = $(window).width() ?? 1000; // default 1000 is to make TS happy
    const shrink_fixed_tabs =
      width < 376 + (open_files_order.size + num_ghost_file_tabs) * 250;
    const fixed_tabs = fixed_tabs_array(shrink_fixed_tabs);

    return (
      <div
        className="smc-file-tabs"
        style={{
          width: "100%",
          height: "32px",
          borderBottom: "1px solid #e1e1e1",
        }}
      >
        <div style={{ display: "flex" }}>
          {fullscreen != "kiosk" && (
            <Nav
              bsStyle="pills"
              className="smc-file-tabs-fixed-desktop"
              style={{ overflow: "hidden", float: "left" }}
            >
              {fixed_tabs}
            </Nav>
          )}
          <div style={{ display: "flex", overflow: "hidden", flex: 1 }}>
            <SortableNav
              id="sortable-file-tabs"
              className="smc-file-tabs-files-desktop"
              helperClass={"smc-file-tab-floating"}
              onSortEnd={on_sort_end}
              axis={"x"}
              lockAxis={"x"}
              lockToContainerEdges={true}
              distance={!IS_TOUCH ? 3 : undefined}
              pressDelay={IS_TOUCH ? 200 : undefined}
              bsStyle="pills"
              style={{ display: "flex", overflow: "hidden" }}
            >
              {file_tabs()}
            </SortableNav>
          </div>
          <div
            style={{
              borderLeft: "1px solid lightgrey",
              display: "inline-flex",
            }}
          >
            {render_chat_indicator(shrink_fixed_tabs)}
            {render_share_indicator(shrink_fixed_tabs)}
          </div>
        </div>
      </div>
    );
  }

  function render_editor_tabs() {
    const v: JSX.Element[] = [];

    open_files_order.map((path) => {
      if (!path) {
        return;
      }
      const tab_name = "editor-" + path;
      return v.push(
        <Content
          key={tab_name}
          is_visible={active_project_tab === tab_name}
          project_id={project_id}
          tab_name={tab_name}
        />
      );
    });
    return v;
  }

  // fixed tab -- not an editor
  function render_project_content() {
    const v: JSX.Element[] = [];
    if (active_project_tab.slice(0, 7) !== "editor-") {
      if (!is_active) {
        // see https://github.com/sagemathinc/cocalc/issues/3799
        // Some of the fixed project tabs (none editors) are hooked
        // into redux and moronic about rendering everything on every
        // tiny change... Until that is fixed, it is critical to NOT
        // render these pages at all, unless the tab is active
        // and they are visible.
        return;
      }
      v.push(
        <Content
          key={active_project_tab}
          is_visible={true}
          project_id={project_id}
          tab_name={active_project_tab}
        />
      );
    }
    return v.concat(render_editor_tabs());
  }

  if (open_files_order == null) {
    return <Loading />;
  }

  const style = {
    ...PAGE_STYLE,
    ...(!fullscreen ? { paddingTop: "3px" } : undefined),
  };

  return (
    <div className="container-content" style={style}>
      <DiskSpaceWarning project_id={project_id} />
      <RamWarning project_id={project_id} />
      <OOMWarning project_id={project_id} />
      <TrialBanner project_id={project_id} />
      {!fullscreen && render_file_tabs()}
      {is_deleted && <DeletedProjectWarning />}
      {render_project_content()}
    </div>
  );
};
