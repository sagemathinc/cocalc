/*
 *  This file is part of CoCalc: Copyright © 2020–2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Button as AntButton } from "antd";
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
import { ActionBar } from "./action-bar";
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

export function Explorer() {
  const { project_id, actions, group } = useProjectContext();
  const name = project_redux_name(project_id);

  // -- Project store fields --
  const active_file_sort = useTypedRedux({ project_id }, "active_file_sort");
  const current_path = useTypedRedux({ project_id }, "current_path") ?? "";
  const activity = useTypedRedux({ project_id }, "activity");
  const file_search = useTypedRedux({ project_id }, "file_search") ?? "";
  const show_hidden = useTypedRedux({ project_id }, "show_hidden");
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
    return (
      <ActionBar
        project_id={project_id}
        checked_files={checked_files}
        current_path={current_path}
        listing={listing}
        project_map={project_map as any}
        images={images as any}
        actions={actions as ProjectActions}
        available_features={available_features as any}
        show_custom_software_reset={show_custom_software_reset}
        project_is_running={projectIsRunning}
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
        style={{ flex: "1 0 auto", marginBottom: "15px", textAlign: "right" }}
      >
        <MiscSideButtons
          project_id={project_id}
          current_path={current_path}
          show_hidden={show_hidden ?? false}
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
        {projectIsRunning ? renderCustomSoftwareReset() : null}
        {show_library ? renderLibrary() : null}
      </div>

      <div ref={fileListingRef} className="smc-vfill" style={{ minHeight: 0 }}>
        {renderFileListing()}
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
    }: {
      current_path: string;
      file_search: string;
      actions: ProjectActions;
      listing: ListingItem[] | undefined;
      selected_file_index?: number;
      file_creation_error?: string;
      create_file: (ext?: string, switch_over?: boolean) => void;
      create_folder: (switch_over?: boolean) => void;
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
        />
      </div>
    );
  },
);
