/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import * as _ from "lodash";
import { UsersViewing } from "@cocalc/frontend/account/avatar/users-viewing";
import { Button, Space } from "antd";
import { Col, Row } from "@cocalc/frontend/antd-bootstrap";
import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  A,
  ActivityDisplay,
  ErrorDisplay,
  Loading,
  SettingBox,
} from "@cocalc/frontend/components";
import { ComputeServerDocStatus } from "@cocalc/frontend/compute/doc-status";
import SelectComputeServerForFileExplorer from "@cocalc/frontend/compute/select-server-for-explorer";
import { CustomSoftwareReset } from "@cocalc/frontend/custom-software/reset-bar";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import { FileUploadWrapper } from "@cocalc/frontend/file-upload";
import { Library } from "@cocalc/frontend/library";
import { ProjectStatus } from "@cocalc/frontend/todo-types";
import AskNewFilename from "../ask-filename";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { ActionBar } from "./action-bar";
import { ActionBox } from "./action-box";
import { FileListing } from "./file-listing";
import { default_ext } from "./file-listing/utils";
import { MiscSideButtons } from "./misc-side-buttons";
import { NewButton } from "./new-button";
import { PathNavigator } from "./path-navigator";
import { SearchBar } from "./search-bar";
import ExplorerTour from "./tour/tour";
import { dirname, join } from "path";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import useFs from "@cocalc/frontend/project/listing/use-fs";
import useListing, {
  type SortField,
} from "@cocalc/frontend/project/listing/use-listing";
import filterListing from "@cocalc/frontend/project/listing/filter-listing";
import ShowError from "@cocalc/frontend/components/error";
import { MainConfiguration } from "@cocalc/frontend/project_configuration";
import {
  getPublicFiles,
  useStrippedPublicPaths,
} from "@cocalc/frontend/project_store";
import { Icon } from "@cocalc/frontend/components";
import useCounter from "@cocalc/frontend/app-framework/counter-hook";
import { getSort, setSort } from "./config";
import DiskUsage from "@cocalc/frontend/project/disk-usage/disk-usage";

const FLEX_ROW_STYLE = {
  display: "flex",
  flexFlow: "row wrap",
  justifyContent: "space-between",
  alignItems: "stretch",
} as const;

const ERROR_STYLE: CSSProperties = {
  marginRight: "1ex",
  whiteSpace: "pre-line",
  position: "absolute",
  zIndex: 15,
  right: "5px",
  boxShadow: "5px 5px 5px grey",
} as const;

function sortDesc(active_file_sort?): {
  sortField: SortField;
  sortDirection: "desc" | "asc";
} {
  const { column_name, is_descending } = active_file_sort ?? {
    column_name: "name",
    is_descending: false,
  };
  if (column_name == "time") {
    return {
      sortField: "mtime",
      sortDirection: is_descending ? "asc" : "desc",
    };
  }
  return {
    sortField: column_name,
    sortDirection: is_descending ? "desc" : "asc",
  };
}

export function Explorer() {
  const { actions, project_id, compute_server_id } = useProjectContext();

  const newFileRef = useRef<any>(null);
  const searchAndTerminalBar = useRef<any>(null);
  const fileListingRef = useRef<any>(null);
  const currentDirectoryRef = useRef<any>(null);
  const miscButtonsRef = useRef<any>(null);

  const activity = useTypedRedux({ project_id }, "activity")?.toJS();
  const available_features = useTypedRedux(
    { project_id },
    "available_features",
  )?.toJS();
  const checked_files = useTypedRedux({ project_id }, "checked_files");
  const configuration = useTypedRedux({ project_id }, "configuration");
  const current_path = useTypedRedux({ project_id }, "current_path");
  const error = useTypedRedux({ project_id }, "error");
  const ext_selection = useTypedRedux({ project_id }, "ext_selection");
  const file_action = useTypedRedux({ project_id }, "file_action");
  const file_creation_error = useTypedRedux(
    { project_id },
    "file_creation_error",
  );
  const file_search = useTypedRedux({ project_id }, "file_search") ?? "";
  const show_custom_software_reset = useTypedRedux(
    { project_id },
    "show_custom_software_reset",
  );
  const show_library = useTypedRedux({ project_id }, "show_library");
  const disableExplorerKeyhandler = useTypedRedux(
    { project_id },
    "disableExplorerKeyhandler",
  );

  const [shiftIsDown, setShiftIsDown] = useState<boolean>(false);

  const project_map = useTypedRedux("projects", "project_map");

  const images = useTypedRedux("compute_images", "images");
  const mask = useTypedRedux("account", "other_settings")?.get("mask_files");

  const sort = useTypedRedux({ project_id }, "active_file_sort");
  const active_file_sort = useMemo(
    () =>
      getSort({
        project_id,
        path: current_path,
        compute_server_id,
      }),
    [sort, current_path, compute_server_id, project_id],
  );

  const fs = useFs({ project_id, compute_server_id });
  let {
    refresh,
    listing,
    error: listingError,
  } = useListing({
    fs,
    path: current_path,
    ...sortDesc(active_file_sort),
    cacheId: actions?.getCacheId(compute_server_id),
    mask,
  });
  const showHidden = useTypedRedux({ project_id }, "show_hidden");
  const flyout = useTypedRedux({ project_id }, "flyout");

  listing = listingError
    ? null
    : filterListing({
        listing,
        search: file_search,
        showHidden,
      });

  useEffect(() => {
    actions?.setState({ numDisplayedFiles: listing?.length ?? 0 });
  }, [listing?.length]);

  // ensure that listing entries have isPublic set:
  const strippedPublicPaths = useStrippedPublicPaths(project_id);
  const publicFiles: Set<string> = useMemo(() => {
    if (listing == null) {
      return new Set<string>();
    }
    return getPublicFiles(listing, strippedPublicPaths, current_path);
  }, [listing, current_path, strippedPublicPaths]);

  const { val: clicked, inc: clickedOnExplorer } = useCounter();
  useEffect(() => {
    if (listing == null || file_action || disableExplorerKeyhandler) {
      return;
    }
    const handleKeyDown = (e): void => {
      if (actions == null) {
        return;
      }
      if (e.key === "Shift") {
        setShiftIsDown(true);
        return;
      }
      if (flyout && $(":focus").length > 0) {
        return;
      }
      if (e.key == "ArrowUp") {
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          const path = dirname(current_path);
          actions.open_directory(path == "." ? "" : path);
        } else {
          actions.decrement_selected_file_index();
        }
      } else if (e.key == "ArrowDown") {
        actions.increment_selected_file_index();
      } else if (e.key == "Enter") {
        if (checked_files.size > 0 && file_action != undefined) {
          // using the action box.
          return;
        }
        if (file_search.startsWith("/")) {
          // running a terminal command
          return;
        }
        const n =
          redux.getProjectStore(project_id).get("selected_file_index") ?? 0;
        const x = listing?.[n];
        if (x != null) {
          const { isDir, name } = x;
          const path = join(current_path, name);
          if (isDir) {
            actions.open_directory(path);
          } else {
            actions.open_file({ path, foreground: !e.ctrlKey });
          }
          if (!e.ctrlKey) {
            setTimeout(() => actions.set_file_search(""), 10);
            actions.clear_selected_file_index();
          }
        }
      }
    };

    const handleKeyUp = (e): void => {
      if (e.key === "Shift") {
        setShiftIsDown(false);
      }
    };

    $(window).on("keydown", handleKeyDown);
    $(window).on("keyup", handleKeyUp);
    return () => {
      $(window).off("keydown", handleKeyDown);
      $(window).off("keyup", handleKeyUp);
    };
  }, [
    project_id,
    current_path,
    listing,
    file_action,
    flyout,
    clicked,
    disableExplorerKeyhandler,
  ]);

  if (actions == null) {
    return <Loading />;
  }

  const create_file = (ext, switch_over) => {
    if (switch_over == undefined) {
      switch_over = true;
    }
    if (
      ext == undefined &&
      file_search != null &&
      file_search.lastIndexOf(".") <= file_search.lastIndexOf("/")
    ) {
      const disabled_ext = // @ts-ignore
        configuration?.getIn(["main", "disabled_ext"])?.toJS?.() ?? [];
      ext = default_ext(disabled_ext);
    }

    actions.createFile({
      name: file_search ?? "",
      ext,
      current_path: current_path,
      switch_over,
    });
    actions.setState({ file_search: "" });
  };

  const create_folder = (switch_over = true): void => {
    actions.createFolder({
      name: file_search ?? "",
      current_path: current_path,
      switch_over,
    });
    actions.setState({ file_search: "" });
  };

  let project_is_running: boolean, project_state: ProjectStatus | undefined;

  if (checked_files == undefined) {
    // hasn't loaded/initialized at all
    return <Loading />;
  }

  const my_group = redux.getStore("projects").get_my_group(project_id);

  // regardless of consequences, for admins a project is always running
  // see https://github.com/sagemathinc/cocalc/issues/3863
  if (my_group === "admin") {
    project_state = new ProjectStatus({ state: "running" });
    project_is_running = true;
    // next, we check if this is a common user (not public)
  } else if (my_group !== "public") {
    project_state = project_map?.getIn([project_id, "state"]) as any;
    project_is_running = project_state?.get("state") == "running";
  } else {
    project_is_running = false;
  }

  if (listingError?.code == 403 || listingError?.code == 408) {
    // 403 = permission denied, 408 = connection being closed (due to permission?)
    return (
      <div style={{ margin: "30px auto", textAlign: "center" }}>
        <ShowError
          message={
            "Permission Issues: You are probably using the wrong account to access this project."
          }
          error={listingError}
          style={{ textAlign: "left" }}
        />
        <br />
        <Space.Compact>
          <Button
            size="large"
            type="primary"
            style={{ margin: "auto" }}
            onClick={() => {
              redux.getActions("page").close_project_tab(project_id);
            }}
          >
            <Icon name="times-circle" /> Close Project
          </Button>
        </Space.Compact>
      </div>
    );
  }

  // be careful with adding height:'100%'. it could cause flex to miscalculate. see #3904
  return (
    <div
      className={"smc-vfill"}
      onClick={() => {
        clickedOnExplorer();
      }}
    >
      <div
        style={{
          flex: "0 0 auto",
          display: "flex",
          flexDirection: "column",
          padding: "2px 2px 0 2px",
        }}
      >
        {error && (
          <ErrorDisplay
            error={error}
            style={ERROR_STYLE}
            onClose={() => actions.setState({ error: "" })}
          />
        )}
        <ActivityDisplay
          trunc={80}
          activity={_.values(activity)}
          on_clear={() => actions.clear_all_activity()}
          style={{ top: "100px" }}
        />
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
              <div
                style={{
                  fontSize: "10pt",
                  marginBottom: "5px",
                }}
              >
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
              style={{
                flex: "0 1 auto",
                margin: "0 10px",
              }}
              className="cc-project-files-create-dropdown"
            >
              <div ref={newFileRef}>
                <NewButton
                  file_search={file_search ?? ""}
                  current_path={current_path}
                  actions={actions}
                  create_file={create_file}
                  create_folder={create_folder}
                  configuration={configuration}
                  disabled={!!ext_selection}
                />
              </div>
            </div>
          )}
          {!IS_MOBILE && (
            <div style={{ flex: "1 1 auto" }} ref={searchAndTerminalBar}>
              <SearchBar
                actions={actions}
                current_path={current_path}
                file_search={file_search ?? ""}
                file_creation_error={file_creation_error}
                create_file={create_file}
                create_folder={create_folder}
              />
            </div>
          )}
          <div
            style={{
              flex: "0 1 auto",
            }}
          >
            <UsersViewing project_id={project_id} />
          </div>
        </div>

        {ext_selection != null && <AskNewFilename project_id={project_id} />}
        <div style={FLEX_ROW_STYLE}>
          <div
            style={{
              display: "flex",
              flex: "1 0 auto",
              marginRight: "5px",
              minWidth: "20em",
            }}
          >
            <DiskUsage
              style={{ marginRight: "5px" }}
              project_id={project_id}
              compute_server_id={compute_server_id}
            />
            {listing != null && (
              <ActionBar
                listing={listing}
                project_id={project_id}
                checked_files={checked_files}
                current_path={current_path}
                project_map={project_map}
                images={images}
                actions={actions}
                available_features={available_features}
                show_custom_software_reset={show_custom_software_reset}
                project_is_running={project_is_running}
              />
            )}
          </div>
          <div
            ref={miscButtonsRef}
            style={{
              flex: "1 0 auto",
              marginBottom: "15px",
              textAlign: "right",
            }}
          >
            <MiscSideButtons />
          </div>
        </div>

        {project_is_running &&
          show_custom_software_reset &&
          checked_files.size == 0 &&
          images != null && (
            <CustomSoftwareReset
              project_id={project_id}
              images={images}
              project_map={project_map}
              actions={actions}
              available_features={available_features}
            />
          )}

        {show_library && (
          <Row>
            <Col md={12} mdOffset={0} lg={8} lgOffset={2}>
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
                close={() => actions.toggle_library(false)}
              >
                <Library
                  project_id={project_id}
                  onClose={() => actions.toggle_library(false)}
                />
              </SettingBox>
            </Col>
          </Row>
        )}

        {checked_files.size > 0 && file_action != undefined ? (
          <Row>
            <Col sm={12}>
              <ActionBox
                file_action={file_action}
                checked_files={checked_files}
                current_path={current_path}
                project_id={project_id}
                actions={actions}
              />
            </Col>
          </Row>
        ) : undefined}
      </div>

      {listingError && (
        <div style={{ margin: "30px auto", textAlign: "center" }}>
          <ShowError error={listingError} style={{ textAlign: "left" }} />
          <br />
          <Space.Compact>
            <Button size="large" style={{ margin: "auto" }} onClick={refresh}>
              <Icon name="refresh" /> Refresh
            </Button>
            {listingError.code == "ENOENT" && (
              <Button
                size="large"
                style={{ margin: "auto" }}
                onClick={async () => {
                  const fs = actions?.fs();
                  try {
                    await fs.mkdir(current_path, { recursive: true });
                    refresh();
                  } catch (err) {
                    actions?.setState({ error: err });
                  }
                }}
              >
                <Icon name="folder-open" /> Create Directory
              </Button>
            )}
          </Space.Compact>
        </div>
      )}

      {!listingError && (
        <div
          ref={fileListingRef}
          className="smc-vfill"
          style={{
            flex: "1 0 auto",
            display: "flex",
            flexDirection: "column",
            padding: "0 5px 5px 5px",
          }}
        >
          <FileUploadWrapper
            project_id={project_id}
            dest_path={current_path}
            config={{ clickable: ".upload-button" }}
            style={{
              flex: "1 0 auto",
              display: "flex",
              flexDirection: "column",
            }}
            className="smc-vfill"
          >
            {listing == null ? (
              <div style={{ textAlign: "center" }}>
                <Loading delay={1000} theme="medium" />
              </div>
            ) : (
              <FileListing
                active_file_sort={active_file_sort}
                sort_by={(column_name: string) =>
                  setSort({
                    column_name,
                    project_id,
                    path: current_path,
                    compute_server_id,
                  })
                }
                listing={listing}
                file_search={file_search}
                checked_files={checked_files}
                current_path={current_path}
                actions={actions}
                project_id={project_id}
                shiftIsDown={shiftIsDown}
                configuration_main={
                  configuration?.get("main") as MainConfiguration | undefined
                }
                publicFiles={publicFiles}
              />
            )}
          </FileUploadWrapper>
        </div>
      )}
      <ExplorerTour
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
