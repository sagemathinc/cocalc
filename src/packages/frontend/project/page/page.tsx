/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Modal } from "antd";

import {
  React,
  redux,
  useActions,
  useEffect,
  useRedux,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import {
  FrameContext,
  defaultFrameContext,
} from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { COLORS } from "@cocalc/util/theme";
import { AnonymousName } from "../anonymous-name";
import { ProjectWarningBanner } from "../project-banner";
import { StartButton } from "../start-button";
import { DeletedProjectWarning } from "../warnings/deleted";
import { DiskSpaceWarning } from "../warnings/disk-space";
import { OOMWarning } from "../warnings/oom";
import { RamWarning } from "../warnings/ram";
import { Content } from "./content";
import { isFixedTab } from "./file-tab";
import { Flyout, FlyoutHeader } from "./flyouts/flyout";
import { getFlyoutExpanded } from "./flyouts/local-state";
import HomePageButton from "./home-page/button";
import { useProjectStatus } from "./project-status-hook";
import { SoftwareEnvUpgrade } from "./software-env-upgrade";
import Tabs, { FIXED_TABS_BG_COLOR, VerticalFixedTabs } from "./tabs";
//import FirstSteps from "@cocalc/frontend/project/explorer/file-listing/first-steps";

const PAGE_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  flex: 1,
  overflow: "hidden",
} as const;

export const FIX_BORDER = `1px solid ${COLORS.GRAY_L0}`;

export const FIX_BORDERS: React.CSSProperties = {
  borderTop: FIX_BORDER,
  borderRight: FIX_BORDER,
} as const;

interface Props {
  project_id: string;
  is_active: boolean;
}

export const ProjectPage: React.FC<Props> = (props: Props) => {
  const { project_id, is_active } = props;
  const hideActionButtons = useTypedRedux({ project_id }, "hideActionButtons");
  const flyout = useTypedRedux({ project_id }, "flyout");
  const actions = useActions({ project_id });
  const is_deleted = useRedux([
    "projects",
    "project_map",
    project_id,
    "deleted",
  ]);
  useProjectStatus(actions);
  const fullscreen = useTypedRedux("page", "fullscreen");
  const active_top_tab = useTypedRedux("page", "active_top_tab");
  const modal = useTypedRedux({ project_id }, "modal");
  const open_files_order = useTypedRedux({ project_id }, "open_files_order");
  const active_project_tab = useTypedRedux(
    { project_id },
    "active_project_tab"
  );
  const [homePageButtonWidth, setHomePageButtonWidth] =
    React.useState<number>(80);

  useEffect(() => {
    const name = getFlyoutExpanded(project_id);
    if (isFixedTab(name)) {
      actions?.setFlyoutExpanded(name, true, false);
    }
  }, [project_id]);

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
            isVisible: active_project_tab === tab_name,
            redux,
          }}
        >
          <Content
            is_visible={
              active_top_tab == project_id && active_project_tab === tab_name
            }
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
        open={is_active && modal != null}
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

  function renderFlyout() {
    if (!flyout) return;
    return <Flyout flyout={flyout} project_id={project_id} />;
  }

  function renderFlyoutHeader() {
    if (!flyout) return;
    return (
      <FlyoutHeader
        flyout={flyout}
        project_id={project_id}
        narrowerPX={hideActionButtons ? homePageButtonWidth : 0}
      />
    );
  }

  if (open_files_order == null) {
    return <Loading />;
  }

  const style = {
    ...PAGE_STYLE,
    ...(!fullscreen ? { paddingTop: "3px" } : undefined),
  } as const;

  return (
    <div className="container-content" style={style}>
      <AnonymousName project_id={project_id} />
      <DiskSpaceWarning project_id={project_id} />
      <RamWarning project_id={project_id} />
      <OOMWarning project_id={project_id} />
      <SoftwareEnvUpgrade project_id={project_id} />
      <ProjectWarningBanner project_id={project_id} />
      {(!fullscreen || fullscreen == "project") && (
        <div style={{ display: "flex", margin: "0" }}>
          <HomePageButton
            project_id={project_id}
            active={active_project_tab == "home"}
            width={homePageButtonWidth}
          />
          {renderFlyoutHeader()}
          <div style={{ flex: 1, overflow: "hidden" }}>
            <Tabs project_id={project_id} />
          </div>
        </div>
      )}
      {is_deleted && <DeletedProjectWarning />}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {!hideActionButtons && (!fullscreen || fullscreen == "project") && (
          <div
            style={{
              background: FIXED_TABS_BG_COLOR,
              borderRadius: "0",
              borderTop: FIX_BORDERS.borderTop,
              borderRight: flyout == null ? FIX_BORDERS.borderRight : undefined,
            }}
          >
            <VerticalFixedTabs
              project_id={project_id}
              activeTab={active_project_tab}
              setHomePageButtonWidth={setHomePageButtonWidth}
            />
          </div>
        )}
        {renderFlyout()}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflowX: "auto",
          }}
        >
          <StartButton project_id={project_id} />
          {renderEditorContent()}
          {render_project_content()}
          {render_project_modal()}
        </div>
      </div>
    </div>
  );
};
