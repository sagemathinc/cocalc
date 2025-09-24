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
import { Spin, Tabs, Tag } from "antd";
import { List } from "immutable";
import { useCallback, useMemo, useState } from "react";
import { useIntl } from "react-intl";

import type { Data } from "@cocalc/frontend/frame-editors/frame-tree/pinch-to-zoom";

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

type TabType = "pdf" | "contents" | "files" | "build" | "errors";

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

  const [activeTab, setActiveTab] = useState<TabType>(storedTab);

  const [totalPages, setTotalPages] = useState<number>(0);

  // Get the stored page that we want to restore to
  const storedPageToRestore: number =
    useRedux([name, "local_view_state", id, "currentPage"]) || 1;

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

  // List of LaTeX files in the project
  const switch_to_files: List<string> = useRedux([name, "switch_to_files"]);

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
    setCurrentPage(storedPageToRestore);
  }, [storedTab, storedPageToRestore]);

  // Handle SyncTeX requests to switch to PDF tab
  const switchToPdfTab = useRedux([name, "switch_output_to_pdf_tab"]);
  React.useEffect(() => {
    if (switchToPdfTab) {
      setActiveTab("pdf");
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
    useRedux([name, "local_view_state", id, "font_size"]) || font_size;

  // Get PDF zoom level (separate from font size)
  const pdfZoom = useRedux([name, "local_view_state", id, "pdf_zoom"]) || 1.0;

  // Handle zoom changes from pinch-to-zoom or wheel gestures
  const handleZoomChange = useCallback(
    (data: Data) => {
      // Convert fontSize to zoom scale (fontSize 14 = 1.0 zoom)
      const newZoom = data.fontSize / 14;
      const local_view_state = actions.store.get("local_view_state");
      actions.setState({
        local_view_state: local_view_state.setIn([id, "pdf_zoom"], newZoom),
      });
      // Also trigger save to localStorage
      actions.save_local_view_state();
    },
    [actions, id],
  );

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

  // Get counts for errors, warnings, and typesetting problems
  const errorCounts = useMemo(() => {
    if (!build_logs) return { errors: 0, warnings: 0, typesetting: 0 };

    const tools = ["latex", "sagetex", "knitr", "pythontex"] as const;
    let errors = 0;
    let warnings = 0;
    let typesetting = 0;

    for (const tool of tools) {
      if (tool === "knitr" && !knitr) continue;
      const errorContent = build_logs.getIn([tool, "parse", "errors"]) as any;
      const warningContent = build_logs.getIn([
        tool,
        "parse",
        "warnings",
      ]) as any;
      const typesettingContent = build_logs.getIn([
        tool,
        "parse",
        "typesetting",
      ]) as any;

      if (errorContent) errors += errorContent.size;
      if (warningContent) warnings += warningContent.size;
      if (typesettingContent) typesetting += typesettingContent.size;
    }

    return { errors, warnings, typesetting };
  }, [build_logs, knitr]);

  // No automatic tab switching - let user control tabs manually
  // Errors are indicated with red exclamation icon only

  function renderPdfTab() {
    return {
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
            id={id}
            totalPages={totalPages}
            currentPage={currentPage}
            viewportInfo={viewportInfo}
            onClearViewportInfo={clearViewportInfo}
          />
          <PDFJS
            id={id}
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
            zoom={pdfZoom}
            onZoom={handleZoomChange}
            onPageInfo={(currentPage, totalPages) => {
              setCurrentPage(currentPage);
              setTotalPages(totalPages);
              // Save current page to local view state using the same key as PDFControls
              const local_view_state = actions.store.get("local_view_state");
              actions.setState({
                local_view_state: local_view_state.setIn(
                  [id, "currentPage"],
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
    };
  }

  function renderContentsTab() {
    return {
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
    };
  }

  function renderFilesTab() {
    // Sort files so main file appears first
    const sortedFiles = switch_to_files.sort((a, b) => {
      if (a === path) return -1;
      if (b === path) return 1;
      return a.localeCompare(b);
    });

    return {
      key: "files",
      label: (
        <span style={{ display: "flex", alignItems: "center", gap: "2px" }}>
          <Icon name="file" />
          Files
        </span>
      ),
      children: (
        <div className="smc-vfill" style={{ padding: "10px" }}>
          {sortedFiles.map((filePath) => (
            <div
              key={filePath}
              style={{
                padding: "8px",
                cursor: "pointer",
                borderBottom: `1px solid ${COLORS.GRAY_LL}`,
                fontFamily: "monospace",
                fontSize: "12px",
              }}
              onClick={() => actions.switch_to_file(filePath)}
            >
              {path === filePath ? <b>{filePath} (main)</b> : filePath}
            </div>
          ))}
        </div>
      ),
    };
  }

  function renderBuildTab() {
    return {
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
    };
  }

  function renderErrorsTab() {
    const { errors, warnings, typesetting } = errorCounts;
    const hasAnyIssues = errors > 0 || warnings > 0 || typesetting > 0;

    return {
      key: "errors",
      label: (
        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <Icon name="bug" />
          {intl.formatMessage(editor.errors_and_warnings_title_short)}
          {hasAnyIssues && (
            <span style={{ display: "flex", gap: "2px" }}>
              {errors > 0 && <Tag color="red">{errors}</Tag>}
              {warnings > 0 && <Tag color="orange">{warnings}</Tag>}
              {typesetting > 0 && <Tag color="blue">{typesetting}</Tag>}
            </span>
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
    };
  }

  function renderTabs() {
    const tabItems: NonNullable<TabsProps["items"]> = [
      renderPdfTab(),
      renderContentsTab(),
      ...(switch_to_files?.size > 1 ? [renderFilesTab()] : []),
      renderBuildTab(),
      renderErrorsTab(),
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
  }

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
