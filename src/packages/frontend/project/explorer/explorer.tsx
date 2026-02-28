/*
 *  This file is part of CoCalc: Copyright © 2020–2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { DndContext, useDraggable } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { Alert, Button as AntButton, Tree } from "antd";

import { Button as BootstrapButton } from "@cocalc/frontend/antd-bootstrap";
import type { TreeDataNode, TreeProps } from "antd";
import * as _ from "lodash";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FormattedMessage } from "react-intl";

import { UsersViewing } from "@cocalc/frontend/account/avatar/users-viewing";
import {
  project_redux_name,
  redux,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { ShallowTypedMap } from "@cocalc/frontend/app-framework/ShallowTypedMap";
import {
  A,
  ActivityDisplay,
  ErrorDisplay,
  Icon,
  Loading,
  Paragraph,
  SettingBox,
} from "@cocalc/frontend/components";
import { ComputeServerDocStatus } from "@cocalc/frontend/compute/doc-status";
import SelectComputeServerForFileExplorer from "@cocalc/frontend/compute/select-server-for-explorer";
import { CustomSoftwareReset } from "@cocalc/frontend/custom-software/reset-bar";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import { FileUploadWrapper } from "@cocalc/frontend/file-upload";
import { Library } from "@cocalc/frontend/library";
import * as LS from "@cocalc/frontend/misc/local-storage-typed";
import { FLYOUT_PADDING } from "@cocalc/frontend/project/page/flyouts/consts";
import { useStarredFilesManager } from "@cocalc/frontend/project/page/flyouts/store";
import { MainConfiguration } from "@cocalc/frontend/project_configuration";
import { ProjectActions } from "@cocalc/frontend/project_store";
import { ProjectStatus } from "@cocalc/frontend/todo-types";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import * as misc from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";

import AskNewFilename from "../ask-filename";
import { useProjectContext } from "../context";
import { ActionBar, ActionBarInfo } from "./action-bar";
import { useFolderDrop } from "./dnd/file-dnd-provider";
import { FetchDirectoryErrors } from "./fetch-directory-errors";
import { FileListing } from "./file-listing";
import { default_ext } from "./file-listing/utils";
import { MiscSideButtons } from "./misc-side-buttons";
import { NewButton } from "./new-button";
import { PathNavigator } from "./path-navigator";
import { SearchBar } from "./search-bar";
import ExplorerTour from "./tour/tour";
import { ListingItem } from "./types";

export type Configuration = ShallowTypedMap<{ main: MainConfiguration }>;

const error_style: React.CSSProperties = {
  marginRight: "1ex",
  whiteSpace: "pre-line",
  position: "absolute",
  zIndex: 15,
  right: "5px",
  boxShadow: "5px 5px 5px grey",
} as const;

const FLEX_ROW_STYLE: React.CSSProperties = {
  display: "flex",
  flexFlow: "row wrap",
  justifyContent: "space-between",
  alignItems: "stretch",
} as const;

const TREE_HOME_KEY = "__home__";
const DIRECTORY_TREE_DEFAULT_WIDTH_PX = 280;
const DIRECTORY_TREE_MIN_WIDTH_PX = 180;
const DIRECTORY_TREE_MAX_WIDTH_PX = 520;

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && !isNaN(value) && value > 0;
}

function directoryTreeWidthKey(project_id: string): string {
  return `${project_id}::explorer-directory-tree-width`;
}

function getDirectoryTreeWidth(project_id: string): number {
  const width = LS.get<number>(directoryTreeWidthKey(project_id));
  if (!isPositiveNumber(width)) return DIRECTORY_TREE_DEFAULT_WIDTH_PX;
  return Math.max(
    DIRECTORY_TREE_MIN_WIDTH_PX,
    Math.min(width, DIRECTORY_TREE_MAX_WIDTH_PX),
  );
}

function setDirectoryTreeWidth(project_id: string, width: number): void {
  LS.set(directoryTreeWidthKey(project_id), width);
}

function directoryTreeVisibleKey(project_id: string): string {
  return `${project_id}::explorer-directory-tree-visible`;
}

function getDirectoryTreeVisible(project_id: string): boolean {
  const val = LS.get<boolean>(directoryTreeVisibleKey(project_id));
  return val === true;
}

function setDirectoryTreeVisible(project_id: string, visible: boolean): void {
  LS.set(directoryTreeVisibleKey(project_id), visible);
}

const MAX_TREE_EXPANDED = 20;

function directoryTreeExpandedKeysKey(project_id: string): string {
  return `${project_id}::explorer-directory-tree-expanded-keys`;
}

function getDirectoryTreeExpandedKeys(project_id: string): string[] {
  const keys = LS.get<string[]>(directoryTreeExpandedKeysKey(project_id));
  if (!Array.isArray(keys) || keys.length === 0) return [TREE_HOME_KEY];
  // Always ensure home key is present
  if (!keys.includes(TREE_HOME_KEY)) keys.unshift(TREE_HOME_KEY);
  return keys;
}

function saveDirectoryTreeExpandedKeys(
  project_id: string,
  keys: string[],
): void {
  LS.set(
    directoryTreeExpandedKeysKey(project_id),
    keys.slice(0, MAX_TREE_EXPANDED),
  );
}

function directoryTreeScrollTopKey(project_id: string): string {
  return `${project_id}::explorer-directory-tree-scroll-top`;
}

function getDirectoryTreeScrollTop(project_id: string): number {
  const val = LS.get<number>(directoryTreeScrollTopKey(project_id));
  return typeof val === "number" && val >= 0 ? val : 0;
}

function saveDirectoryTreeScrollTop(
  project_id: string,
  scrollTop: number,
): void {
  LS.set(directoryTreeScrollTopKey(project_id), scrollTop);
}

const TREE_PANEL_STYLE: React.CSSProperties = {
  overflowY: "auto",
  overflowX: "hidden",
  padding: "0 4px 0 0",
} as const;

export function Explorer() {
  const { project_id, actions, group } = useProjectContext();
  const name = project_redux_name(project_id);

  // -- Project store fields --
  const active_file_sort = useTypedRedux({ project_id }, "active_file_sort");
  const current_path = useTypedRedux({ project_id }, "current_path") ?? "";
  const activity = useTypedRedux({ project_id }, "activity");
  const file_search = useTypedRedux({ project_id }, "file_search") ?? "";
  const show_directory_tree = useTypedRedux(
    { project_id },
    "show_directory_tree",
  );
  // Restore tree visibility from localStorage on mount
  useEffect(() => {
    const saved = getDirectoryTreeVisible(project_id);
    if (saved && !show_directory_tree) {
      actions?.setState({ show_directory_tree: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project_id]);
  const show_hidden = useTypedRedux({ project_id }, "show_hidden");
  const hide_masked_files = useTypedRedux({ project_id }, "hide_masked_files");
  // Reset hide_masked_files on directory change — it is a temporary per-directory toggle.
  useEffect(() => {
    if (hide_masked_files) {
      actions?.setState({ hide_masked_files: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current_path]);
  const error = useTypedRedux({ project_id }, "error");
  const checked_files = useTypedRedux({ project_id }, "checked_files");
  const selected_file_index = useTypedRedux(
    { project_id },
    "selected_file_index",
  );
  const file_creation_error = useTypedRedux(
    { project_id },
    "file_creation_error",
  );
  const ext_selection = useTypedRedux({ project_id }, "ext_selection");
  const displayed_listing = useTypedRedux(
    { project_id },
    "displayed_listing",
  ) as any;
  const show_library = useTypedRedux({ project_id }, "show_library");
  const configuration = useTypedRedux({ project_id }, "configuration") as
    | Configuration
    | undefined;
  const available_features = useTypedRedux(
    { project_id },
    "available_features",
  );
  const show_custom_software_reset = useTypedRedux(
    { project_id },
    "show_custom_software_reset",
  );
  const explorerTour = useTypedRedux({ project_id }, "explorerTour");
  const compute_server_id = useTypedRedux({ project_id }, "compute_server_id");
  // trigger table init
  useTypedRedux({ project_id }, "public_paths");

  // -- Global store fields --
  const project_map = useTypedRedux("projects", "project_map");
  const other_settings = useTypedRedux("account", "other_settings");
  const is_logged_in = useTypedRedux("account", "is_logged_in");
  const kucalc = useTypedRedux("customize", "kucalc");
  const site_name = useTypedRedux("customize", "site_name");
  const images = useTypedRedux("compute_images", "images");

  // -- Local state --
  const [shiftIsDown, setShiftIsDown] = useState(false);
  const [searchFocused, setSearchFocused] = useState(true);
  const [directoryTreeWidth, setDirectoryTreeWidthState] = useState<number>(
    () => getDirectoryTreeWidth(project_id),
  );
  const [oldDirectoryTreeWidth, setOldDirectoryTreeWidth] =
    useState<number>(directoryTreeWidth);

  // -- Refs for ExplorerTour --
  const newFileRef = useRef<any>(null);
  const searchAndTerminalBar = useRef<any>(null);
  const fileListingRef = useRef<any>(null);
  const currentDirectoryRef = useRef<any>(null);
  const miscButtonsRef = useRef<any>(null);

  // -- Keyboard event listeners (replaces jQuery) --
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Shift") setShiftIsDown(true);
    }
    function handleKeyUp(e: KeyboardEvent) {
      if (e.key === "Shift") setShiftIsDown(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const width = getDirectoryTreeWidth(project_id);
    setDirectoryTreeWidthState(width);
    setOldDirectoryTreeWidth(width);
  }, [project_id]);

  // -- Derived state --
  const projectIsRunning = deriveProjectIsRunning(
    group,
    project_map,
    project_id,
  );

  // -- Callbacks --
  const createFile = useCallback(
    (ext?: string, switch_over?: boolean) => {
      if (switch_over == undefined) {
        switch_over = true;
      }
      if (
        ext == undefined &&
        file_search.lastIndexOf(".") <= file_search.lastIndexOf("/")
      ) {
        let disabled_ext: any;
        if (configuration != undefined) {
          ({ disabled_ext } = (configuration as any).get("main", {
            disabled_ext: [],
          }));
        } else {
          disabled_ext = [];
        }
        ext = default_ext(disabled_ext);
      }
      actions?.create_file({
        name: file_search,
        ext,
        current_path,
        switch_over,
      });
      actions?.setState({ file_search: "" });
    },
    [file_search, current_path, configuration, actions],
  );

  const createFolder = useCallback(
    (switch_over = true) => {
      actions?.create_folder({
        name: file_search,
        current_path,
        switch_over,
      });
      actions?.setState({ file_search: "" });
    },
    [file_search, current_path, actions],
  );

  const toggleDirectoryTree = useCallback(() => {
    const next = !show_directory_tree;
    actions?.setState({ show_directory_tree: next });
    setDirectoryTreeVisible(project_id, next);
  }, [actions, project_id, show_directory_tree]);

  const updateDirectoryTreeWidth = useCallback(
    (width: number) => {
      const nextWidth = Math.max(
        DIRECTORY_TREE_MIN_WIDTH_PX,
        Math.min(width, DIRECTORY_TREE_MAX_WIDTH_PX),
      );
      setDirectoryTreeWidthState(nextWidth);
      setDirectoryTreeWidth(project_id, nextWidth);
    },
    [project_id],
  );

  const resetDirectoryTreeWidth = useCallback(() => {
    updateDirectoryTreeWidth(DIRECTORY_TREE_DEFAULT_WIDTH_PX);
  }, [updateDirectoryTreeWidth]);

  const handleDirectoryTreeDragEnd = useCallback(
    (event: DragEndEvent) => {
      const deltaX = event.delta?.x ?? 0;
      updateDirectoryTreeWidth(oldDirectoryTreeWidth + deltaX);
    },
    [oldDirectoryTreeWidth, updateDirectoryTreeWidth],
  );

  // -- Early return if not initialized --
  if (checked_files == undefined) {
    return <Loading />;
  }

  const { listing, file_map, type_counts } = displayed_listing ?? {};
  const directory_error = displayed_listing?.error;

  // -- Render helpers --
  function renderError() {
    if (!error) return null;
    return (
      <ErrorDisplay
        error={error}
        style={error_style}
        onClose={() => actions?.setState({ error: "" })}
      />
    );
  }

  function renderActivity() {
    return (
      <ActivityDisplay
        trunc={80}
        activity={_.values(activity?.toJS?.() ?? activity)}
        on_clear={() => actions?.clear_all_activity()}
        style={{ top: "100px" }}
      />
    );
  }

  function renderLibrary() {
    return (
      <div style={{ maxWidth: "800px", margin: "0 auto" }}>
        <SettingBox
          icon={"book"}
          title={
            <span>
              Library{" "}
              <A href="https://doc.cocalc.com/project-library.html">
                (help...)
              </A>
            </span>
          }
          close={() => actions?.toggle_library(false)}
        >
          <Library
            project_id={project_id}
            onClose={() => actions?.toggle_library(false)}
          />
        </SettingBox>
      </div>
    );
  }

  function renderFilesActions() {
    if (listing == undefined) return null;
    const visibleListing = hide_masked_files
      ? listing.filter((f) => !f.mask)
      : listing;
    return (
      <ActionBar
        project_id={project_id}
        checked_files={checked_files}
        current_path={current_path}
        listing={visibleListing}
        project_map={project_map as any}
        images={images as any}
        actions={actions as ProjectActions}
        available_features={available_features as any}
        show_custom_software_reset={show_custom_software_reset}
        project_is_running={projectIsRunning}
        show_directory_tree={!!show_directory_tree}
        on_toggle_directory_tree={toggleDirectoryTree}
      />
    );
  }

  function renderNewFile() {
    return (
      <div ref={newFileRef}>
        <NewButton
          file_search={file_search}
          current_path={current_path}
          actions={actions as ProjectActions}
          create_file={createFile}
          create_folder={createFolder}
          configuration={configuration}
          disabled={!!ext_selection}
        />
      </div>
    );
  }

  function renderFileListing() {
    if (directory_error) {
      const quotas = redux
        .getStore("projects")
        ?.get_total_project_quotas(project_id);
      return (
        <div>
          <FetchDirectoryErrors
            error={directory_error}
            path={current_path}
            quotas={quotas}
            is_logged_in={!!is_logged_in}
          />
          <br />
          <AntButton
            onClick={() =>
              actions?.fetch_directory_listing({
                force: true,
                path: current_path,
              })
            }
          >
            <Icon name="refresh" /> Try again to get directory listing
          </AntButton>
        </div>
      );
    } else if (listing != undefined) {
      return (
        <FileUploadWrapper
          project_id={project_id}
          dest_path={current_path}
          event_handlers={{
            complete: () => actions?.fetch_directory_listing(),
          }}
          config={{ clickable: ".upload-button" }}
          style={{ minHeight: 0 }}
          className="smc-vfill"
        >
          <FileListing
            isRunning={projectIsRunning}
            name={name}
            active_file_sort={active_file_sort}
            listing={listing}
            file_map={file_map}
            file_search={file_search}
            checked_files={checked_files}
            current_path={current_path}
            actions={actions as ProjectActions}
            create_file={createFile}
            create_folder={createFolder}
            selected_file_index={selected_file_index}
            project_id={project_id}
            shift_is_down={shiftIsDown}
            sort_by={(actions as ProjectActions)?.set_sorted_file_column}
            other_settings={other_settings as any}
            redux={redux}
            configuration_main={configuration?.get("main") as any}
            type_counts={type_counts}
            search_focused={searchFocused}
            hide_masked_files={hide_masked_files ?? false}
          />
        </FileUploadWrapper>
      );
    } else {
      if (projectIsRunning) {
        redux.getProjectStore(project_id)?.get_listings();
        return (
          <div style={{ textAlign: "center" }}>
            <Loading theme={"medium"} />
          </div>
        );
      } else {
        return (
          <Alert
            type="warning"
            icon={<Icon name="ban" />}
            style={{ textAlign: "center" }}
            showIcon
            description={
              <Paragraph>
                <FormattedMessage
                  id="project.explorer.start_project.warning"
                  defaultMessage={`In order to see the files in this directory, you have to <a>start this project</a>.`}
                  values={{
                    a: (c) => (
                      <a
                        onClick={() => {
                          redux
                            .getActions("projects")
                            .start_project(project_id);
                        }}
                      >
                        {c}
                      </a>
                    ),
                  }}
                />
              </Paragraph>
            }
          />
        );
      }
    }
  }

  function renderControlRow() {
    return (
      <div
        style={{
          display: "flex",
          flexFlow: IS_MOBILE ? undefined : "row wrap",
          justifyContent: "space-between",
          alignItems: "stretch",
          marginBottom: "15px",
        }}
      >
        <div
          style={{
            flex: "3 1 auto",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ display: "flex", flex: "1 1 auto" }}>
            <SelectComputeServerForFileExplorer
              project_id={project_id}
              key="compute-server"
              style={{ marginRight: "5px", borderRadius: "5px" }}
            />
            <div
              ref={currentDirectoryRef}
              className="cc-project-files-path-nav"
            >
              <PathNavigator project_id={project_id} />
            </div>
          </div>
          {!!compute_server_id && (
            <div style={{ fontSize: "10pt", marginBottom: "5px" }}>
              <ComputeServerDocStatus
                standalone
                id={compute_server_id}
                requestedId={compute_server_id}
                project_id={project_id}
              />
            </div>
          )}
        </div>
        {!IS_MOBILE && (
          <div
            style={{ flex: "0 1 auto", margin: "0 10px" }}
            className="cc-project-files-create-dropdown"
          >
            {renderNewFile()}
          </div>
        )}
        {!IS_MOBILE && (
          <SearchTerminalBar
            ref={searchAndTerminalBar}
            actions={actions as ProjectActions}
            current_path={current_path}
            file_search={file_search}
            listing={listing}
            selected_file_index={selected_file_index}
            file_creation_error={file_creation_error}
            create_file={createFile}
            create_folder={createFolder}
            on_focus={() => setSearchFocused(true)}
            on_blur={() => setSearchFocused(false)}
          />
        )}
        <div style={{ flex: "0 1 auto" }}>
          <UsersViewing project_id={project_id} />
        </div>
      </div>
    );
  }

  function renderProjectFilesButtons() {
    return (
      <div
        ref={miscButtonsRef}
        style={{ flex: "1 0 auto", textAlign: "right" }}
      >
        <MiscSideButtons
          project_id={project_id}
          current_path={current_path}
          show_hidden={show_hidden ?? false}
          hide_masked_files={hide_masked_files ?? false}
          actions={actions as ProjectActions}
          kucalc={kucalc}
          available_features={available_features as any}
        />
      </div>
    );
  }

  function renderCustomSoftwareReset() {
    if (!show_custom_software_reset) return null;
    if (checked_files.size > 0) return null;
    return (
      <CustomSoftwareReset
        project_id={project_id}
        images={images as any}
        project_map={project_map as any}
        actions={actions as ProjectActions}
        available_features={available_features as any}
        site_name={site_name}
      />
    );
  }

  // -- Main render --
  const showTree = !!show_directory_tree && !IS_MOBILE && projectIsRunning;

  return (
    <div className={"smc-vfill"}>
      <div
        style={{
          flex: "0 0 auto",
          display: "flex",
          flexDirection: "column",
          padding: "2px 2px 0 2px",
        }}
      >
        {renderError()}
        {renderActivity()}
        {renderControlRow()}
        {ext_selection != null && <AskNewFilename project_id={project_id} />}
      </div>

      <div
        ref={fileListingRef}
        className="smc-vfill"
        style={{ minHeight: 0, display: "flex", flexDirection: "row", gap: 0 }}
      >
        {/* Left column: toggle button + directory tree */}
        {showTree && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: `0 0 ${directoryTreeWidth}px`,
              width: `${directoryTreeWidth}px`,
              minWidth: `${DIRECTORY_TREE_MIN_WIDTH_PX}px`,
            }}
          >
            <div style={{ flex: "0 0 auto", padding: "4px 2px" }}>
              <BootstrapButton
                onClick={toggleDirectoryTree}
                active
                title="Hide directory tree"
              >
                <Icon name="network" style={{ transform: "rotate(270deg)" }} />
              </BootstrapButton>
            </div>
            <DirectoryTreePanel
              project_id={project_id}
              current_path={current_path}
              compute_server_id={compute_server_id}
              show_hidden={!!show_hidden}
              on_open_directory={(path: string) =>
                (actions as ProjectActions)?.open_directory(path, true, false)
              }
            />
          </div>
        )}
        {/* Dragbar (full height when tree visible) */}
        {showTree && (
          <DndContext
            onDragStart={() => setOldDirectoryTreeWidth(directoryTreeWidth)}
            onDragEnd={handleDirectoryTreeDragEnd}
          >
            <DirectoryTreeDragbar
              oldWidth={oldDirectoryTreeWidth}
              onReset={resetDirectoryTreeWidth}
            />
          </DndContext>
        )}
        {/* Right column: action bar + file table */}
        <div
          className="smc-vfill"
          style={{ minHeight: 0, minWidth: 0, flex: 1 }}
        >
          <div
            style={{
              flex: "0 0 auto",
              padding: "0 2px",
            }}
          >
            <div style={FLEX_ROW_STYLE}>
              <div
                style={{
                  flex: "1 0 auto",
                  marginRight: "5px",
                  minWidth: "20em",
                }}
              >
                {renderFilesActions()}
              </div>
              {renderProjectFilesButtons()}
            </div>
            {listing != null && (
              <ActionBarInfo
                project_id={project_id}
                checked_files={checked_files}
                listing={
                  hide_masked_files ? listing.filter((f) => !f.mask) : listing
                }
                project_is_running={projectIsRunning}
              />
            )}
            {projectIsRunning ? renderCustomSoftwareReset() : null}
            {show_library ? renderLibrary() : null}
          </div>
          {renderFileListing()}
        </div>
      </div>
      <ExplorerTour
        open={explorerTour}
        project_id={project_id}
        newFileRef={newFileRef}
        searchAndTerminalBar={searchAndTerminalBar}
        fileListingRef={fileListingRef}
        currentDirectoryRef={currentDirectoryRef}
        miscButtonsRef={miscButtonsRef}
      />
    </div>
  );
}

function pathToTreeKey(path: string): string {
  return path === "" ? TREE_HOME_KEY : path;
}

function treeKeyToPath(key: React.Key): string {
  const value = String(key);
  return value === TREE_HOME_KEY ? "" : value;
}

function getAncestorPaths(path: string): string[] {
  if (path === "") return [""];
  const parts = path.split("/");
  const ancestors: string[] = [""];
  let current = "";
  for (const part of parts) {
    current = current === "" ? part : `${current}/${part}`;
    ancestors.push(current);
  }
  return ancestors;
}

const DirectoryTreeNodeTitle = React.memo(function DirectoryTreeNodeTitle({
  project_id,
  path,
  label,
  isSelected,
  isStarred,
  onToggleStar,
}: {
  project_id: string;
  path: string;
  label: string;
  isSelected: boolean;
  isStarred: boolean;
  onToggleStar: () => void;
}) {
  const id = `explorer-dir-tree-${project_id}-${path || TREE_HOME_KEY}`;
  const { dropRef, isOver, isInvalidDrop } = useFolderDrop(id, path);

  return (
    <span
      ref={dropRef}
      data-folder-drop-path={path}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        borderRadius: "4px",
        padding: "2px 4px",
        whiteSpace: "nowrap",
        background: isOver
          ? COLORS.BLUE_LL
          : isInvalidDrop
            ? COLORS.ANTD_RED_WARN
            : isSelected
              ? COLORS.BLUE_LLL
              : "transparent",
      }}
    >
      {path === "" ? (
        <Icon name="home" style={{ color: COLORS.FILE_ICON }} />
      ) : (
        <Icon
          name={isStarred ? "star-filled" : "star"}
          onClick={(e) => {
            e?.preventDefault();
            e?.stopPropagation();
            onToggleStar();
          }}
          style={{
            cursor: "pointer",
            color: isStarred ? COLORS.STAR : COLORS.GRAY_L,
            flexShrink: 0,
          }}
        />
      )}
      <span
        title={label}
        style={{
          minWidth: 0,
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
    </span>
  );
});

DirectoryTreeNodeTitle.displayName = "DirectoryTreeNodeTitle";

function DirectoryTreeDragbar({
  oldWidth,
  onReset,
}: {
  oldWidth: number;
  onReset: () => void;
}) {
  const { project_id } = useProjectContext();
  const { attributes, listeners, setNodeRef, transform, active } = useDraggable(
    {
      id: `directory-tree-drag-${project_id}`,
    },
  );

  const dx = useMemo(() => {
    if (!transform || !oldWidth) return 0;
    const posX = oldWidth + transform.x;
    if (posX < DIRECTORY_TREE_MIN_WIDTH_PX) {
      return -(oldWidth - DIRECTORY_TREE_MIN_WIDTH_PX);
    }
    if (posX > DIRECTORY_TREE_MAX_WIDTH_PX) {
      return DIRECTORY_TREE_MAX_WIDTH_PX - oldWidth;
    }
    return transform.x;
  }, [transform, oldWidth]);

  return (
    <div
      ref={setNodeRef}
      className="cc-project-flyout-dragbar"
      style={{
        transform: transform ? `translate3d(${dx}px, 0, 0)` : undefined,
        flex: "0 0 5px",
        width: "5px",
        height: "100%",
        cursor: "col-resize",
        ...(active ? { zIndex: 1000, backgroundColor: COLORS.GRAY } : {}),
      }}
      {...listeners}
      {...attributes}
      onDoubleClick={onReset}
    />
  );
}

function DirectoryTreePanel({
  project_id,
  current_path,
  compute_server_id,
  show_hidden,
  on_open_directory,
}: {
  project_id: string;
  current_path: string;
  compute_server_id?: number;
  show_hidden: boolean;
  on_open_directory: (path: string) => void;
}) {
  const [childrenByPath, setChildrenByPath] = useState<
    Record<string, string[]>
  >({});
  const [treeVersion, setTreeVersion] = useState(0);
  const [expandedKeys, setExpandedKeys] = useState<string[]>(() =>
    getDirectoryTreeExpandedKeys(project_id),
  );
  const [error, setError] = useState<string>("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { starred, setStarredPath } = useStarredFilesManager(project_id);
  const showHiddenRef = useRef(show_hidden);
  const loadedPathsRef = useRef<Set<string>>(new Set());
  const loadingPathsRef = useRef<Set<string>>(new Set());
  // Incremented on context reset (project/compute-server change) so that
  // in-flight async responses from a previous context are discarded.
  const generationRef = useRef(0);

  const loadPath = useCallback(
    async (path: string, force = false) => {
      if (!force && loadedPathsRef.current.has(path)) return;
      if (loadingPathsRef.current.has(path)) return;
      loadingPathsRef.current.add(path);
      const gen = generationRef.current;
      try {
        const listing = await webapp_client.project_client.directory_listing({
          project_id,
          path,
          hidden: true,
          compute_server_id: compute_server_id ?? 0,
        });
        if (gen !== generationRef.current) return; // stale response
        const dirs = (listing?.files ?? [])
          .filter(
            (entry) =>
              entry.isdir &&
              entry.name !== "." &&
              entry.name !== ".." &&
              (showHiddenRef.current || !entry.name.startsWith(".")),
          )
          .map((entry) => misc.path_to_file(path, entry.name))
          .sort((a, b) => misc.cmp(a, b));
        setChildrenByPath((prev) => ({ ...prev, [path]: dirs }));
        if (!loadedPathsRef.current.has(path)) {
          setTreeVersion((v) => v + 1);
        }
        loadedPathsRef.current.add(path);
        setError("");
      } catch (err) {
        if (gen !== generationRef.current) return; // stale error
        console.warn("Failed to load directory tree path:", path, err);
        setError(`${err}`);
      } finally {
        if (gen === generationRef.current) {
          loadingPathsRef.current.delete(path);
        }
      }
    },
    [compute_server_id, project_id],
  );

  useEffect(() => {
    showHiddenRef.current = show_hidden;
  }, [show_hidden]);

  useEffect(() => {
    generationRef.current += 1;
    setChildrenByPath({});
    const savedKeys = getDirectoryTreeExpandedKeys(project_id);
    setExpandedKeys(savedKeys);
    setError("");
    loadedPathsRef.current = new Set();
    loadingPathsRef.current.clear();
    setTreeVersion((v) => v + 1);
    void loadPath("", true);
    // Pre-load all previously expanded paths so the tree restores its shape
    for (const key of savedKeys) {
      const path = treeKeyToPath(key);
      if (path !== "") void loadPath(path);
    }
  }, [project_id, compute_server_id, loadPath]);

  useEffect(() => {
    if (loadedPathsRef.current.size === 0) return;
    for (const path of loadedPathsRef.current) {
      void loadPath(path, true);
    }
  }, [show_hidden, loadPath]);

  // Watch expanded directories for changes, so the tree stays live.
  useEffect(() => {
    const listings = redux
      .getProjectStore(project_id)
      ?.get_listings(compute_server_id ?? 0);
    if (!listings) return;
    for (const key of expandedKeys) {
      listings.watch(treeKeyToPath(key));
    }
  }, [project_id, compute_server_id, expandedKeys]);

  // Listen for change events and reload any affected loaded tree paths.
  // This covers moves/copies into expanded subdirectories as well as any
  // external filesystem change detected by the conat listing service.
  useEffect(() => {
    const listings = redux
      .getProjectStore(project_id)
      ?.get_listings(compute_server_id ?? 0);
    if (!listings) return;
    const handleChange = (paths: string[]) => {
      for (const path of paths) {
        if (loadedPathsRef.current.has(path)) {
          void loadPath(path, true);
        }
      }
    };
    listings.on("change", handleChange);
    return () => {
      listings.removeListener("change", handleChange);
    };
  }, [project_id, compute_server_id, loadPath]);

  useEffect(() => {
    const ancestorPaths = getAncestorPaths(current_path);
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      for (const path of ancestorPaths) {
        next.add(pathToTreeKey(path));
      }
      return Array.from(next);
    });
    for (const path of ancestorPaths) {
      if (!loadedPathsRef.current.has(path)) {
        void loadPath(path);
      }
    }
  }, [current_path, loadPath]);

  // Persist expanded keys whenever they change (capped at MAX_TREE_EXPANDED)
  useEffect(() => {
    saveDirectoryTreeExpandedKeys(project_id, expandedKeys);
  }, [project_id, expandedKeys]);

  // Scroll selected node into view when current_path changes
  useEffect(() => {
    const timer = setTimeout(() => {
      const selected = scrollContainerRef.current?.querySelector(
        ".ant-tree-node-selected",
      );
      selected?.scrollIntoView({
        block: "nearest",
        inline: "start",
        behavior: "smooth",
      });
    }, 150);
    return () => clearTimeout(timer);
  }, [current_path]);

  // Restore scroll position after initial data loads on mount / project change
  useEffect(() => {
    const savedScrollTop = getDirectoryTreeScrollTop(project_id);
    if (savedScrollTop <= 0) return;
    const timer = setTimeout(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = savedScrollTop;
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [project_id, compute_server_id]);

  const handleTreeScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      // Prevent horizontal drift — overflow-x:hidden clips visually but
      // scrollLeft can still be set programmatically (scrollIntoView,
      // antd Tree, dnd-kit). Force it back to 0.
      if (el.scrollLeft !== 0) {
        el.scrollLeft = 0;
      }
      saveDirectoryTreeScrollTop(project_id, el.scrollTop);
    },
    [project_id],
  );

  const onExpand: TreeProps["onExpand"] = useCallback(
    (keys) => {
      const normalizedKeys = keys.map((key) => String(key));
      setExpandedKeys(normalizedKeys);
      for (const key of normalizedKeys) {
        const path = treeKeyToPath(key);
        if (!loadedPathsRef.current.has(path)) {
          void loadPath(path);
        }
      }
    },
    [loadPath],
  );

  const onSelect: TreeProps["onSelect"] = useCallback(
    (selectedKeys, info) => {
      const key = selectedKeys[0] ?? info.node.key;
      if (key == null) return;
      on_open_directory(treeKeyToPath(key));
    },
    [on_open_directory],
  );

  // Note: loadedPathsRef is intentionally not a dependency. `treeVersion`
  // is incremented whenever loadedPathsRef gains new paths, which triggers
  // this memo to rebuild with the latest ref contents.
  const treeData: TreeDataNode[] = useMemo(() => {
    const loadedPaths = loadedPathsRef.current;
    const buildChildren = (parentPath: string): TreeDataNode[] => {
      const children = childrenByPath[parentPath] ?? [];
      return children.map((childPath) => {
        const childChildren = loadedPaths.has(childPath)
          ? buildChildren(childPath)
          : undefined;
        const starPath = `${childPath}/`;
        const isStarred = starred.includes(starPath);
        return {
          key: pathToTreeKey(childPath),
          title: (
            <DirectoryTreeNodeTitle
              project_id={project_id}
              path={childPath}
              label={misc.path_split(childPath).tail || childPath}
              isSelected={current_path === childPath}
              isStarred={isStarred}
              onToggleStar={() => setStarredPath(starPath, !isStarred)}
            />
          ),
          children: childChildren,
          isLeaf:
            loadedPaths.has(childPath) &&
            (childrenByPath[childPath]?.length ?? 0) === 0,
        };
      });
    };

    return [
      {
        key: TREE_HOME_KEY,
        title: (
          <DirectoryTreeNodeTitle
            project_id={project_id}
            path=""
            label="Home"
            isSelected={current_path === ""}
            isStarred={false}
            onToggleStar={() => {}}
          />
        ),
        children: buildChildren(""),
      },
    ];
  }, [
    childrenByPath,
    current_path,
    project_id,
    treeVersion,
    starred,
    setStarredPath,
  ]);

  // Starred directories: entries ending with "/" are directories
  const starredDirs = starred.filter((p) => p.endsWith("/"));

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: "1 1 0",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      {/* Starred directories quick-access panel */}
      {starredDirs.length > 0 && (
        <div
          style={{
            maxHeight: "25%",
            overflowY: "auto",
            overflowX: "hidden",
            flexShrink: 0,
            borderBottom: `1px solid ${COLORS.GRAY_LL}`,
          }}
        >
          <div
            style={{
              fontWeight: "bold",
              padding: `${FLYOUT_PADDING} ${FLYOUT_PADDING} 2px`,
              fontSize: "85%",
              color: COLORS.GRAY_D,
            }}
          >
            Starred
          </div>
          {starredDirs.map((starPath) => {
            const path = starPath.slice(0, -1); // strip trailing "/"
            const label = path || "Home";
            const isSelected = current_path === path;
            return (
              <div
                key={starPath}
                className="cc-project-flyout-file-item"
                onClick={() => on_open_directory(path)}
                style={{
                  width: "100%",
                  cursor: "pointer",
                  color: COLORS.GRAY_D,
                  overflow: "hidden",
                  backgroundColor: isSelected ? COLORS.BLUE_LLL : undefined,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "row",
                    flex: "1",
                    padding: FLYOUT_PADDING,
                    overflow: "hidden",
                    alignItems: "center",
                  }}
                >
                  <Icon
                    name="star-filled"
                    onClick={(e) => {
                      e?.preventDefault();
                      e?.stopPropagation();
                      setStarredPath(starPath, false);
                    }}
                    style={{
                      fontSize: "120%",
                      marginRight: FLYOUT_PADDING,
                      color: COLORS.STAR,
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    title={path || "Home"}
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: isSelected ? COLORS.ANTD_LINK_BLUE : undefined,
                    }}
                  >
                    {label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Main directory tree */}
      <div
        ref={scrollContainerRef}
        onScroll={handleTreeScroll}
        style={{
          ...TREE_PANEL_STYLE,
          flex: "1 1 0",
          minHeight: 0,
        }}
      >
        <Tree
          showLine={{ showLeafIcon: false }}
          virtual={false}
          treeData={treeData}
          expandedKeys={expandedKeys}
          selectedKeys={[pathToTreeKey(current_path)]}
          onExpand={onExpand}
          onSelect={onSelect}
        />
        {!!error && (
          <div
            style={{ color: COLORS.ANTD_RED, fontSize: "11px", padding: "4px" }}
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Determine if the project should be considered "running" for UI purposes.
 * Admins always see a running project (issue #3863).
 * Public viewers never see running features.
 */
function deriveProjectIsRunning(
  group: string | undefined,
  project_map: any,
  project_id: string,
): boolean {
  if (group === "admin") return true;
  if (group === "public" || group == null) return false;
  const project_state = project_map?.getIn([project_id, "state"]) as
    | ProjectStatus
    | undefined;
  return project_state?.get("state") === "running";
}

const SearchTerminalBar = React.forwardRef(
  (
    {
      current_path,
      file_search,
      actions,
      listing,
      selected_file_index,
      file_creation_error,
      create_file,
      create_folder,
      on_focus,
      on_blur,
    }: {
      current_path: string;
      file_search: string;
      actions: ProjectActions;
      listing: ListingItem[] | undefined;
      selected_file_index?: number;
      file_creation_error?: string;
      create_file: (ext?: string, switch_over?: boolean) => void;
      create_folder: (switch_over?: boolean) => void;
      on_focus?: () => void;
      on_blur?: () => void;
    },
    ref: React.LegacyRef<HTMLDivElement> | undefined,
  ) => {
    return (
      <div ref={ref} style={{ flex: "1 1 auto" }}>
        <SearchBar
          key={current_path}
          file_search={file_search}
          actions={actions}
          current_path={current_path}
          selected_file={
            listing != undefined ? listing[selected_file_index ?? 0] : undefined
          }
          selected_file_index={selected_file_index}
          file_creation_error={file_creation_error}
          num_files_displayed={
            listing != undefined ? listing.length : undefined
          }
          create_file={create_file}
          create_folder={create_folder}
          on_focus={on_focus}
          on_blur={on_blur}
        />
      </div>
    );
  },
);
