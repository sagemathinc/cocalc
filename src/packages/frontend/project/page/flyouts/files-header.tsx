/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert, Button, Input, InputRef, Radio, Space, Tooltip } from "antd";
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
import { useProjectContext } from "@cocalc/frontend/project/context";
import { DirectoryListingEntry } from "@cocalc/frontend/project/explorer/types";
import track from "@cocalc/frontend/user-tracking";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";
import { separate_file_extension, strictMod } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { FIX_BORDER } from "../common";
import { DEFAULT_EXT, FLYOUT_PADDING } from "./consts";
import { ActiveFileSort } from "./files";

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
  directoryFiles: DirectoryListingEntry[];
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
}

export function FilesHeader(props: Readonly<Props>): JSX.Element {
  const {
    activeFileSort,
    directoryFiles,
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
  } = props;

  const {
    isRunning: projectIsRunning,
    project_id,
    actions,
  } = useProjectContext();

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

  function wrapDropzone(children: JSX.Element): JSX.Element {
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

  function renderSortButton(name: string, display: string): JSX.Element {
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

  function renderClearSearchSmall() {
    return (
      <Tooltip title="Clear search" placement="bottom">
        <Button
          size="small"
          type="text"
          style={{ float: "right", color: COLORS.GRAY_M }}
          onClick={() => setSearchState("")}
          icon={<Icon name="close-circle-filled" />}
        />
      </Tooltip>
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
        <Alert
          type="info"
          banner
          showIcon={false}
          style={{ padding: FLYOUT_PADDING, margin: 0 }}
          description={
            <>
              {renderClearSearchSmall()}
              Only showing files matching "<Text code>{file_search}</Text>".
            </>
          }
        />
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
              {renderClearSearchSmall()}
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
            <Icon name="warning" /> Stale directory listing
          </>
        }
        description={
          <>
            To update,{" "}
            <a
              onClick={() => {
                redux.getActions("projects").start_project(project_id);
              }}
            >
              start this project
            </a>
            .
          </>
        }
      />
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
              <Button
                className={uploadClassName}
                size="small"
                disabled={!projectIsRunning || disableUploads}
              >
                <Icon name={"upload"} />
              </Button>
              <Tooltip title="Create a new file" placement="bottom">
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
              title={hidden ? "Hide hidden files" : "Show hidden files"}
              bsSize="xsmall"
              style={{ flex: "0" }}
              onClick={() => actions?.setState({ show_hidden: !hidden })}
            >
              <Icon name={hidden ? "eye" : "eye-slash"} />
            </BootstrapButton>
            <BootstrapButton
              title={show_masked ? "Hide masked files" : "Show masked files"}
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
                  "Open the filesystem snapshots of this project, which may also be helpful in recovering past versions."
                }
                icon={<Icon name={"life-ring"} />}
              />
            </Space.Compact>
          ) : undefined}
        </div>
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
