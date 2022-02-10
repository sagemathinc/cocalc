/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Modal } from "antd";
import { NavItem, Nav } from "react-bootstrap";
import { Loading } from "../../components";
import { DeletedProjectWarning } from "../warnings/deleted";
import { Content } from "./content";
import { tab_to_path } from "@cocalc/util/misc";
import {
  React,
  useActions,
  useRedux,
  useTypedRedux,
  redux,
} from "../../app-framework";
import { SortableContainer, SortableElement } from "react-sortable-hoc";
import { ChatIndicator } from "../../chat/chat-indicator";
import { ShareIndicator } from "./share-indicator";
import { IS_TOUCH } from "../../feature";
import { file_tab_labels } from "../file-tab-labels";
import { DiskSpaceWarning } from "../warnings/disk-space";
import { RamWarning } from "../warnings/ram";
import { OOMWarning } from "../warnings/oom";
import { TrialBanner } from "../trial-banner";
import { SoftwareEnvUpgrade } from "./software-env-upgrade";
import { AnonymousName } from "../anonymous-name";
import { StartButton } from "../start-button";
import { useProjectStatus } from "./project-status-hook";
import {
  defaultFrameContext,
  FrameContext,
} from "@cocalc/frontend/frame-editors/frame-tree/frame-context";

import {
  DEFAULT_FILE_TAB_STYLES,
  FIXED_PROJECT_TABS,
  FileTab,
} from "./file-tab";

const SortableFileTab = SortableElement(FileTab);

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

interface Props {
  project_id: string;
  is_active: boolean;
}

export const ProjectPage: React.FC<Props> = ({ project_id, is_active }) => {
  const actions = useActions({ project_id });
  const is_deleted = useRedux([
    "projects",
    "project_map",
    project_id,
    "deleted",
  ]);
  if (actions != null) {
    useProjectStatus(actions);
  }
  const open_files_order = useTypedRedux({ project_id }, "open_files_order");
  const open_files = useTypedRedux({ project_id }, "open_files");
  const active_project_tab = useTypedRedux(
    { project_id },
    "active_project_tab"
  );
  const current_path = useTypedRedux({ project_id }, "current_path");
  const num_ghost_file_tabs = useTypedRedux(
    { project_id },
    "num_ghost_file_tabs"
  );

  const is_anonymous = useTypedRedux("account", "is_anonymous");
  const fullscreen = useTypedRedux("page", "fullscreen");
  const modal = useTypedRedux({ project_id }, "modal");

  function on_sort_end({ oldIndex, newIndex }): void {
    if (actions == null) return;
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
    return (
      <SortableFileTab
        index={index}
        key={path}
        project_id={project_id}
        path={path}
        label={label}
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
    if (path == null) {
      // bug -- tab is not a file tab.
      return;
    }
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
    let name: keyof typeof FIXED_PROJECT_TABS;
    for (name in FIXED_PROJECT_TABS) {
      const v = FIXED_PROJECT_TABS[name];
      if (is_anonymous && v.no_anonymous) {
        continue;
      }
      const tab = (
        <FileTab
          key={name}
          project_id={project_id}
          name={name}
          label={shrink_fixed_tabs ? "" : undefined}
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
              className="smc-file-tabs-sortable-desktop"
              id="sortable-file-tabs"
              helperClass={"smc-file-tab-floating"}
              onSortEnd={on_sort_end}
              axis={"x"}
              lockAxis={"x"}
              lockToContainerEdges={true}
              distance={!IS_TOUCH ? 3 : undefined}
              pressDelay={IS_TOUCH ? 200 : undefined}
              bsStyle="pills"
              style={{ display: "flex", overflow: "hidden", height: "32px" }}
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
        <FrameContext.Provider
          key={tab_name}
          value={{
            ...defaultFrameContext,
            project_id,
            path,
            actions: redux.getEditorActions(project_id, path) as any,
            isFocused: active_project_tab === tab_name,
          }}
        >
          <Content
            is_visible={active_project_tab === tab_name}
            project_id={project_id}
            tab_name={tab_name}
          />
        </FrameContext.Provider>
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

  function render_project_modal() {
    if (!is_active || !modal) return;
    return (
      <Modal
        title={modal?.get("title")}
        visible={is_active && modal != null}
        onOk={() => {
          actions?.clear_modal();
          modal?.get("onOk")?.();
        }}
        onCancel={() => {
          actions?.clear_modal();
          modal?.get("onCancel")?.();
        }}
      >
        {modal?.get("content")}
      </Modal>
    );
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
      <AnonymousName project_id={project_id} />
      <DiskSpaceWarning project_id={project_id} />
      <RamWarning project_id={project_id} />
      <OOMWarning project_id={project_id} />
      <SoftwareEnvUpgrade project_id={project_id} />
      <TrialBanner project_id={project_id} />
      {!fullscreen && render_file_tabs()}
      {is_deleted && <DeletedProjectWarning />}
      <StartButton project_id={project_id} />
      {render_project_content()}
      {render_project_modal()}
    </div>
  );
};
