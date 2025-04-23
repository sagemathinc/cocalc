/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Radio, Space, Tooltip } from "antd";
import * as immutable from "immutable";
import * as _ from "lodash";
import React from "react";
import { FormattedMessage } from "react-intl";

import { UsersViewing } from "@cocalc/frontend/account/avatar/users-viewing";
import { Button, ButtonGroup, Col, Row } from "@cocalc/frontend/antd-bootstrap";
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
  ErrorDisplay,
  Icon,
  Loading,
  Paragraph,
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
import { unreachable } from "@cocalc/util/misc";
import AskNewFilename from "../ask-filename";
import { useProjectContext } from "../context";
import { AccessErrors } from "./access-errors";
import { ActionBar } from "./action-bar";
import { ActionBox } from "./action-box";
import { FetchDirectoryErrors } from "./fetch-directory-errors";
import { FileListing } from "./file-listing";
import { TerminalModeDisplay } from "./file-listing/terminal-mode-display";
import { default_ext, TERM_MODE_CHAR } from "./file-listing/utils";
import { MiniTerminal } from "./mini-terminal";
import { MiscSideButtons } from "./misc-side-buttons";
import { NewButton } from "./new-button";
import { PathNavigator } from "./path-navigator";
import { SearchBar } from "./search-bar";
import ExplorerTour from "./tour/tour";
import { ListingItem } from "./types";

function pager_range(page_size, page_number) {
  const start_index = page_size * page_number;
  return { start_index, end_index: start_index + page_size };
}

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
  page_number: number;
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
  selected_file_index?: number;
  file_creation_error?: string;
  ext_selection?: string;
  displayed_listing: {
    listing: ListingItem[];
    error: any;
    file_map: Map<string, any>;
  };
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
          page_number: rtypes.number.isRequired,
          file_action: rtypes.string,
          file_search: rtypes.string,
          show_hidden: rtypes.bool,
          show_masked: rtypes.bool,
          error: rtypes.string,
          checked_files: rtypes.immutable,
          selected_file_index: rtypes.number,
          file_creation_error: rtypes.string,
          ext_selection: rtypes.string,
          displayed_listing: rtypes.object,
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
      page_number: 0,
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

    previous_page = () => {
      if (this.props.page_number > 0) {
        this.props.actions.setState({
          page_number: this.props.page_number - 1,
        });
      }
    };

    next_page = () => {
      this.props.actions.setState({
        page_number: this.props.page_number + 1,
      });
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
      this.props.actions.setState({ file_search: "", page_number: 0 });
    };

    create_folder = (switch_over = true): void => {
      this.props.actions.create_folder({
        name: this.props.file_search,
        current_path: this.props.current_path,
        switch_over,
      });
      this.props.actions.setState({ file_search: "", page_number: 0 });
    };

    render_paging_buttons(num_pages: number): JSX.Element | undefined {
      if (num_pages > 1) {
        return (
          <Row>
            <Col sm={4}>
              <ButtonGroup style={{ marginBottom: "5px" }}>
                <Button
                  onClick={this.previous_page}
                  disabled={this.props.page_number <= 0}
                >
                  <Icon name="angle-double-left" /> Prev
                </Button>
                <Button disabled>
                  {`${this.props.page_number + 1}/${num_pages}`}
                </Button>
                <Button
                  onClick={this.next_page}
                  disabled={this.props.page_number >= num_pages - 1}
                >
                  Next <Icon name="angle-double-right" />
                </Button>
              </ButtonGroup>
            </Col>
          </Row>
        );
      }
    }

    render_files_action_box(file_map?) {
      if (file_map == undefined) {
        return;
      }
      return (
        <Col sm={12}>
          <ActionBox
            file_action={this.props.file_action}
            checked_files={this.props.checked_files}
            current_path={this.props.current_path}
            project_id={this.props.project_id}
            file_map={file_map}
            //new_name={this.props.new_name}
            actions={this.props.actions}
            displayed_listing={this.props.displayed_listing}
            name={project_redux_name(this.props.project_id)}
          />
        </Col>
      );
    }

    render_library() {
      return (
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
      );
    }

    render_files_actions(listing, project_is_running) {
      return (
        <ActionBar
          project_id={this.props.project_id}
          checked_files={this.props.checked_files}
          page_number={this.props.page_number}
          page_size={this.file_listing_page_size()}
          current_path={this.props.current_path}
          listing={listing}
          project_map={this.props.project_map}
          images={this.props.images}
          actions={this.props.actions}
          available_features={this.props.available_features}
          show_custom_software_reset={this.props.show_custom_software_reset}
          project_is_running={project_is_running}
        />
      );
    }

    render_new_file() {
      return (
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
      );
    }

    render_activity() {
      return (
        <ActivityDisplay
          trunc={80}
          activity={_.values(this.props.activity)}
          on_clear={() => this.props.actions.clear_all_activity()}
          style={{ top: "100px" }}
        />
      );
    }

    render_error() {
      if (this.props.error) {
        return (
          <ErrorDisplay
            error={this.props.error}
            style={error_style}
            onClose={() => this.props.actions.setState({ error: "" })}
          />
        );
      }
    }

    render_access_error() {
      return <AccessErrors is_logged_in={!!this.props.is_logged_in} />;
    }

    render_file_listing(
      listing: ListingItem[] | undefined,
      file_map,
      fetch_directory_error: any,
      project_is_running: boolean,
    ) {
      if (fetch_directory_error) {
        // TODO: the refresh button text is inconsistant
        return (
          <div>
            <FetchDirectoryErrors
              error={fetch_directory_error}
              path={this.props.current_path}
              quotas={this.props.get_total_project_quotas(
                this.props.project_id,
              )}
              is_commercial={require("@cocalc/frontend/customize").commercial}
              is_logged_in={!!this.props.is_logged_in}
            />
            <br />
            <Button
              onClick={() =>
                this.props.actions.fetch_directory_listing({
                  force: true,
                  path: this.props.current_path,
                })
              }
            >
              <Icon name="refresh" /> Try again to get directory listing
            </Button>
          </div>
        );
      } else if (listing != undefined) {
        return (
          <FileUploadWrapper
            project_id={this.props.project_id}
            dest_path={this.props.current_path}
            event_handlers={{
              complete: () => this.props.actions.fetch_directory_listing(),
            }}
            config={{ clickable: ".upload-button" }}
            style={{
              flex: "1 0 auto",
              display: "flex",
              flexDirection: "column",
            }}
            className="smc-vfill"
          >
            <FileListing
              isRunning={project_is_running}
              name={this.props.name}
              active_file_sort={this.props.active_file_sort}
              listing={listing}
              file_map={file_map}
              file_search={this.props.file_search}
              checked_files={this.props.checked_files}
              current_path={this.props.current_path}
              actions={this.props.actions}
              create_file={this.create_file}
              create_folder={this.create_folder}
              selected_file_index={this.props.selected_file_index}
              project_id={this.props.project_id}
              shift_is_down={this.state.shift_is_down}
              sort_by={this.props.actions.set_sorted_file_column}
              other_settings={this.props.other_settings}
              library={this.props.library}
              redux={redux}
              last_scroll_top={this.props.file_listing_scroll_top}
              configuration_main={this.props.configuration?.get("main")}
            />
          </FileUploadWrapper>
        );
      } else {
        if (project_is_running) {
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
                              .start_project(this.props.project_id);
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

    file_listing_page_size() {
      return (
        this.props.other_settings &&
        this.props.other_settings.get("page_size", 50)
      );
    }

    render_control_row(
      visible_listing: ListingItem[] | undefined,
    ): JSX.Element {
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
              {this.render_new_file()}
            </div>
          )}
          {!IS_MOBILE && (
            <SearchTerminalBar
              ref={this.searchAndTerminalBar}
              actions={this.props.actions}
              current_path={this.props.current_path}
              file_search={this.props.file_search}
              visible_listing={visible_listing}
              selected_file_index={this.props.selected_file_index}
              file_creation_error={this.props.file_creation_error}
              create_file={this.create_file}
              create_folder={this.create_folder}
            />
          )}
          <div
            style={{
              flex: "0 1 auto",
            }}
          >
            <UsersViewing project_id={this.props.project_id} />
          </div>
        </div>
      );
    }

    render_project_files_buttons(): JSX.Element {
      return (
        <div
          ref={this.miscButtonsRef}
          style={{ flex: "1 0 auto", marginBottom: "15px", textAlign: "right" }}
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
      );
    }

    render_custom_software_reset() {
      if (!this.props.show_custom_software_reset) {
        return undefined;
      }
      // also don't show this box, if any files are selected
      if (this.props.checked_files.size > 0) {
        return undefined;
      }
      return (
        <CustomSoftwareReset
          project_id={this.props.project_id}
          images={this.props.images}
          project_map={this.props.project_map}
          actions={this.props.actions}
          available_features={this.props.available_features}
          site_name={this.props.site_name}
        />
      );
    }
    render_terminal_mode() {
      if (this.props.file_search[0] === TERM_MODE_CHAR) {
        return <TerminalModeDisplay />;
      }
    }

    render() {
      let project_is_running: boolean,
        project_state: ProjectStatus | undefined,
        visible_listing: ListingItem[] | undefined;

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

      const displayed_listing = this.props.displayed_listing;
      const { listing, file_map } = displayed_listing;
      const directory_error = displayed_listing.error;

      const file_listing_page_size = this.file_listing_page_size();
      if (listing != undefined) {
        const { start_index, end_index } = pager_range(
          file_listing_page_size,
          this.props.page_number,
        );
        visible_listing = listing.slice(start_index, end_index);
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
            {this.render_error()}
            {this.render_activity()}
            {this.render_control_row(visible_listing)}
            {this.render_terminal_mode()}
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
                {listing != undefined
                  ? this.render_files_actions(listing, project_is_running)
                  : undefined}
              </div>
              {this.render_project_files_buttons()}
            </div>

            {project_is_running
              ? this.render_custom_software_reset()
              : undefined}

            {this.props.show_library ? this.render_library() : undefined}

            {this.props.checked_files.size > 0 &&
            this.props.file_action != undefined ? (
              <Row>{this.render_files_action_box(file_map)}</Row>
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
            {this.render_file_listing(
              visible_listing,
              file_map,
              directory_error,
              project_is_running,
            )}
            {listing != undefined
              ? this.render_paging_buttons(
                  Math.ceil(listing.length / file_listing_page_size),
                )
              : undefined}
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

const SearchTerminalBar = React.forwardRef(
  (
    {
      current_path,
      file_search,
      actions,
      visible_listing,
      selected_file_index,
      file_creation_error,
      create_file,
      create_folder,
    }: {
      ref: React.Ref<any>;
      current_path: string;
      file_search: string;
      actions: ProjectActions;
      visible_listing: ListingItem[] | undefined;
      selected_file_index?: number;
      file_creation_error?: string;
      create_file: (ext?: string, switch_over?: boolean) => void;
      create_folder: (switch_over?: boolean) => void;
    },
    ref: React.LegacyRef<HTMLDivElement> | undefined,
  ) => {
    const [mode, setMode] = React.useState<"search" | "terminal">("search");

    function renderTerminal() {
      return (
        <MiniTerminal
          current_path={current_path}
          actions={actions}
          show_close_x={true}
        />
      );
    }

    function renderSearch() {
      return (
        <SearchBar
          key={current_path}
          file_search={file_search}
          actions={actions}
          current_path={current_path}
          selected_file={
            visible_listing != undefined
              ? visible_listing[selected_file_index || 0]
              : undefined
          }
          selected_file_index={selected_file_index}
          file_creation_error={file_creation_error}
          num_files_displayed={
            visible_listing != undefined ? visible_listing.length : undefined
          }
          create_file={create_file}
          create_folder={create_folder}
        />
      );
    }

    function renderBar() {
      switch (mode) {
        case "search":
          return renderSearch();
        case "terminal":
          return renderTerminal();
        default:
          unreachable(mode);
      }
    }

    return (
      <Space.Compact style={{ flex: "1 1 auto" }}>
        <Radio.Group
          ref={ref}
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          style={{ whiteSpace: "nowrap" }}
        >
          <Tooltip title="Click to change the input box to filter files by their name and open them with return.">
            <Radio.Button value="search">
              <Icon name="search" />
            </Radio.Button>
          </Tooltip>
          <Tooltip title="Click to change the input box to run commands.">
            <Radio.Button value="terminal" style={{ borderRadius: 0 }}>
              <Icon name="terminal" />
            </Radio.Button>
          </Tooltip>
        </Radio.Group>
        {renderBar()}
      </Space.Compact>
    );
  },
);
