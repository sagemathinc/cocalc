/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Button, Input, InputRef, Radio, Space, Tooltip } from "antd";
import immutable from "immutable";
import { useIntl } from "react-intl";
import { VirtuosoHandle } from "react-virtuoso";
import { Button as BootstrapButton } from "@cocalc/frontend/antd-bootstrap";
import {
  CSS,
  React,
  useAsyncEffect,
  useEffect,
  usePrevious,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  DropdownMenu,
  Icon,
  Text,
  type MenuItems,
  ErrorDisplay,
} from "@cocalc/frontend/components";
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
import type { ActiveFileSort } from "./files";
import { FilesSelectedControls } from "./files-controls";
import { FilesSelectButtons } from "./files-select-extra";
import { FlyoutClearFilter, FlyoutFilterWarning } from "./filter-warning";
import CloneProject from "@cocalc/frontend/project/explorer/clone";
import { SNAPSHOTS } from "@cocalc/util/consts/snapshots";
import { setSort } from "@cocalc/frontend/project/explorer/config";
import { BACKUPS } from "@cocalc/frontend/project/listing/use-backups";
import { lite } from "@cocalc/frontend/lite";

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
  refreshBackups?: () => void;
}

export function FilesHeader({
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
  refreshBackups,
}: Readonly<Props>): React.JSX.Element {
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
    await actions?.createFile({
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

  function renderSortButton(name: string, display): React.JSX.Element {
    const isActive = activeFileSort.column_name === name;
    const direction = isActive ? (
      <Icon
        style={{ marginLeft: FLYOUT_PADDING }}
        name={activeFileSort.is_descending ? "caret-up" : "caret-down"}
      />
    ) : undefined;

    return (
      <Radio.Button
        value={name}
        style={{ background: isActive ? COLORS.ANTD_BG_BLUE_L : undefined }}
        onClick={() =>
          setSort({
            column_name: name,
            project_id,
            path: current_path,
          })
        }
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
          refreshBackups={refreshBackups}
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
              {renderSortButton(
                "starred",
                <Icon name="star-filled" style={{ fontSize: "10pt" }} />,
              )}
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
          </Space.Compact>
          <Space.Compact direction="horizontal" size="small">
            {!lite ? (
              <Tooltip title="Recovery" placement="bottom">
                <span>
                  <DropdownMenu
                    button
                    size="small"
                    items={[
                      {
                        key: "snapshots-open",
                        label: "Open Snapshots",
                        onClick: () => {
                          actions?.open_directory(SNAPSHOTS);
                          track("snapshots", {
                            action: "open",
                            where: "flyout-files",
                          });
                        },
                      },
                      {
                        key: "snapshots-config",
                        label: "Configure Snapshots",
                        onClick: () => {
                          actions?.open_directory(SNAPSHOTS);
                          actions?.setState({ open_snapshot_schedule: true });
                        },
                      },
                      {
                        key: "snapshots-create",
                        label: "Create Snapshot",
                        onClick: () => {
                          actions?.open_directory(SNAPSHOTS);
                          actions?.setState({ open_create_snapshot: true });
                        },
                      },
                      { type: "divider" },
                      {
                        key: "backups-open",
                        label: "Open Backups",
                        onClick: () => {
                          actions?.open_directory(BACKUPS);
                          track("backups", {
                            action: "open",
                            where: "flyout-files",
                          });
                        },
                      },
                      {
                        key: "backups-config",
                        label: "Configure Backups",
                        onClick: () => {
                          actions?.open_directory(BACKUPS);
                          actions?.setState({ open_backup_schedule: true });
                        },
                      },
                      {
                        key: "backups-create",
                        label: "Create Backup",
                        onClick: () => {
                          actions?.open_directory(BACKUPS);
                          actions?.setState({ open_create_backup: true });
                        },
                      },
                    ] as MenuItems}
                    title={<Icon name="life-ring" />}
                  />
                </span>
              </Tooltip>
            ) : null}
            {kucalc === KUCALC_COCALC_COM ? (
              <CloneProject project_id={project_id} flyout />
            ) : null}
          </Space.Compact>
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
        {activeFilterWarning()}
        {createFileIfNotExists()}
        {renderFileCreationError()}
      </Space>
    </>
  );
}
