/*
 *  This file is part of CoCalc: Copyright © 2020–2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Button as AntButton } from "antd";

import { Button as BootstrapButton } from "@cocalc/frontend/antd-bootstrap";
import * as _ from "lodash";
import React, { useCallback, useEffect, useRef, useState } from "react";
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
  HelpIcon,
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
import { MainConfiguration } from "@cocalc/frontend/project_configuration";
import { ProjectActions } from "@cocalc/frontend/project_store";
import { ProjectStatus } from "@cocalc/frontend/todo-types";

import AskNewFilename from "../ask-filename";
import { useProjectContext } from "../context";
import { ActionBar, ActionBarInfo } from "./action-bar";
import {
  DirectoryTreePanel,
  DirectoryTreeDragbar,
  getDirectoryTreeWidth,
  setDirectoryTreeWidth,
  DIRECTORY_TREE_DEFAULT_WIDTH_PX,
  DIRECTORY_TREE_MIN_WIDTH_PX,
  DIRECTORY_TREE_MAX_WIDTH_PX,
} from "./directory-tree";
import { FetchDirectoryErrors } from "./fetch-directory-errors";
import { FileListing } from "./file-listing";
import { default_ext } from "./file-listing/utils";
import { navigateBrowsingPath } from "./navigate-browsing-path";
import { useNavigationHistory } from "./use-navigation-history";
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

export function Explorer() {
  const { project_id, actions, group } = useProjectContext();
  const name = project_redux_name(project_id);

  // -- Project store fields --
  const active_file_sort = useTypedRedux({ project_id }, "active_file_sort");
  const reduxCurrentPath = useTypedRedux({ project_id }, "current_path") ?? "";
  const explorerBrowsingPath = useTypedRedux(
    { project_id },
    "explorer_browsing_path",
  );
  const explorerHistoryPath = useTypedRedux(
    { project_id },
    "explorer_history_path",
  );
  // The explorer's own browsing path — independent of the project-wide
  // current_path (which tracks the active file context / tab).
  const current_path = explorerBrowsingPath ?? reduxCurrentPath;
  const explorerHistory = explorerHistoryPath ?? current_path;
  const activity = useTypedRedux({ project_id }, "activity");
  const file_search = useTypedRedux({ project_id }, "file_search") ?? "";
  const show_directory_tree = useTypedRedux(
    { project_id },
    "show_directory_tree",
  );
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
  const type_filter = useTypedRedux({ project_id }, "type_filter");
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
    setDirectoryTreeWidthState(getDirectoryTreeWidth(project_id));
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

  // Navigate within the explorer — updates only the explorer's own browsing
  // path, leaving the project-wide current_path (active file context) alone.
  const navigateExplorerRaw = useCallback(
    (path: string) => {
      navigateBrowsingPath(
        project_id,
        path,
        explorerHistory,
        "explorer_browsing_path",
        "explorer_history_path",
      );
    },
    [project_id, explorerHistory],
  );

  const navHistory = useNavigationHistory(
    project_id,
    current_path,
    navigateExplorerRaw,
    "explorer",
  );

  // Wrap navigation so that every explicit navigation records history.
  const navigateExplorer = useCallback(
    (path: string) => {
      navigateExplorerRaw(path);
      navHistory.recordNavigation(path);
    },
    [navigateExplorerRaw, navHistory.recordNavigation],
  );

  const toggleDirectoryTree = useCallback(() => {
    actions?.setState({ show_directory_tree: !show_directory_tree });
  }, [actions, show_directory_tree]);

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

  // Ensure listings are initialized when the project is running but
  // displayed_listing hasn't loaded yet (side-effect moved out of render).
  useEffect(() => {
    if (projectIsRunning && displayed_listing == null) {
      redux.getProjectStore(project_id)?.get_listings();
    }
  }, [projectIsRunning, displayed_listing, project_id]);

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
            sort_by={
              (actions as ProjectActions)?.set_sorted_file_column ?? (() => {})
            }
            other_settings={other_settings as any}
            redux={redux}
            configuration_main={configuration?.get("main") as any}
            type_counts={type_counts}
            search_focused={searchFocused}
            hide_masked_files={hide_masked_files ?? false}
            onNavigateDirectory={navigateExplorer}
          />
        </FileUploadWrapper>
      );
    } else {
      if (projectIsRunning) {
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
              <PathNavigator
                project_id={project_id}
                currentPath={current_path}
                historyPath={explorerHistory}
                onNavigate={navigateExplorer}
                canGoBack={navHistory.canGoBack}
                canGoForward={navHistory.canGoForward}
                onGoBack={navHistory.goBack}
                onGoForward={navHistory.goForward}
                backHistory={navHistory.backHistory}
                forwardHistory={navHistory.forwardHistory}
              />
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
            disabled_ext={(configuration?.get("main") as any)?.disabled_ext}
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
            <div
              style={{
                flex: "0 0 auto",
                padding: "4px 2px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <BootstrapButton
                onClick={toggleDirectoryTree}
                active
                title="Hide directory tree"
              >
                <Icon name="network" style={{ transform: "rotate(270deg)" }} />
              </BootstrapButton>
              <span>
                Directory Tree{" "}
                <HelpIcon title="Directory Tree" maxWidth="300px">
                  <ul style={{ paddingLeft: "18px", margin: 0 }}>
                    <li>Quickly navigate to any directory.</li>
                    <li>
                      Star directories for quick access — they appear at the
                      top.
                    </li>
                    <li>Drag the border to resize the panel width.</li>
                    <li>Drag and drop files onto directories to move them.</li>
                    <li>
                      Hold <b>Shift</b> while dropping to copy instead of move.
                    </li>
                  </ul>
                </HelpIcon>
              </span>
            </div>
            <DirectoryTreePanel
              project_id={project_id}
              current_path={current_path}
              compute_server_id={compute_server_id}
              show_hidden={!!show_hidden}
              on_open_directory={navigateExplorer}
            />
          </div>
        )}
        {/* Dragbar (full height when tree visible) */}
        {showTree && (
          <DirectoryTreeDragbar
            currentWidth={directoryTreeWidth}
            onWidthChange={updateDirectoryTreeWidth}
            onReset={resetDirectoryTreeWidth}
          />
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
            {listing != null && actions != null && (
              <ActionBarInfo
                project_id={project_id}
                checked_files={checked_files}
                listing={
                  hide_masked_files ? listing.filter((f) => !f.mask) : listing
                }
                project_is_running={projectIsRunning}
                actions={actions}
                type_filter={type_filter ?? undefined}
                file_search={file_search || undefined}
                hide_masked_files={hide_masked_files ?? false}
                current_path={reduxCurrentPath}
                explorer_browsing_path={current_path}
                onSwitchToCurrentPath={() => navigateExplorer(reduxCurrentPath)}
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
      disabled_ext,
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
      disabled_ext?: string[];
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
          disabled_ext={disabled_ext}
          on_focus={on_focus}
          on_blur={on_blur}
        />
      </div>
    );
  },
);
