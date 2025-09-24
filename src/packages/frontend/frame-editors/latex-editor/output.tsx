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

import { Avatar, List as AntdList, Button, Spin, Tabs, Tag } from "antd";
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
import { EditorState } from "@cocalc/frontend/frame-editors/frame-tree/types";
import {
  exec,
  project_api,
} from "@cocalc/frontend/frame-editors/generic/client";
import { filenameIcon } from "@cocalc/frontend/file-associations";
import { editor, labels } from "@cocalc/frontend/i18n";
import { path_split, plural } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { Actions } from "./actions";
import { Build } from "./build";
import { ErrorsAndWarnings } from "./errors-and-warnings";
import { use_build_logs } from "./hooks";
import { PDFControls } from "./pdf-controls";
import { PDFJS } from "./pdfjs";
import { BuildLogs } from "./types";

const SUMMARIZE_TEX_FILES = `
import sys
import json
import re
import os

def clean_latex_text(text):
    """Remove LaTeX commands and clean up text for readability"""
    # Remove comments
    text = re.sub(r'%.*$', '', text, flags=re.MULTILINE)

    # Remove common LaTeX commands but preserve content
    text = re.sub(r'\\\\(title|author|section|subsection|subsubsection|chapter)\\{([^}]*)\\}', r'**\\2**', text)
    text = re.sub(r'\\\\(emph|textit)\\{([^}]*)\\}', r'_\\2_', text)
    text = re.sub(r'\\\\(textbf|textsc)\\{([^}]*)\\}', r'**\\2**', text)

    # Remove other LaTeX commands
    text = re.sub(r'\\\\[a-zA-Z]+\\*?\\{[^}]*\\}', '', text)
    text = re.sub(r'\\\\[a-zA-Z]+\\*?', '', text)

    # Remove LaTeX environments but keep content
    text = re.sub(r'\\\\begin\\{[^}]*\\}', '', text)
    text = re.sub(r'\\\\end\\{[^}]*\\}', '', text)

    # Remove excessive whitespace
    text = re.sub(r'\\n\\s*\\n', '\\n', text)
    text = re.sub(r'\\s+', ' ', text).strip()

    return text

def extract_summary(filepath, home_dir):
    """Extract a meaningful summary from a LaTeX file"""
    if not filepath.endswith(('.tex', '.latex')):
        return "Non-LaTeX file"

    # Handle different path formats
    if filepath.startswith('~/'):
        # Path starts with ~/ - replace ~ with home directory
        expanded_path = os.path.join(home_dir, filepath[2:])
    elif os.path.isabs(filepath):
        # Absolute path - use as is
        expanded_path = filepath
    else:
        # Relative path - join with home directory
        expanded_path = os.path.join(home_dir, filepath)

    if not os.path.exists(expanded_path):
        return f"File not found: {expanded_path}"

    try:
        with open(expanded_path, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
    except Exception as e:
        return f"Error reading file: {str(e)}"

    # Extract first meaningful content (skip documentclass, packages, etc.)
    lines = content.split('\\n')
    useful_lines = []
    in_preamble = True
    has_document_env = '\\\\begin{document}' in content

    for line in lines:
        line = line.strip()
        if not line or line.startswith('%'):
            continue

        # Check if we're past the preamble
        if '\\\\begin{document}' in line:
            in_preamble = False
            continue

        # For files without \\begin{document}, treat everything as content
        if not has_document_env:
            in_preamble = False

        if in_preamble:
            # Extract title, author from preamble
            if line.startswith('\\\\title{') or line.startswith('\\\\author{'):
                useful_lines.append(line)
        else:
            # Extract meaningful content
            if any(cmd in line for cmd in ['\\\\section', '\\\\subsection', '\\\\chapter', '\\\\subsubsection']):
                useful_lines.append(line)
            elif line and not line.startswith('\\\\') and len(line) > 3:  # Lowered threshold
                useful_lines.append(line)
            elif line.startswith('\\\\') and len(line) > 10:  # Include some LaTeX commands
                useful_lines.append(line)

        # Limit to first 15 useful lines
        if len(useful_lines) >= 15:
            break

    # If we found some useful content, use it
    if useful_lines:
        summary_text = '\\n'.join(useful_lines[:8])  # Use more lines
        cleaned = clean_latex_text(summary_text)
        if cleaned and len(cleaned.strip()) > 0:
            # Convert to single line and truncate if too long
            cleaned = ' '.join(cleaned.split())  # Remove all newlines and extra spaces
            if len(cleaned) > 200:
                cleaned = cleaned[:197] + "..."
            return cleaned

    # Fallback: show raw content (first 200 chars, cleaned)
    # Remove comments first
    raw_content = re.sub(r'%.*$', '', content, flags=re.MULTILINE)
    raw_content = ' '.join(raw_content.split())  # Convert to single line

    if len(raw_content) > 200:
        raw_content = raw_content[:197] + "..."

    return raw_content if raw_content else "LaTeX document"

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: script.py <home_dir> <file1> <file2> ..."}))
        return

    home_dir = sys.argv[1]
    results = {}

    for filepath in sys.argv[2:]:
        results[filepath] = extract_summary(filepath, home_dir)

    print(json.dumps(results, ensure_ascii=False))

if __name__ == "__main__":
    main()
`;

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

interface FileListItem {
  path: string;
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

  // File summaries state with caching (1 minute max)
  const [fileSummaries, setFileSummaries] = useState<Record<string, string>>(
    {},
  );
  const [lastSummariesFetch, setLastSummariesFetch] = useState<number>(0);
  const [summariesLoading, setSummariesLoading] = useState<boolean>(false);

  // Home directory - computed once since it never changes
  const [homeDir, setHomeDir] = useState<string | null>(null);

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

  // Get UI font size for output panel interface elements
  const uiFontSize =
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

  // Function to generate file summaries using Python script
  const generateFileSummaries = useCallback(
    async (forceRefresh: boolean = false) => {
      if (!switch_to_files || switch_to_files.size === 0) return;

      const now = Date.now();
      const oneMinute = 60 * 1000;

      // Only update if it's been more than 1 minute since last fetch (unless forced)
      if (!forceRefresh && now - lastSummariesFetch < oneMinute) return;

      setSummariesLoading(true);

      try {
        // Execute Python script with file list as arguments
        const fileList = switch_to_files.toJS();

        // Write Python script to temporary file to avoid command line escaping issues
        const scriptPath = "/tmp/tex_summarizer.py";
        await exec({
          command: `cat > "${scriptPath}" << 'EOFPYTHON'\n${SUMMARIZE_TEX_FILES}\nEOFPYTHON`,
          project_id,
          path: path_split(path).head,
          timeout: 5,
        });

        // Use the pre-fetched home directory
        if (!homeDir) {
          console.warn("Home directory not available yet");
          return;
        }

        // The switch_to_files contains canonical paths relative to the project root
        // Pass the actual home directory to the Python script
        const result = await exec({
          command: "python3",
          args: [scriptPath, homeDir, ...fileList],
          project_id,
          path: path_split(path).head, // Run from current file's directory
          timeout: 30, // 30 second timeout
        });

        if (result.exit_code === 0 && result.stdout) {
          try {
            const summaries = JSON.parse(result.stdout);
            setFileSummaries(summaries);
          } catch (parseError) {
            console.warn("Failed to parse summary results:", parseError);
            // Fallback to basic summaries
            const fallbackSummaries: Record<string, string> = {};
            switch_to_files.forEach((filePath) => {
              fallbackSummaries[filePath] = "LaTeX document";
            });
            setFileSummaries(fallbackSummaries);
          }
        } else {
          console.warn(
            "Summary generation failed:",
            result.stderr ?? "Unknown error",
          );
          // Fallback to basic summaries
          const fallbackSummaries: Record<string, string> = {};
          switch_to_files.forEach((filePath) => {
            fallbackSummaries[filePath] = "LaTeX document";
          });
          setFileSummaries(fallbackSummaries);
        }
      } catch (error) {
        console.warn("Error generating summaries:", error);
        // Fallback to basic summaries
        const fallbackSummaries: Record<string, string> = {};
        switch_to_files.forEach((filePath) => {
          fallbackSummaries[filePath] = "LaTeX document";
        });
        setFileSummaries(fallbackSummaries);
      } finally {
        setLastSummariesFetch(now);
        setSummariesLoading(false);
      }
    },
    [switch_to_files, lastSummariesFetch, reload],
  );

  // Manual refresh function that bypasses the rate limiting
  const refreshSummaries = useCallback(
    () => generateFileSummaries(true),
    [generateFileSummaries],
  );

  // Generate file summaries when files change
  React.useEffect(() => {
    if (switch_to_files && switch_to_files.size > 1) {
      generateFileSummaries();
    }
  }, [switch_to_files, generateFileSummaries]);

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

    const listData = subFiles.toJS().map((filePath: string) => ({
      path: filePath,
      isMain: false,
      summary: fileSummaries[filePath] ?? "Loading...",
    }));

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
                        {item.path}
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
