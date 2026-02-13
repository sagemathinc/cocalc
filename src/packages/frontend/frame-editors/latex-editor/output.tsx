/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Combined output panel for LaTeX editor that includes:
- PDF preview
- Build log output
- Errors and warnings
- Statistics (word count)
- Sub-files
With build controls at the top (build, force build, clean, etc.)
*/

// cSpell:ignore EOFPYTHON Estad

import type { TabsProps } from "antd";

import { Alert, Button, Spin, Tabs, Tag } from "antd";
import { List } from "immutable";
import { useCallback, useMemo, useState } from "react";
import { defineMessage, useIntl } from "react-intl";

import type { CSS } from "@cocalc/frontend/app-framework";
import type { Data } from "@cocalc/frontend/frame-editors/frame-tree/pinch-to-zoom";

import { React, useEffect, useRedux } from "@cocalc/frontend/app-framework";
import {
  Icon,
  TableOfContents,
  TableOfContentsEntryList,
  Text,
  Tip,
} from "@cocalc/frontend/components";
import { EditorState } from "@cocalc/frontend/frame-editors/frame-tree/types";
import { project_api } from "@cocalc/frontend/frame-editors/generic/client";
import { editor, labels } from "@cocalc/frontend/i18n";
import { DEFAULT_FONT_SIZE } from "@cocalc/util/consts/ui";

import { TITLE_BAR_BORDER } from "../frame-tree/style";
import { Actions } from "./actions";
import { Build } from "./build";
import { WORD_COUNT_ICON } from "./constants";
import { ErrorsAndWarnings } from "./errors-and-warnings";
import { useBuildLogs } from "./hooks";
import { PDFControls } from "./output-control";
import { OutputFiles } from "./output-files";
import { OutputStats } from "./output-stats";
import { PDFJS } from "./pdfjs";
import { BuildLogs } from "./types";
import { useTexSummaries } from "./use-summarize";
import { OUTPUT_HEADER_STYLE } from "./util";

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

type TabType = "pdf" | "contents" | "files" | "build" | "problems" | "stats";

const LABEL_STYLE: CSS = {
  display: "flex",
  alignItems: "center",
  gap: "2px",
} as const;

const STATS_LABEL = defineMessage({
  id: "latex.output.stats_tab.label",
  defaultMessage: "Stats",
  description:
    "Short abbreviation for 'Statistics' used as tab label. Should be abbreviated like 'Stats' in English for 'Stats' in German, or 'Estad' in Spanish - a recognizable short form, not the full word.",
});

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
    useRedux([name, "local_view_state", id, "activeTab"]) ?? "pdf";

  const [activeTab, setActiveTab] = useState<TabType>(storedTab);

  const [totalPages, setTotalPages] = useState<number>(0);

  // Get the stored page that we want to restore to
  const storedPageToRestore: number =
    useRedux([name, "local_view_state", id, "currentPage"]) ?? 1;

  const [currentPage, setCurrentPage] = useState<number>(1);

  // Track viewport information for sync
  const [viewportInfo, setViewportInfo] = useState<{
    page: number;
    x: number;
    y: number;
  } | null>(null);

  // Track page dimensions for manual sync
  const [pageDimensions, setPageDimensions] = useState<
    { width: number; height: number }[]
  >([]);

  // Callback to clear viewport info after successful sync
  const clearViewportInfo = useCallback(() => {
    setViewportInfo(null);
  }, []);

  // Table of contents data
  const contents: TableOfContentsEntryList | undefined = useRedux([
    name,
    "contents",
  ]);

  // List of LaTeX files in the project
  const switch_to_files: List<string> = useRedux([name, "switch_to_files"]);

  // Home directory - computed once since it never changes
  const [homeDir, setHomeDir] = useState<string | null>(null);

  // File summaries using the custom hook
  const { fileSummaries, summariesLoading, refreshSummaries } = useTexSummaries(
    switch_to_files,
    project_id,
    path,
    homeDir,
    reload,
  );

  // Word count state
  const [wordCountLoading, setWordCountLoading] = useState<boolean>(false);

  // Get word count from redux store
  const wordCount: string = useRedux([name, "word_count"]) ?? "";

  // Word count refresh function (debounce/reuseInFlight handled in actions)
  const refreshWordCount = useCallback(
    async (force: boolean = false) => {
      if (activeTab !== "stats") return;
      setWordCountLoading(true);
      try {
        const timestamp = force ? Date.now() : actions.last_save_time();
        await actions.word_count(timestamp, force, true); // skipFramePopup = true
      } catch (error) {
        console.warn("Word count failed:", error);
      } finally {
        setWordCountLoading(false);
      }
    },
    [actions, activeTab],
  );

  // Fetch home directory once when component mounts or project_id changes
  React.useEffect(() => {
    const fetchHomeDir = async () => {
      try {
        const projectAPI = await project_api(project_id);
        const dir = await projectAPI.getHomeDirectory();
        setHomeDir(dir);
      } catch (error) {
        console.warn("Failed to fetch home directory:", error);
        setHomeDir(null);
      }
    };

    fetchHomeDir();
  }, [project_id]);

  // Update table of contents when component mounts
  useEffect(() => {
    // We have to do this update
    // in the NEXT render loop so that the contents useRedux thing above
    // immediately fires again causing a re-render.  If we don't do this,
    // the first change doesn't get caught and it seems like the contents
    // takes a while to load.
    setTimeout(() => actions.updateTableOfContents(true));
  }, []);

  // Refresh word count when tab is opened or document changes
  useEffect(() => {
    if (activeTab === "stats") {
      refreshWordCount(false);
    }
  }, [activeTab, reload, refreshWordCount]);

  // Refresh TOC when contents tab is opened
  useEffect(() => {
    if (activeTab === "contents") {
      actions.updateTableOfContents(true);
    }
  }, [activeTab, actions]);

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

  const build_logs: BuildLogs = useBuildLogs(name);
  const knitr: boolean = useRedux([name, "knitr"]);

  // Get UI font size for output panel interface elements
  const uiFontSize: number =
    useRedux([name, "local_view_state", id, "font_size"]) ?? font_size;

  // Get PDF zoom level (completely separate from UI font size)
  const pdfZoom = useRedux([name, "local_view_state", id, "pdf_zoom"]) ?? 1.0;

  // Handle zoom changes from pinch-to-zoom or wheel gestures
  const handleZoomChange = useCallback(
    (data: Data) => {
      // Convert fontSize to zoom scale (DEFAULT_FONT_SIZE = 1.0 zoom)
      const newZoom = data.fontSize / DEFAULT_FONT_SIZE;
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

  function renderPdfTab() {
    return {
      key: "pdf",
      label: (
        <span style={LABEL_STYLE}>
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
            pageDimensions={pageDimensions}
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
            font_size={font_size}
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
              setViewportInfo({ page, x, y });

              // Clear auto sync flag when PDF viewport changes (forward sync completion)
              const autoSyncInProgress =
                actions.store.get("autoSyncInProgress");
              if (autoSyncInProgress) {
                // Clear immediately to allow next forward sync without delay
                actions.setState({ autoSyncInProgress: false });
              }
            }}
            onPageDimensions={setPageDimensions}
          />
        </div>
      ),
    };
  }

  function renderContentsTab() {
    return {
      key: "contents",
      label: (
        <span style={LABEL_STYLE}>
          <Icon name="align-right" />
          {intl.formatMessage(editor.table_of_contents_short)}
        </span>
      ),
      children: (
        <div
          className="smc-vfill"
          style={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
          }}
        >
          <div style={OUTPUT_HEADER_STYLE}>
            <span style={LABEL_STYLE}>
              <Icon name="align-right" />
              {intl.formatMessage(editor.table_of_contents_name)}
            </span>
            <Button
              size="small"
              icon={<Icon name="refresh" />}
              onClick={() => actions.updateTableOfContents(true)}
            >
              {intl.formatMessage(labels.refresh)}
            </Button>
          </div>
          <div style={{ flex: 1, overflow: "hidden" }}>
            <TableOfContents
              contents={contents}
              fontSize={uiFontSize}
              scrollTo={actions.scrollToHeading.bind(actions)}
              ifEmpty={
                <Alert
                  type="info"
                  message="Table of Contents is empty"
                  description={
                    <>
                      Add <Text code>{"\\section{...}"}</Text> and{" "}
                      <Text code>{"\\subsection{...}"}</Text> commands to your
                      LaTeX document to create a table of contents.
                    </>
                  }
                  style={{ margin: "15px" }}
                />
              }
            />
          </div>
        </div>
      ),
    };
  }

  function renderBuildTab() {
    return {
      key: "build",
      label: (
        <span style={LABEL_STYLE}>
          {hasRunningJobs ? <Spin size="small" /> : <Icon name="terminal" />}
          {intl.formatMessage(editor.build_control_and_log_title_short)}
        </span>
      ),
      children: (
        <div className="smc-vfill">
          <Build
            name={name}
            actions={actions}
            path={path}
            font_size={uiFontSize}
            status={status}
          />
        </div>
      ),
    };
  }

  // Problems are indicated with color coded numbers.
  // Show only the highest priority counter: errors > warnings > typesetting
  function renderProblemsCounter(
    errors: number,
    warnings: number,
    typesetting: number,
  ) {
    const hasAnyIssues = errors > 0 || warnings > 0 || typesetting > 0;
    if (!hasAnyIssues) return null;

    // Determine which counter to show (highest priority)
    let count: number;
    let color: string;
    if (errors > 0) {
      count = errors;
      color = "red";
    } else if (warnings > 0) {
      count = warnings;
      color = "orange";
    } else {
      count = typesetting;
      color = "blue";
    }

    // Comprehensive tooltip showing all three counters
    const tipTitle = intl.formatMessage(
      {
        id: "latex.output.problems_counter.tooltip",
        defaultMessage: `{errors, plural, =0 {No errors} one {# error} other {# errors}},
        {warnings, plural, =0 {no warnings} one {# warning} other {# warnings}},
        and {typesetting, plural, =0 {no typesetting problems} one {# typesetting problem} other {# typesetting problems}}`,
      },
      { errors, warnings, typesetting },
    );

    return (
      <Tip title={tipTitle} placement="top">
        <Tag color={color}>{count}</Tag>
      </Tip>
    );
  }

  function renderProblemsTab() {
    const { errors, warnings, typesetting } = errorCounts;

    return {
      key: "problems",
      label: (
        <span style={LABEL_STYLE}>
          <Icon name="bug" style={{ marginRight: "0" }} />
          {intl.formatMessage(editor.errors_and_warnings_title_short)}
          {renderProblemsCounter(errors, warnings, typesetting)}
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
            font_size={uiFontSize}
          />
        </div>
      ),
    };
  }

  function renderFilesTab() {
    return {
      key: "files",
      label: (
        <span style={LABEL_STYLE}>
          {summariesLoading ? <Spin size="small" /> : <Icon name="file" />}
          Files
        </span>
      ),
      children: (
        <OutputFiles
          switch_to_files={switch_to_files}
          path={path}
          fileSummaries={fileSummaries}
          summariesLoading={summariesLoading}
          refreshSummaries={refreshSummaries}
          actions={actions}
          uiFontSize={uiFontSize}
        />
      ),
    };
  }

  function renderStatsTab() {
    return {
      key: "stats",
      label: (
        <span style={LABEL_STYLE}>
          {wordCountLoading ? (
            <Spin size="small" />
          ) : (
            <Icon name={WORD_COUNT_ICON} />
          )}
          {intl.formatMessage(STATS_LABEL)}
        </span>
      ),
      children: (
        <OutputStats
          wordCountLoading={wordCountLoading}
          wordCount={wordCount}
          refreshWordCount={refreshWordCount}
          uiFontSize={uiFontSize}
        />
      ),
    };
  }

  function renderTabs() {
    const tabItems: NonNullable<TabsProps["items"]> = [
      renderPdfTab(),
      renderContentsTab(),
      ...(switch_to_files?.size > 1 ? [renderFilesTab()] : []),
      renderBuildTab(),
      renderProblemsTab(),
      renderStatsTab(),
    ];

    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          border: TITLE_BAR_BORDER,
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
            borderBottom: TITLE_BAR_BORDER,
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
