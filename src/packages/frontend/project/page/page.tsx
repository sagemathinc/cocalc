/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Modal } from "antd";
import { Loading } from "../../components";
import { DeletedProjectWarning } from "../warnings/deleted";
import { Content } from "./content";
import {
  React,
  useActions,
  useRedux,
  useTypedRedux,
  redux,
} from "@cocalc/frontend/app-framework";
import { DiskSpaceWarning } from "../warnings/disk-space";
import { RamWarning } from "../warnings/ram";
import { OOMWarning } from "../warnings/oom";
import { ProjectWarningBanner } from "../project-banner";
import { SoftwareEnvUpgrade } from "./software-env-upgrade";
import { AnonymousName } from "../anonymous-name";
import { StartButton } from "../start-button";
import { useProjectStatus } from "./project-status-hook";
import {
  defaultFrameContext,
  FrameContext,
} from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import Tabs from "./tabs";

const PAGE_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  overflow: "auto",
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
  useProjectStatus(actions);
  const fullscreen = useTypedRedux("page", "fullscreen");
  const modal = useTypedRedux({ project_id }, "modal");
  const open_files_order = useTypedRedux({ project_id }, "open_files_order");
  const active_project_tab = useTypedRedux(
    { project_id },
    "active_project_tab"
  );

  function renderEditorContent() {
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
    if (!is_active) {
      // see https://github.com/sagemathinc/cocalc/issues/3799
      // Some of the fixed project tabs (none editors) are hooked
      // into redux and moronic about rendering everything on every
      // tiny change... Until that is fixed, it is critical to NOT
      // render these pages at all, unless the tab is active
      // and they are visible.
      return;
    }
    if (active_project_tab.slice(0, 7) !== "editor-") {
      return (
        <Content
          key={active_project_tab}
          is_visible={true}
          project_id={project_id}
          tab_name={active_project_tab}
        />
      );
    }
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
      <ProjectWarningBanner project_id={project_id} />
      {(!fullscreen || fullscreen == "project") && (
        <Tabs project_id={project_id} />
      )}
      {is_deleted && <DeletedProjectWarning />}
      <StartButton project_id={project_id} />
      {renderEditorContent()}
      {render_project_content()}
      {render_project_modal()}
    </div>
  );
};
