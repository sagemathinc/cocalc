/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Button, Input, InputRef, Radio, Space, Tooltip } from "antd";
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
import { COLORS } from "@cocalc/util/theme";
import { FIX_BORDER } from "../common";
import { DEFAULT_EXT, FLYOUT_PADDING } from "./consts";
import { ActiveFileSort } from "./files";
import { FilesSelectedControls } from "./files-controls";
import { FilesSelectButtons } from "./files-select-extra";
import { FlyoutClearFilter, FlyoutFilterWarning } from "./filter-warning";
import ForkProject from "@cocalc/frontend/project/explorer/fork";

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
  publicFiles: Set<string>;
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
    publicFiles,
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
  const show_masked = useTypedRedux({ project_id }, "show_masked");
  const file_creation_error = useTypedRedux(
    { project_id },
    "file_creation_error",
  );
  const current_path = useTypedRedux({ project_id }, "current_path");

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

  function filterKeyHandler(e: React.KeyboardEvent) {
    // if arrow key down or up, then scroll to next item
    const dx = e.code === "ArrowDown" ? 1 : e.code === "ArrowUp" ? -1 : 0;
    if (dx != 0) {
      doScroll(dx);
    }

    // left arrow key: go up a directory
    else if (e.code === "ArrowLeft") {
      if (current_path != "") {
        actions?.set_current_path(
          current_path.split("/").slice(0, -1).join("/"),
        );
      }
    }

    // return key pressed
    else if (e.code === "Enter") {
      if (scrollIdx != null) {
        open(e, scrollIdx);
        setScrollIdx(null);
      } else if (file_search != "") {
        if (!isEmpty) {
          setSearchState("");
          open(e, 0);
        } else {
          if (e.shiftKey) {
            // only if shift is pressed as well, create a file or folder
            // this avoids accidentally creating jupyter notebooks (the default file type)
            createFileOrFolder();
            setSearchState("");
          } else {
            // we change a state, such that at least something happens if user hits return
            setHighlighNothingFound(true);
          }
        }
      }
    }

    // if esc key is pressed, clear search and reset scroll index
    else if (e.key === "Escape") {
      handleSearchChange("");
    }
  }

  function wrapDropzone(children: React.JSX.Element): React.JSX.Element {
    if (disableUploads) return children;
    return (
      <FileUploadWrapper
        project_id={project_id}
        dest_path={current_path}
        config={{ clickable: `.${uploadClassName}` }}
        className="smc-vfill"
      >
        {children}
      </FileUploadWrapper>
    );
  }

  function renderSortButton(name: string, display: string): React.JSX.Element {
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
    if (file_search === "") return;
    if (!isEmpty) {
      return (
        <FlyoutFilterWarning filter={file_search} setFilter={setSearchState} />
      );
    }
  }

  function createFileIfNotExists() {
    if (file_search === "" || !isEmpty) return;

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
          publicFiles={publicFiles}
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
            <Radio.Group size="small">
              {renderSortButton("name", "Name")}
              {renderSortButton("size", "Size")}
              {renderSortButton("time", "Time")}
              {renderSortButton("type", "Type")}
            </Radio.Group>
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
          <Input
            ref={refInput}
            placeholder="Filter..."
            size="small"
            value={file_search}
            onKeyDown={filterKeyHandler}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => setScrollIdxHide(false)}
            onBlur={() => setScrollIdxHide(true)}
            style={{ flex: "1" }}
            allowClear
            prefix={<Icon name="search" />}
          />
          <Space.Compact direction="horizontal" size="small">
            <BootstrapButton
              title={intl.formatMessage(labels.hidden_files, { hidden })}
              bsSize="xsmall"
              style={{ flex: "0" }}
              onClick={() => actions?.setState({ show_hidden: !hidden })}
            >
              <Icon name={hidden ? "eye" : "eye-slash"} />
            </BootstrapButton>
            <BootstrapButton
              title={intl.formatMessage(labels.masked_files, {
                masked: show_masked,
              })}
              bsSize="xsmall"
              style={{ flex: "0" }}
              active={!show_masked}
              onClick={() => actions?.setState({ show_masked: !show_masked })}
            >
              <Icon name={"mask"} />
            </BootstrapButton>
          </Space.Compact>
          {kucalc === KUCALC_COCALC_COM ? (
            <Space.Compact direction="horizontal" size="small">
              <Button
                onClick={() => {
                  actions?.open_directory(".snapshots");
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
              <ForkProject project_id={project_id} flyout />
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
        {activeFilterWarning()}
        {createFileIfNotExists()}
        {renderFileCreationError()}
      </Space>
    </>
  );
}
