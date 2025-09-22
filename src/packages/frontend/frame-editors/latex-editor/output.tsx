/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Combined output panel for LaTeX editor that includes:
- PDF preview
- Build log output
- Errors and warnings
With build controls at the top (build, force build, clean, etc.)
*/

import type { TabsProps } from "antd";
import { Spin, Tabs } from "antd";
import { useCallback, useMemo, useState } from "react";
import { useIntl } from "react-intl";

import { React, useEffect, useRedux } from "@cocalc/frontend/app-framework";
import {
  Icon,
  TableOfContents,
  TableOfContentsEntryList,
} from "@cocalc/frontend/components";
import { EditorState } from "@cocalc/frontend/frame-editors/frame-tree/types";
import { editor } from "@cocalc/frontend/i18n";
import { COLORS } from "@cocalc/util/theme";
import { Actions } from "./actions";
import { Build } from "./build";
import { ErrorsAndWarnings } from "./errors-and-warnings";
import { use_build_logs } from "./hooks";
import { PDFControls } from "./pdf-controls";
import { PDFJS } from "./pdfjs";
import { BuildLogs } from "./types";

interface OutputProps {
  id: string;
  name: string;
  actions: Actions;
  editor_state: EditorState;
  is_fullscreen: boolean;
  project_id: string;
  path: string;
  reload?: number;
  font_size: number;
  is_current: boolean;
  is_visible: boolean;
  status: string;
}

type TabType = "pdf" | "contents" | "build" | "errors";

export function Output(props: OutputProps) {
  const {
    id,
    name,
    actions,
    editor_state,
    is_fullscreen,
    project_id,
    path,
    reload,
    font_size,
    is_current,
    is_visible,
    status,
  } = props;

  const intl = useIntl();

  // Get stored tab from local view state, default to "pdf"
  const storedTab =
    useRedux([name, "local_view_state", id, "activeTab"]) || "pdf";
  const storedUserSelected =
    useRedux([name, "local_view_state", id, "userSelectedTab"]) || false;

  const [activeTab, setActiveTab] = useState<TabType>(storedTab);
  const [userSelectedTab, setUserSelectedTab] =
    useState<boolean>(storedUserSelected);

  const [totalPages, setTotalPages] = useState<number>(0);

  // Get the stored page that we want to restore to
  const storedPageToRestore: number =
    useRedux([name, "local_view_state", `${id}-pdf`, "currentPage"]) || 1;

  const [currentPage, setCurrentPage] = useState<number>(1);

  // Track viewport information for sync
  const [viewportInfo, setViewportInfo] = useState<{
    page: number;
    x: number;
    y: number;
  } | null>(null);

  // Callback to clear viewport info after successful sync
  const clearViewportInfo = useCallback(() => {
    setViewportInfo(null);
  }, []);

  // Flag to temporarily disable viewport tracking during auto-sync
  const [disableViewportTracking, setDisableViewportTracking] = useState(false);

  // Watch for sync in progress to disable viewport tracking
  const syncInProgress = useRedux([name, "sync_in_progress"]) ?? false;
  React.useEffect(() => {
    setDisableViewportTracking(syncInProgress);
  }, [syncInProgress]);

  // Table of contents data
  const contents: TableOfContentsEntryList | undefined = useRedux([
    name,
    "contents",
  ]);

  // Update table of contents when component mounts
  useEffect(() => {
    // We have to do this update
    // in the NEXT render loop so that the contents useRedux thing above
    // immediately fires again causing a re-render.  If we don't do this,
    // the first change doesn't get caught and it seems like the contents
    // takes a while to load.
    setTimeout(() => actions.updateTableOfContents(true));
  }, []);

  // Also disable viewport tracking during PDF scrolling operations
  const scrollIntoView = useRedux([name, "scroll_pdf_into_view"]);
  React.useEffect(() => {
    if (scrollIntoView) {
      setDisableViewportTracking(true);
      // Re-enable after scroll completes
      setTimeout(() => setDisableViewportTracking(false), 1000);
    }
  }, [scrollIntoView]);

  // Sync state with stored values when they change
  React.useEffect(() => {
    setActiveTab(storedTab);
    setUserSelectedTab(storedUserSelected);
    setCurrentPage(storedPageToRestore);
  }, [storedTab, storedUserSelected, storedPageToRestore]);

  // Handle SyncTeX requests to switch to PDF tab
  const switchToPdfTab = useRedux([name, "switch_output_to_pdf_tab"]);
  React.useEffect(() => {
    if (switchToPdfTab) {
      setActiveTab("pdf");
      setUserSelectedTab(true); // Prevent auto-switching from overriding this
      // Save to local view state
      const local_view_state = actions.store.get("local_view_state");
      actions.setState({
        local_view_state: local_view_state
          .setIn([id, "activeTab"], "pdf")
          .setIn([id, "userSelectedTab"], true),
        switch_output_to_pdf_tab: false,
      });
    }
  }, [switchToPdfTab, actions, id]);
  const build_logs: BuildLogs = use_build_logs(name);
  const knitr: boolean = useRedux([name, "knitr"]);

  // Get font size for PDF viewer
  const pdfFontSize =
    useRedux([name, "local_view_state", `${id}-pdf`, "font_size"]) || font_size;

  // Check if there are any running builds
  const hasRunningJobs = useMemo(() => {
    return (
      build_logs?.some((job) => {
        const jobJS = job?.toJS();
        return (
          jobJS?.type === "async" &&
          "status" in jobJS &&
          jobJS?.status === "running"
        );
      }) ?? false
    );
  }, [build_logs]);

  // Check if there are any errors or warnings
  const hasErrorsOrWarnings = useMemo(() => {
    if (!build_logs) return false;

    const tools = ["latex", "sagetex", "knitr", "pythontex"] as const;
    const groups = ["errors", "warnings", "typesetting"] as const;

    for (const tool of tools) {
      if (tool === "knitr" && !knitr) continue;
      for (const group of groups) {
        const content = build_logs.getIn([tool, "parse", group]) as any;
        if (content && content.size > 0) return true;
      }
    }
    return false;
  }, [build_logs, knitr]);

  // Auto-switch to errors when there are errors, PDF when everything is good
  // Only auto-switch if user hasn't manually selected a tab
  React.useEffect(() => {
    if (userSelectedTab) return; // Don't auto-switch if user manually selected

    let newTab: TabType | null = null;
    if (hasErrorsOrWarnings && activeTab !== "errors") {
      newTab = "errors";
    } else if (
      !hasErrorsOrWarnings &&
      !["pdf", "contents"].includes(activeTab)
    ) {
      newTab = "pdf";
    }

    if (newTab) {
      setActiveTab(newTab);
      // Save auto-switch to local view state
      const local_view_state = actions.store.get("local_view_state");
      actions.setState({
        local_view_state: local_view_state.setIn([id, "activeTab"], newTab),
      });
    }
  }, [hasErrorsOrWarnings, activeTab, userSelectedTab, actions, id]);

  const renderTabs = () => {
    const tabItems: NonNullable<TabsProps["items"]> = [
      {
        key: "pdf",
        label: (
          <span style={{ display: "flex", alignItems: "center", gap: "2px" }}>
            <Icon name="file-pdf" />
            PDF
          </span>
        ),
        children: (
          <div className="smc-vfill">
            <PDFControls
              actions={actions}
              id={`${id}-pdf`}
              totalPages={totalPages}
              currentPage={currentPage}
              viewportInfo={viewportInfo}
              onClearViewportInfo={clearViewportInfo}
            />
            <PDFJS
              id={`${id}-pdf`}
              name={name}
              actions={actions}
              editor_state={editor_state}
              is_fullscreen={is_fullscreen}
              project_id={project_id}
              path={path}
              reload={reload}
              font_size={pdfFontSize}
              is_current={is_current}
              is_visible={is_visible}
              status={status}
              initialPage={storedPageToRestore}
              onPageInfo={(currentPage, totalPages) => {
                setCurrentPage(currentPage);
                setTotalPages(totalPages);
                // Save current page to local view state using the same key as PDFControls
                const local_view_state = actions.store.get("local_view_state");
                actions.setState({
                  local_view_state: local_view_state.setIn(
                    [`${id}-pdf`, "currentPage"],
                    currentPage,
                  ),
                });
                // Trigger save to localStorage
                (actions as any)._save_local_view_state?.();
              }}
              onViewportInfo={(page, x, y) => {
                if (!disableViewportTracking) {
                  setViewportInfo({ page, x, y });
                }
              }}
            />
          </div>
        ),
      },
      {
        key: "contents",
        label: (
          <span style={{ display: "flex", alignItems: "center", gap: "2px" }}>
            <Icon name="align-right" />
            {intl.formatMessage(editor.table_of_contents_short)}
          </span>
        ),
        children: (
          <div className="smc-vfill">
            <TableOfContents
              contents={contents}
              fontSize={font_size}
              scrollTo={actions.scrollToHeading.bind(actions)}
            />
          </div>
        ),
      },
      {
        key: "build",
        label: (
          <span style={{ display: "flex", alignItems: "center", gap: "2px" }}>
            <Icon name="terminal" />
            {intl.formatMessage(editor.build_control_and_log_title_short)}
            {hasRunningJobs && <Spin size="small" />}
          </span>
        ),
        children: (
          <div className="smc-vfill">
            <Build
              name={name}
              actions={actions}
              path={path}
              font_size={font_size}
              status={status}
            />
          </div>
        ),
      },
      {
        key: "errors",
        label: (
          <span style={{ display: "flex", alignItems: "center", gap: "2px" }}>
            <Icon name="bug" />
            {intl.formatMessage(editor.errors_and_warnings_title_short)}
            {hasErrorsOrWarnings && (
              <Icon
                name="exclamation-circle"
                style={{ color: COLORS.ANTD_RED_WARN }}
              />
            )}
          </span>
        ),
        children: (
          <div className="smc-vfill">
            <ErrorsAndWarnings
              id={id}
              name={name}
              actions={actions}
              editor_state={editor_state}
              is_fullscreen={is_fullscreen}
              project_id={project_id}
              path={path}
              reload={reload}
              font_size={font_size}
            />
          </div>
        ),
      },
    ];

    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          border: "1px solid #d9d9d9",
          borderRadius: "6px",
          overflow: "hidden",
        }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={(key) => {
            const newTab = key as TabType;
            setUserSelectedTab(true);
            setActiveTab(newTab);
            // Save to local view state
            const local_view_state = actions.store.get("local_view_state");
            actions.setState({
              local_view_state: local_view_state
                .setIn([id, "activeTab"], newTab)
                .setIn([id, "userSelectedTab"], true),
            });
          }}
          size="small"
          style={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
          }}
          tabBarStyle={{
            margin: 0,
            padding: "0 8px",
            borderBottom: "1px solid #d9d9d9",
          }}
          items={tabItems}
          className="cocalc-latex-output-tabs"
        />
      </div>
    );
  };

  return (
    <div className="smc-vfill" style={{ position: "relative" }}>
      <div
        className="smc-vfill"
        style={{
          overflow: "hidden",
          position: "relative",
          minHeight: 0,
        }}
      >
        {renderTabs()}
      </div>
    </div>
  );
}
