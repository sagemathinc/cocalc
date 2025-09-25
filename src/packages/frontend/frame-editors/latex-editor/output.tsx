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

// cSpell:ignore EOFPYTHON

import type { Data } from "@cocalc/frontend/frame-editors/frame-tree/pinch-to-zoom";
import type { TabsProps } from "antd";

import { List as AntdList, Avatar, Button, Spin, Tabs, Tag } from "antd";
import { List } from "immutable";
import { useCallback, useMemo, useState } from "react";
import { useIntl } from "react-intl";

import { React, useEffect, useRedux } from "@cocalc/frontend/app-framework";
import {
  Icon,
  TableOfContents,
  TableOfContentsEntryList,
} from "@cocalc/frontend/components";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { filenameIcon } from "@cocalc/frontend/file-associations";
import { EditorState } from "@cocalc/frontend/frame-editors/frame-tree/types";
import { project_api } from "@cocalc/frontend/frame-editors/generic/client";
import { editor, labels } from "@cocalc/frontend/i18n";
import { path_split, plural } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { Actions } from "./actions";
import { Build } from "./build";
import { WORD_COUNT_ICON } from "./constants";
import { ErrorsAndWarnings } from "./errors-and-warnings";
import { use_build_logs } from "./hooks";
import { PDFControls } from "./output-pdf-control";
import { PDFJS } from "./pdfjs";
import { useFileSummaries } from "./summarize-tex";
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

type TabType = "pdf" | "contents" | "files" | "build" | "errors" | "word_count";

interface FileListItem {
  path: string;
  displayPath: string;
  isMain: boolean;
  summary: string;
}

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
  const { fileSummaries, summariesLoading, refreshSummaries } =
    useFileSummaries(switch_to_files, project_id, path, homeDir, reload);

  // Word count state
  const [wordCountLoading, setWordCountLoading] = useState<boolean>(false);

  // Get word count from redux store
  const wordCount: string = useRedux([name, "word_count"]) ?? "";

  // Word count refresh function (debounce/reuseInFlight handled in actions)
  const refreshWordCount = useCallback(
    async (force: boolean = false) => {
      if (activeTab !== "word_count") return;
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
    if (activeTab === "word_count") {
      refreshWordCount(false);
    }
  }, [activeTab, reload, refreshWordCount]);

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

  // Get UI font size for output panel interface elements
  const uiFontSize: number =
    useRedux([name, "local_view_state", id, "font_size"]) ?? font_size;

  // Get PDF zoom level (completely separate from UI font size)
  const pdfZoom = useRedux([name, "local_view_state", id, "pdf_zoom"]) ?? 1.0;

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
                // Debounce the flag clearing to avoid clearing too early during scrolling
                clearTimeout((window as any).__autoSyncClearTimeout);
                (window as any).__autoSyncClearTimeout = setTimeout(() => {
                  actions.setState({ autoSyncInProgress: false });
                }, 500); // Wait longer to ensure scrolling has stabilized
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
        <span style={{ display: "flex", alignItems: "center", gap: "2px" }}>
          <Icon name="align-right" />
          {intl.formatMessage(editor.table_of_contents_short)}
        </span>
      ),
      children: (
        <div className="smc-vfill">
          <TableOfContents
            contents={contents}
            fontSize={uiFontSize}
            scrollTo={actions.scrollToHeading.bind(actions)}
          />
        </div>
      ),
    };
  }

  function renderFilesTab() {
    // Filter out the main file from the list
    const subFiles = switch_to_files
      .filter((filePath) => filePath !== path)
      .sort();
    const subFileCount = subFiles.size;

    // Compute the common prefix to strip (directory of main file)
    const prefix = path_split(path).head;
    const prefixWithSlash = prefix ? prefix + "/" : "";

    const listData = subFiles.toJS().map((filePath: string) => {
      const displayPath = filePath.startsWith(prefixWithSlash)
        ? filePath.slice(prefixWithSlash.length)
        : filePath;
      return {
        path: filePath,
        displayPath,
        isMain: false,
        summary: fileSummaries[filePath] ?? "Loading...",
      };
    });

    return {
      key: "files",
      label: (
        <span style={{ display: "flex", alignItems: "center", gap: "2px" }}>
          <Icon name="file" />
          Files
          {summariesLoading && <Spin size="small" />}
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
          {/* Fixed header with buttons and file count */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px",
              borderBottom: "1px solid #d9d9d9",
              backgroundColor: "white",
              flexShrink: 0,
            }}
          >
            <Button
              type="primary"
              size="small"
              icon={<Icon name="tex-file" />}
              onClick={() => actions.switch_to_file(path)}
            >
              Open Main File
            </Button>

            <span style={{ color: COLORS.GRAY_M, fontSize: uiFontSize }}>
              {subFileCount} {plural(subFileCount, "subfile")}
            </span>

            <Button
              size="small"
              icon={<Icon name="refresh" />}
              onClick={refreshSummaries}
              loading={summariesLoading}
              disabled={summariesLoading}
            >
              {intl.formatMessage(labels.refresh)}
            </Button>
          </div>

          {/* Scrollable list */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "10px",
            }}
          >
            <AntdList
              size="small"
              dataSource={listData}
              renderItem={(item: FileListItem) => (
                <AntdList.Item
                  style={{
                    cursor: "pointer",
                  }}
                  onClick={() => actions.switch_to_file(item.path)}
                >
                  <AntdList.Item.Meta
                    avatar={
                      <Avatar
                        size="default"
                        style={{
                          backgroundColor: "transparent",
                          color: COLORS.GRAY_D,
                        }}
                        icon={<Icon name={filenameIcon(item.path)} />}
                      />
                    }
                    title={
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: `${uiFontSize}px`,
                        }}
                      >
                        {item.displayPath}
                      </span>
                    }
                    description={
                      <span
                        style={{
                          color: COLORS.GRAY_M,
                          fontSize: uiFontSize - 2,
                        }}
                      >
                        <StaticMarkdown value={item.summary} />
                      </span>
                    }
                  />
                </AntdList.Item>
              )}
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
            font_size={uiFontSize}
            status={status}
          />
        </div>
      ),
    };
  }

  function renderWordCountTab() {
    return {
      key: "word_count",
      label: (
        <span style={{ display: "flex", alignItems: "center", gap: "2px" }}>
          <Icon name={WORD_COUNT_ICON} />
          Word Count
          {wordCountLoading && <Spin size="small" />}
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
          {/* Fixed header with refresh button */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "10px",
              borderBottom: "1px solid #d9d9d9",
              backgroundColor: "white",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                color: COLORS.GRAY_M,
                fontSize: uiFontSize - 1,
                display: "flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              <Icon name={WORD_COUNT_ICON} />
              Word Count Statistics
            </span>

            <Button
              size="small"
              icon={<Icon name="refresh" />}
              onClick={() => refreshWordCount(true)}
              loading={wordCountLoading}
              disabled={wordCountLoading}
            >
              {intl.formatMessage(labels.refresh)}
            </Button>
          </div>

          {/* Scrollable content */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "10px",
            }}
          >
            <pre
              style={{
                fontSize: `${uiFontSize}px`,
                fontFamily: "monospace",
                whiteSpace: "pre-wrap",
                wordWrap: "break-word",
                margin: 0,
                color: COLORS.GRAY_D,
              }}
            >
              {wordCount ||
                "Click refresh to generate word count statistics..."}
            </pre>
          </div>
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
            font_size={uiFontSize}
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
      renderWordCountTab(),
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
