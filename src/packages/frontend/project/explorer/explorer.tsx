/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import * as immutable from "immutable";
import * as _ from "lodash";
import React from "react";
import { UsersViewing } from "@cocalc/frontend/account/avatar/users-viewing";
import { Col, Row } from "@cocalc/frontend/antd-bootstrap";
import {
  project_redux_name,
  rclass,
  redux,
  rtypes,
  TypedMap,
} from "@cocalc/frontend/app-framework";
import { ShallowTypedMap } from "@cocalc/frontend/app-framework/ShallowTypedMap";
import {
  A,
  ActivityDisplay,
  Loading,
  SettingBox,
} from "@cocalc/frontend/components";
import { ComputeServerDocStatus } from "@cocalc/frontend/compute/doc-status";
import SelectComputeServerForFileExplorer from "@cocalc/frontend/compute/select-server-for-explorer";
import { ComputeImages } from "@cocalc/frontend/custom-software/init";
import { CustomSoftwareReset } from "@cocalc/frontend/custom-software/reset-bar";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import { FileUploadWrapper } from "@cocalc/frontend/file-upload";
import { Library } from "@cocalc/frontend/library";
import {
  Available,
  MainConfiguration,
} from "@cocalc/frontend/project_configuration";
import { ProjectActions } from "@cocalc/frontend/project_store";
import { ProjectMap, ProjectStatus } from "@cocalc/frontend/todo-types";
import AskNewFilename from "../ask-filename";
import { useProjectContext } from "../context";
import { ActionBar } from "./action-bar";
import { ActionBox } from "./action-box";
import { FileListing } from "./file-listing";
import { default_ext } from "./file-listing/utils";
import { MiscSideButtons } from "./misc-side-buttons";
import { NewButton } from "./new-button";
import { PathNavigator } from "./path-navigator";
import { SearchBar } from "./search-bar";
import ExplorerTour from "./tour/tour";
import ShowError from "@cocalc/frontend/components/error";

export type Configuration = ShallowTypedMap<{ main: MainConfiguration }>;

const error_style: React.CSSProperties = {
  marginRight: "1ex",
  whiteSpace: "pre-line",
  position: "absolute",
  zIndex: 15,
  right: "5px",
  boxShadow: "5px 5px 5px grey",
} as const;

interface ReactProps {
  project_id: string;
  actions: ProjectActions;
  name: string;
}

interface ReduxProps {
  project_map?: ProjectMap;
  get_my_group: (project_id: string) => "admin" | "public";
  get_total_project_quotas: (project_id: string) => { member_host: boolean };
  other_settings?: immutable.Map<string, any>;
  is_logged_in?: boolean;
  kucalc?: string;
  site_name?: string;
  images: ComputeImages;
  active_file_sort: TypedMap<{ column_name: string; is_descending: boolean }>;
  current_path: string;
  history_path: string;
  activity?: object;
  file_action?:
    | "compress"
    | "delete"
    | "rename"
    | "duplicate"
    | "move"
    | "copy"
    | "share"
    | "download"
    | "upload";
  file_search: string;
  show_hidden?: boolean;
  show_masked?: boolean;
  error?: string;
  checked_files: immutable.Set<string>;
  file_creation_error?: string;
  ext_selection?: string;
  new_name?: string;
  library?: object;
  show_library?: boolean;
  public_paths?: immutable.List<string>; // used only to trigger table init
  configuration?: Configuration;
  available_features?: Available;
  file_listing_scroll_top?: number;
  show_custom_software_reset?: boolean;
  explorerTour?: boolean;
  compute_server_id: number;
}

interface State {
  shift_is_down: boolean;
}

export function Explorer() {
  const { project_id } = useProjectContext();
  return (
    <Explorer0
      name={project_redux_name(project_id)}
      project_id={project_id}
      actions={redux.getProjectActions(project_id)}
    />
  );
}

// TODO: change/rewrite Explorer to not have any rtypes.objects and
// add a shouldComponentUpdate!!
const Explorer0 = rclass(
  class Explorer extends React.Component<ReactProps & ReduxProps, State> {
    newFileRef = React.createRef<any>();
    searchAndTerminalBar = React.createRef<any>();
    fileListingRef = React.createRef<any>();
    currentDirectoryRef = React.createRef<any>();
    miscButtonsRef = React.createRef<any>();
    listingRef = React.createRef<any>();

    static reduxProps = ({ name }) => {
      return {
        projects: {
          project_map: rtypes.immutable.Map,
          get_my_group: rtypes.func.isRequired,
          get_total_project_quotas: rtypes.func.isRequired,
        },

        account: {
          other_settings: rtypes.immutable.Map,
          is_logged_in: rtypes.bool,
        },

        customize: {
          kucalc: rtypes.string,
          site_name: rtypes.string,
        },

        compute_images: {
          images: rtypes.immutable.Map,
        },

        [name]: {
          active_file_sort: rtypes.immutable.Map,
          current_path: rtypes.string,
          history_path: rtypes.string,
          activity: rtypes.object,
          file_action: rtypes.string,
          file_search: rtypes.string,
          show_hidden: rtypes.bool,
          show_masked: rtypes.bool,
          error: rtypes.string,
          checked_files: rtypes.immutable,
          file_creation_error: rtypes.string,
          ext_selection: rtypes.string,
          new_name: rtypes.string,
          library: rtypes.object,
          show_library: rtypes.bool,
          public_paths: rtypes.immutable, // used only to trigger table init
          configuration: rtypes.immutable,
          available_features: rtypes.object,
          file_listing_scroll_top: rtypes.number,
          show_custom_software_reset: rtypes.bool,
          explorerTour: rtypes.bool,
          compute_server_id: rtypes.number,
        },
      };
    };

    static defaultProps = {
      file_search: "",
      new_name: "",
      redux,
    };

    constructor(props) {
      super(props);
      this.state = {
        shift_is_down: false,
      };
    }

    componentDidMount() {
      // Update AFTER react draws everything
      // Should probably be moved elsewhere
      // Prevents cascading changes which impact responsiveness
      // https://github.com/sagemathinc/cocalc/pull/3705#discussion_r268263750
      $(window).on("keydown", this.handle_files_key_down);
      $(window).on("keyup", this.handle_files_key_up);
    }

    componentWillUnmount() {
      $(window).off("keydown", this.handle_files_key_down);
      $(window).off("keyup", this.handle_files_key_up);
    }

    handle_files_key_down = (e): void => {
      if (e.key === "Shift") {
        this.setState({ shift_is_down: true });
      }
    };

    handle_files_key_up = (e): void => {
      if (e.key === "Shift") {
        this.setState({ shift_is_down: false });
      }
    };

    create_file = (ext, switch_over) => {
      if (switch_over == undefined) {
        switch_over = true;
      }
      const { file_search } = this.props;
      if (
        ext == undefined &&
        file_search.lastIndexOf(".") <= file_search.lastIndexOf("/")
      ) {
        let disabled_ext;
        if (this.props.configuration != undefined) {
          ({ disabled_ext } = this.props.configuration.get("main", {
            disabled_ext: [],
          }));
        } else {
          disabled_ext = [];
        }
        ext = default_ext(disabled_ext);
      }

      this.props.actions.create_file({
        name: file_search,
        ext,
        current_path: this.props.current_path,
        switch_over,
      });
      this.props.actions.setState({ file_search: "" });
    };

    create_folder = (switch_over = true): void => {
      this.props.actions.create_folder({
        name: this.props.file_search,
        current_path: this.props.current_path,
        switch_over,
      });
      this.props.actions.setState({ file_search: "" });
    };

    file_listing_page_size() {
      return (
        this.props.other_settings &&
        this.props.other_settings.get("page_size", 50)
      );
    }

    render() {
      let project_is_running: boolean, project_state: ProjectStatus | undefined;

      if (this.props.checked_files == undefined) {
        // hasn't loaded/initialized at all
        return <Loading />;
      }

      const my_group = this.props.get_my_group(this.props.project_id);

      // regardless of consequences, for admins a project is always running
      // see https://github.com/sagemathinc/cocalc/issues/3863
      if (my_group === "admin") {
        project_state = new ProjectStatus({ state: "running" });
        project_is_running = true;
        // next, we check if this is a common user (not public)
      } else if (my_group !== "public") {
        project_state = this.props.project_map?.getIn([
          this.props.project_id,
          "state",
        ]) as any;
        project_is_running = project_state?.get("state") == "running";
      } else {
        project_is_running = false;
      }

      const FLEX_ROW_STYLE = {
        display: "flex",
        flexFlow: "row wrap",
        justifyContent: "space-between",
        alignItems: "stretch",
      };

      // be careful with adding height:'100%'. it could cause flex to miscalculate. see #3904
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
            <ShowError
              error={this.props.error}
              style={error_style}
              setError={(error) => this.props.actions.setState({ error })}
            />
            <ActivityDisplay
              trunc={80}
              activity={_.values(this.props.activity)}
              on_clear={() => this.props.actions.clear_all_activity()}
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
                    project_id={this.props.project_id}
                    key="compute-server"
                    style={{ marginRight: "5px", borderRadius: "5px" }}
                  />
                  <div
                    ref={this.currentDirectoryRef}
                    className="cc-project-files-path-nav"
                  >
                    <PathNavigator project_id={this.props.project_id} />
                  </div>
                </div>
                {!!this.props.compute_server_id && (
                  <div
                    style={{
                      fontSize: "10pt",
                      marginTop: "-10px",
                      marginBottom: "5px",
                    }}
                  >
                    <ComputeServerDocStatus
                      standalone
                      id={this.props.compute_server_id}
                      requestedId={this.props.compute_server_id}
                      project_id={this.props.project_id}
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
                  <div ref={this.newFileRef}>
                    <NewButton
                      file_search={this.props.file_search}
                      current_path={this.props.current_path}
                      actions={this.props.actions}
                      create_file={this.create_file}
                      create_folder={this.create_folder}
                      configuration={this.props.configuration}
                      disabled={!!this.props.ext_selection}
                    />
                  </div>
                </div>
              )}
              {!IS_MOBILE && (
                <div
                  style={{ flex: "1 1 auto" }}
                  ref={this.searchAndTerminalBar}
                >
                  <SearchBar
                    actions={this.props.actions}
                    current_path={this.props.current_path}
                    file_search={this.props.file_search}
                    file_creation_error={this.props.file_creation_error}
                    create_file={this.create_file}
                    create_folder={this.create_folder}
                    listingRef={this.listingRef}
                  />
                </div>
              )}
              <div
                style={{
                  flex: "0 1 auto",
                }}
              >
                <UsersViewing project_id={this.props.project_id} />
              </div>
            </div>

            {this.props.ext_selection != null && (
              <AskNewFilename project_id={this.props.project_id} />
            )}
            <div style={FLEX_ROW_STYLE}>
              <div
                style={{
                  flex: "1 0 auto",
                  marginRight: "5px",
                  minWidth: "20em",
                }}
              >
                <ActionBar
                  listing={[] /* TODO */}
                  project_id={this.props.project_id}
                  checked_files={this.props.checked_files}
                  current_path={this.props.current_path}
                  project_map={this.props.project_map}
                  images={this.props.images}
                  actions={this.props.actions}
                  available_features={this.props.available_features}
                  show_custom_software_reset={
                    this.props.show_custom_software_reset
                  }
                  project_is_running={project_is_running}
                />
              </div>
              <div
                ref={this.miscButtonsRef}
                style={{
                  flex: "1 0 auto",
                  marginBottom: "15px",
                  textAlign: "right",
                }}
              >
                <MiscSideButtons
                  project_id={this.props.project_id}
                  current_path={this.props.current_path}
                  show_hidden={
                    this.props.show_hidden != undefined
                      ? this.props.show_hidden
                      : false
                  }
                  show_masked={
                    this.props.show_masked != undefined
                      ? this.props.show_masked
                      : true
                  }
                  actions={this.props.actions}
                  kucalc={this.props.kucalc}
                  available_features={this.props.available_features}
                />
              </div>
            </div>

            {project_is_running &&
              this.props.show_custom_software_reset &&
              this.props.checked_files.size == 0 && (
                <CustomSoftwareReset
                  project_id={this.props.project_id}
                  images={this.props.images}
                  project_map={this.props.project_map}
                  actions={this.props.actions}
                  available_features={this.props.available_features}
                  site_name={this.props.site_name}
                />
              )}

            {this.props.show_library && (
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
                    close={() => this.props.actions.toggle_library(false)}
                  >
                    <Library
                      project_id={this.props.project_id}
                      onClose={() => this.props.actions.toggle_library(false)}
                    />
                  </SettingBox>
                </Col>
              </Row>
            )}

            {this.props.checked_files.size > 0 &&
            this.props.file_action != undefined ? (
              <Row>
                <Col sm={12}>
                  <ActionBox
                    file_map={{} /* TODO */}
                    file_action={this.props.file_action}
                    checked_files={this.props.checked_files}
                    current_path={this.props.current_path}
                    project_id={this.props.project_id}
                    actions={this.props.actions}
                    name={project_redux_name(this.props.project_id)}
                  />
                </Col>
              </Row>
            ) : undefined}
          </div>

          <div
            ref={this.fileListingRef}
            className="smc-vfill"
            style={{
              flex: "1 0 auto",
              display: "flex",
              flexDirection: "column",
              padding: "0 5px 5px 5px",
            }}
          >
            <FileUploadWrapper
              project_id={this.props.project_id}
              dest_path={this.props.current_path}
              config={{ clickable: ".upload-button" }}
              style={{
                flex: "1 0 auto",
                display: "flex",
                flexDirection: "column",
              }}
              className="smc-vfill"
            >
              <FileListing
                listingRef={this.listingRef}
                name={this.props.name}
                active_file_sort={this.props.active_file_sort}
                file_search={this.props.file_search}
                checked_files={this.props.checked_files}
                current_path={this.props.current_path}
                actions={this.props.actions}
                create_file={this.create_file}
                create_folder={this.create_folder}
                project_id={this.props.project_id}
                shift_is_down={this.state.shift_is_down}
                sort_by={this.props.actions.set_sorted_file_column}
                other_settings={this.props.other_settings}
                library={this.props.library}
                redux={redux}
                last_scroll_top={this.props.file_listing_scroll_top}
                configuration_main={this.props.configuration?.get("main")}
                show_hidden={this.props.show_hidden}
                show_masked={this.props.show_masked}
              />
            </FileUploadWrapper>
          </div>
          <ExplorerTour
            open={this.props.explorerTour}
            project_id={this.props.project_id}
            newFileRef={this.newFileRef}
            searchAndTerminalBar={this.searchAndTerminalBar}
            fileListingRef={this.fileListingRef}
            currentDirectoryRef={this.currentDirectoryRef}
            miscButtonsRef={this.miscButtonsRef}
          />
        </div>
      );
    }
  },
);
