/*
 *  This file is part of CoCalc: Copyright © 2023-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  Alert,
  Button,
  Input,
  InputRef,
  Radio,
  Select,
  Space,
  Tooltip,
} from "antd";
import immutable from "immutable";
import { FormattedMessage, useIntl } from "react-intl";
import { VirtuosoHandle } from "react-virtuoso";

import { Button as BootstrapButton } from "@cocalc/frontend/antd-bootstrap";
import {
  CSS,
  React,
  redux,
  useAsyncEffect,
  useEffect,
  usePrevious,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { ErrorDisplay, Icon, Text } from "@cocalc/frontend/components";
import { FileUploadWrapper } from "@cocalc/frontend/file-upload";
import { labels } from "@cocalc/frontend/i18n";
import { useProjectContext } from "@cocalc/frontend/project/context";
import {
  DirectoryListing,
  DirectoryListingEntry,
} from "@cocalc/frontend/project/explorer/types";
import track from "@cocalc/frontend/user-tracking";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";
import { separate_file_extension, strictMod } from "@cocalc/util/misc";
import { isTerminalMode } from "@cocalc/frontend/project/explorer/file-listing";
import { TerminalModeDisplay } from "@cocalc/frontend/project/explorer/file-listing/terminal-mode-display";
import { TypeFilterLabel } from "@cocalc/frontend/project/explorer/file-listing/utils";
import { SearchHistoryDropdown } from "@cocalc/frontend/project/explorer/search-history-dropdown";
import { useExplorerSearchHistory } from "@cocalc/frontend/project/explorer/use-search-history";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { COLORS } from "@cocalc/util/theme";
import { FIX_BORDER } from "../common";
import { DEFAULT_EXT, FLYOUT_PADDING } from "./consts";
import { ActiveFileSort } from "./files";
import { FilesSelectedControls } from "./files-controls";
import { FilesSelectButtons } from "./files-select-extra";
import { FlyoutClearFilter, FlyoutFilterWarning } from "./filter-warning";

function searchToFilename(search: string): string {
  if (search.endsWith(" ")) {
    return search.trim(); // base name, without extension
  }
  search = search.trim();
  if (search === "") return "";
  // if last character is "/" return the search string
  if (search.endsWith("/")) return search;
  if (search.endsWith(".")) return `${search}${DEFAULT_EXT}`;
  const { ext } = separate_file_extension(search);
  if (ext.length > 0) return search;
  if (ext === "") return `${search}.${DEFAULT_EXT}`;
  return `${search}.${DEFAULT_EXT}`;
}

interface Props {
  activeFileSort: ActiveFileSort;
  disableUploads: boolean;
  handleSearchChange: (search: string) => void;
  isEmpty: boolean;
  open: (e: React.KeyboardEvent | React.MouseEvent, idx: number) => void;
  refInput: React.RefObject<InputRef>;
  scrollIdx: number | null;
  setScrollIdx: (idx: number | null) => void;
  setScrollIdxHide: (hide: boolean) => void;
  setSearchState: (search: string) => void;
  virtuosoRef: React.RefObject<VirtuosoHandle>;
  showFileSharingDialog(file): void;
  checked_files: immutable.Set<string>;
  directoryFiles: DirectoryListing;
  getFile: (path: string) => DirectoryListingEntry | undefined;
  activeFile: DirectoryListingEntry | null;
  modeState: ["open" | "select", (mode: "open" | "select") => void];
  clearAllSelections: (switchMode: boolean) => void;
  selectAllFiles: () => void;
  typeFilter: string | null;
  setTypeFilter: (filter: string | null) => void;
  typeFilterOptions: string[];
  /** Navigate within the flyout (independent of the explorer). */
  onNavigate?: (path: string) => void;
  /** True when a filesystem update is buffered and awaiting user confirmation. */
  hasPendingUpdate?: boolean;
  /** Flush the buffered listing update. */
  onRefreshListing?: () => void;
  /** Called when a terminal command (prefixed with ! or /) finishes executing. */
  onTerminalCommand?: () => void;
}

export function FilesHeader(props: Readonly<Props>): React.JSX.Element {
  const {
    activeFileSort,
    disableUploads,
    handleSearchChange,
    isEmpty,
    open,
    refInput,
    scrollIdx,
    setScrollIdx,
    setScrollIdxHide,
    setSearchState,
    virtuosoRef,
    showFileSharingDialog,
    checked_files,
    directoryFiles,
    getFile,
    activeFile,
    modeState,
    selectAllFiles,
    clearAllSelections,
    typeFilter,
    setTypeFilter,
    typeFilterOptions,
  } = props;

  const intl = useIntl();

  const {
    isRunning: projectIsRunning,
    project_id,
    actions,
  } = useProjectContext();

  const [mode, setMode] = modeState;

  const uploadClassName = `upload-button-flyout-${project_id}`;

  const kucalc = useTypedRedux("customize", "kucalc");
  const file_search = useTypedRedux({ project_id }, "file_search") ?? "";
  const hidden = useTypedRedux({ project_id }, "show_hidden");
  const file_creation_error = useTypedRedux(
    { project_id },
    "file_creation_error",
  );
  const current_path = useTypedRedux({ project_id }, "current_path");

  const {
    history,
    initialized: historyInitialized,
    addHistoryEntry,
  } = useExplorerSearchHistory(project_id);

  const [historyMode, setHistoryMode] = React.useState(false);
  const [historyIndex, setHistoryIndex] = React.useState(0);
  const [termError, setTermError] = React.useState<string | undefined>();
  const [termStdout, setTermStdout] = React.useState<string | undefined>();
  const termIdRef = React.useRef(0);

  const [highlighNothingFound, setHighlighNothingFound] = React.useState(false);
  const file_search_prev = usePrevious(file_search);

  useEffect(() => {
    if (!highlighNothingFound) return;
    if (!isEmpty || file_search != file_search_prev || file_search === "") {
      setHighlighNothingFound(false);
    }
  }, [isEmpty, file_search, highlighNothingFound]);

  // disable highlightNothingFound shortly after being set
  useAsyncEffect(async () => {
    if (!highlighNothingFound) return;
    await new Promise((resolve) => setTimeout(resolve, 333));
    setHighlighNothingFound(false);
  }, [highlighNothingFound]);

  function doScroll(dx: -1 | 1) {
    const nextIdx = strictMod(
      scrollIdx == null ? (dx === 1 ? 0 : -1) : scrollIdx + dx,
      directoryFiles.length,
    );
    setScrollIdx(nextIdx);
    virtuosoRef.current?.scrollToIndex({
      index: nextIdx,
      align: "center",
    });
  }

  async function createFileOrFolder() {
    const fn = searchToFilename(file_search);
    await actions?.create_file({
      name: fn,
      current_path,
    });
  }

  // Close history mode if history becomes empty or index is out of range.
  React.useEffect(() => {
    if (!historyMode) return;
    if (history.length === 0) {
      setHistoryMode(false);
      setHistoryIndex(0);
      return;
    }
    if (historyIndex >= history.length) {
      setHistoryIndex(history.length - 1);
    }
  }, [history, historyIndex, historyMode]);

  function applyHistorySelection(): void {
    const value = history[historyIndex];
    setHistoryMode(false);
    setHistoryIndex(0);
    if (value == null) return;
    setScrollIdx(null);
    handleSearchChange(value);
  }

  function runTerminalCommand(command: string): void {
    const input = command.trim();
    if (!input) return;

    setTermError(undefined);
    setTermStdout(undefined);
    props.onTerminalCommand?.();

    const id = ++termIdRef.current;
    const input0 = input + '\necho $HOME "`pwd`"';
    const compute_server_id = redux
      .getProjectStore(project_id)
      ?.get("compute_server_id");

    // Execute in the user's project sandbox via the CoCalc project API
    // (same pattern as search-bar.tsx terminal mode).
    webapp_client.exec({
      project_id,
      command: input0,
      timeout: 10,
      max_output: 100000,
      bash: true,
      path: current_path,
      err_on_exit: false,
      compute_server_id,
      filesystem: true,
      cb(err, output) {
        if (id !== termIdRef.current) return;
        if (err) {
          setTermError(JSON.stringify(err));
        } else {
          if (output.stdout) {
            let s = output.stdout.trim();
            let i = s.lastIndexOf("\n");
            if (i === -1) {
              output.stdout = "";
            } else {
              s = s.slice(i + 1);
              output.stdout = output.stdout.slice(0, i);
            }
            i = s.indexOf(" ");
            const full_path = s.slice(i + 1);
            if (full_path.slice(0, i) === s.slice(0, i)) {
              const path = s.slice(2 * i + 2);
              actions?.open_directory(path);
            }
          }
          if (!output.stderr) {
            actions?.log({ event: "termInSearch", input });
          }
          setTermError(output.stderr || undefined);
          setTermStdout(output.stdout || undefined);
          if (!output.stderr) {
            setSearchState("");
          }
        }
      },
    });
  }

  function filterKeyHandler(e: React.KeyboardEvent) {
    // --- History mode navigation ---
    if (e.code === "ArrowUp") {
      if (!historyMode && historyInitialized && history.length > 0) {
        setHistoryMode(true);
        setHistoryIndex(0);
        return;
      }
      if (historyMode) {
        setHistoryIndex((idx) => Math.max(idx - 1, 0));
        return;
      }
      doScroll(-1);
      return;
    }

    if (e.code === "ArrowDown") {
      if (historyMode) {
        setHistoryIndex((idx) =>
          Math.min(idx + 1, Math.max(0, history.length - 1)),
        );
        return;
      }
      doScroll(1);
      return;
    }

    // left arrow key: go up a directory
    if (e.code === "ArrowLeft") {
      if (current_path != "") {
        actions?.set_current_path(
          current_path.split("/").slice(0, -1).join("/"),
        );
      }
      return;
    }

    // return key pressed
    if (e.code === "Enter") {
      if (historyMode) {
        applyHistorySelection();
        return;
      }
      if (isTerminalMode(file_search)) {
        const command = file_search.slice(1);
        if (command.trim().length > 0) {
          addHistoryEntry(file_search);
        }
        runTerminalCommand(command);
        return;
      }
      if (scrollIdx != null) {
        addHistoryEntry(file_search);
        open(e, scrollIdx);
        setScrollIdx(null);
      } else if (file_search != "") {
        if (!isEmpty) {
          addHistoryEntry(file_search);
          setSearchState("");
          open(e, 0);
        } else {
          if (e.shiftKey) {
            createFileOrFolder();
            setSearchState("");
          } else {
            setHighlighNothingFound(true);
          }
        }
      }
      return;
    }

    // if esc key is pressed, close history or clear search
    if (e.key === "Escape") {
      if (historyMode) {
        setHistoryMode(false);
        setHistoryIndex(0);
        return;
      }
      if (file_search) {
        addHistoryEntry(file_search);
      }
      handleSearchChange("");
    }
  }

  function wrapDropzone(children: React.JSX.Element): React.JSX.Element {
    if (disableUploads) return children;
    return (
      <FileUploadWrapper
        project_id={project_id}
        dest_path={current_path}
        event_handlers={{
          complete: () => actions?.fetch_directory_listing(),
        }}
        config={{ clickable: `.${uploadClassName}` }}
        className="smc-vfill"
      >
        {children}
      </FileUploadWrapper>
    );
  }

  function renderSortButton(
    name: string,
    display: string | React.JSX.Element,
  ): React.JSX.Element {
    const isActive = activeFileSort.get("column_name") === name;
    const direction = isActive ? (
      <Icon
        style={{ marginLeft: FLYOUT_PADDING }}
        name={activeFileSort.get("is_descending") ? "caret-up" : "caret-down"}
      />
    ) : undefined;

    return (
      <Radio.Button
        value={name}
        style={{ background: isActive ? COLORS.ANTD_BG_BLUE_L : undefined }}
        onClick={() => actions?.set_sorted_file_column(name)}
      >
        {display}
        {direction}
      </Radio.Button>
    );
  }

  function renderFileCreationError() {
    if (!file_creation_error) return;
    return (
      <ErrorDisplay
        banner
        error={file_creation_error}
        componentStyle={{
          margin: 0,
          maxHeight: "200px",
        }}
        onClose={(): void => {
          actions?.setState({ file_creation_error: "" });
        }}
      />
    );
  }

  function activeFilterWarning() {
    if (file_search === "" || isTerminalMode(file_search)) return;
    if (!isEmpty) {
      return (
        <FlyoutFilterWarning filter={file_search} setFilter={setSearchState} />
      );
    }
  }

  function createFileIfNotExists() {
    if (file_search === "" || !isEmpty || isTerminalMode(file_search)) return;

    const what = file_search.trim().endsWith("/") ? "directory" : "file";
    const style: CSS = {
      padding: FLYOUT_PADDING,
      margin: 0,
      ...(highlighNothingFound ? { fontWeight: "bold" } : undefined),
    };
    return (
      <Alert
        type="info"
        banner
        showIcon={false}
        style={style}
        description={
          <>
            <div>
              <FlyoutClearFilter setFilter={setSearchState} />
              No files match the current filter.
            </div>
            <div>
              Hit <Text code>Shift+Return</Text> to create the {what}{" "}
              <Text code>{searchToFilename(file_search)}</Text>
            </div>
          </>
        }
      />
    );
  }

  function staleListingWarning() {
    if (projectIsRunning || (directoryFiles?.length ?? 0) === 0) return;

    return (
      <Alert
        type="warning"
        banner
        showIcon={false}
        style={{ padding: FLYOUT_PADDING, margin: 0 }}
        message={
          <>
            <Icon name="warning" />{" "}
            <FormattedMessage
              id="page.flyouts.files.stale-directory.message"
              defaultMessage={"stale directory listing"}
              description={"outdated information in a file directory listing"}
            />
          </>
        }
        description={
          <FormattedMessage
            id="page.flyouts.files.stale-directory.description"
            defaultMessage={"To update, <A>start this project</A>."}
            description={
              "to update the outdated information in a file directory listing of a project"
            }
            values={{
              A: (c) => (
                <a
                  onClick={() => {
                    redux.getActions("projects").start_project(project_id);
                  }}
                >
                  {c}
                </a>
              ),
            }}
          />
        }
      />
    );
  }

  function renderFileControls() {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          width: "100%",
        }}
      >
        <FilesSelectedControls
          project_id={project_id}
          checked_files={checked_files}
          directoryFiles={directoryFiles}
          open={open}
          showFileSharingDialog={showFileSharingDialog}
          getFile={getFile}
          mode="top"
          activeFile={activeFile}
        />
        <FilesSelectButtons
          setMode={setMode}
          checked_files={checked_files}
          mode={mode}
          selectAllFiles={selectAllFiles}
          clearAllSelections={clearAllSelections}
        />
      </div>
    );
  }

  return (
    <>
      <Space
        direction="vertical"
        style={{
          flex: "0 0 auto",
          paddingBottom: FLYOUT_PADDING,
          paddingRight: FLYOUT_PADDING,
        }}
      >
        {wrapDropzone(
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <Space size="small">
              <Radio.Group size="small">
                {renderSortButton(
                  "starred",
                  <Icon name="star-filled" style={{ fontSize: "10pt" }} />,
                )}
                {renderSortButton("name", "Name")}
                {renderSortButton("size", "Size")}
                {renderSortButton("time", "Time")}
              </Radio.Group>
              <Select
                size="small"
                allowClear
                placeholder="Type"
                value={typeFilter}
                onChange={(val) =>
                  setTypeFilter(val === "__clear__" || val == null ? null : val)
                }
                style={{ minWidth: 80 }}
                popupMatchSelectWidth={false}
                className={
                  typeFilter != null
                    ? "cc-flyout-type-filter-active"
                    : undefined
                }
                options={[
                  ...(typeFilter != null
                    ? [
                        {
                          label: (
                            <span
                              style={{
                                color: COLORS.GRAY,
                                display: "block",
                                borderBottom: `1px solid ${COLORS.GRAY_L0}`,
                                paddingBottom: 4,
                                marginBottom: 2,
                              }}
                            >
                              <Icon name="times-circle" /> Clear filter
                            </span>
                          ),
                          value: "__clear__",
                        },
                      ]
                    : []),
                  ...typeFilterOptions.map((ext) => ({
                    label: <TypeFilterLabel ext={ext} />,
                    value: ext,
                  })),
                ]}
              />
            </Space>
            <Space.Compact direction="horizontal" size={"small"}>
              <Tooltip
                title={intl.formatMessage(labels.upload_tooltip)}
                placement="bottom"
              >
                <Button
                  className={uploadClassName}
                  size="small"
                  disabled={!projectIsRunning || disableUploads}
                >
                  <Icon name={"upload"} />
                </Button>
              </Tooltip>
              <Tooltip
                title={intl.formatMessage(labels.new_tooltip)}
                placement="bottom"
              >
                <Button
                  size="small"
                  type="primary"
                  onClick={() => actions?.toggleFlyout("new")}
                >
                  <Icon name={"plus-circle"} />
                </Button>
              </Tooltip>
            </Space.Compact>
          </div>,
        )}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            width: "100%",
            gap: FLYOUT_PADDING,
          }}
        >
          <div style={{ flex: "1", position: "relative" }}>
            <Input
              ref={refInput}
              placeholder={'Filter or "!" / "/" for Terminal...'}
              size="small"
              value={file_search}
              onKeyDown={filterKeyHandler}
              onChange={(e) => {
                setHistoryMode(false);
                setHistoryIndex(0);
                handleSearchChange(e.target.value);
              }}
              onFocus={() => setScrollIdxHide(false)}
              onBlur={() => {
                setScrollIdxHide(true);
                setHistoryMode(false);
                setHistoryIndex(0);
              }}
              style={{ width: "100%" }}
              allowClear
              status={
                file_search.length > 0 && !isTerminalMode(file_search)
                  ? "warning"
                  : undefined
              }
              prefix={<Icon name="search" />}
            />
            {historyMode && history.length > 0 && (
              <SearchHistoryDropdown
                history={history}
                historyIndex={historyIndex}
                setHistoryIndex={setHistoryIndex}
                onSelect={applyHistorySelection}
                style={{ top: "32px" }}
              />
            )}
          </div>
          <Space.Compact direction="horizontal" size="small">
            <BootstrapButton
              title={intl.formatMessage(labels.hidden_files, { hidden })}
              bsSize="xsmall"
              style={{ flex: "0" }}
              onClick={() => actions?.setState({ show_hidden: !hidden })}
            >
              <Icon name={hidden ? "eye" : "eye-slash"} />
            </BootstrapButton>
          </Space.Compact>
          {kucalc === KUCALC_COCALC_COM ? (
            <Space.Compact direction="horizontal" size="small">
              <Button
                onClick={() => {
                  if (props.onNavigate) {
                    props.onNavigate(".snapshots");
                  } else {
                    actions?.open_directory(".snapshots");
                  }
                  track("snapshots", {
                    action: "open",
                    where: "flyout-files",
                  });
                }}
                title={
                  "Open the file system snapshots of this project, which may also be helpful in recovering past versions."
                }
                icon={<Icon name={"life-ring"} />}
              />
            </Space.Compact>
          ) : undefined}
        </div>
        {renderFileControls()}
      </Space>
      <Space
        direction="vertical"
        style={{
          flex: "0 0 auto",
          borderBottom: FIX_BORDER,
        }}
      >
        {staleListingWarning()}
        {props.hasPendingUpdate && (
          <Alert
            type="warning"
            banner
            showIcon={false}
            style={{ padding: FLYOUT_PADDING, margin: 0, cursor: "pointer" }}
            onClick={props.onRefreshListing}
            message={
              <>
                <Icon name="sync-alt" /> {intl.formatMessage(labels.refresh)}
              </>
            }
          />
        )}
        {isTerminalMode(file_search) && (
          <TerminalModeDisplay style={{ padding: FLYOUT_PADDING, margin: 0 }} />
        )}
        {termError && (
          <pre
            style={{
              color: COLORS.FG_RED,
              margin: 0,
              padding: FLYOUT_PADDING,
              maxHeight: "200px",
              overflow: "auto",
              fontSize: "12px",
              position: "relative",
            }}
          >
            <a
              onClick={() => setTermError(undefined)}
              style={{
                position: "absolute",
                right: "5px",
                top: "0px",
                color: COLORS.GRAY_M,
              }}
            >
              <Icon name="times" />
            </a>
            {termError}
          </pre>
        )}
        {termStdout && (
          <pre
            style={{
              margin: 0,
              padding: FLYOUT_PADDING,
              maxHeight: "200px",
              overflow: "auto",
              fontSize: "12px",
              position: "relative",
            }}
          >
            <a
              onClick={() => setTermStdout(undefined)}
              style={{
                position: "absolute",
                right: "5px",
                top: "0px",
                color: COLORS.GRAY_M,
              }}
            >
              <Icon name="times" />
            </a>
            {termStdout}
          </pre>
        )}
        {activeFilterWarning()}
        {createFileIfNotExists()}
        {renderFileCreationError()}
      </Space>
    </>
  );
}
