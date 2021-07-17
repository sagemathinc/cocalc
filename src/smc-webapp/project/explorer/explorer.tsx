/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import * as immutable from "immutable";
import * as underscore from "underscore";
import { rtypes, rclass, redux, TypedMap } from "../../app-framework";
import {
  A,
  ActivityDisplay,
  Icon,
  TimeAgo,
  ErrorDisplay,
  Loading,
  SettingBox,
} from "../../r_misc";
import { CourseProjectExtraHelp } from "../warnings/course-project";
import { default_ext } from "./file-listing/utils";
import { BillingPage } from "../../billing/billing-page";
import { PayCourseFee } from "../../billing/pay-course-fee";
import { MiniTerminal } from "./mini-terminal";
import { CustomSoftwareReset } from "../../custom-software/reset-bar";
import { FileListing } from "./file-listing";
import { AskNewFilename } from "../ask-filename";
import { MainConfiguration, Available } from "../../project_configuration";
import { PathNavigator } from "./path-navigator";
import { MiscSideButtons } from "./misc-side-buttons";
import { ActionBar } from "./action-bar";
import { ActionBox } from "./action-box";
import { SearchBar } from "./search-bar";
import { NewButton } from "./new-button";
import { ShallowTypedMap } from "../../app-framework/ShallowTypedMap";
import { ComputeImages } from "../../custom-software/init";
import { ProjectMap, ProjectStatus } from "smc-webapp/todo-types";
import { ProjectActions } from "smc-webapp/project_store";
import { FetchDirectoryErrors } from "./fetch-directory-errors";
import { AccessErrors } from "./access-errors";
import { ListingItem } from "./types";

import { Col, Row, ButtonGroup, Button, Alert } from "react-bootstrap";
const STUDENT_COURSE_PRICE = require("smc-util/upgrade-spec").upgrades
  .subscription.student_course.price.month4;
import { FileUploadWrapper } from "../../file-upload";
import { Library } from "../../library";
import { webapp_client } from "../../webapp-client";
import { UsersViewing } from "../../account/avatar/users-viewing";

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
  date_when_course_payment_required: (project_id: string) => number;
  get_my_group: (project_id: string) => "admin" | "public";
  get_total_project_quotas: (project_id: string) => { member_host: boolean };
  other_settings?: immutable.Map<string, any>;
  is_logged_in?: boolean;
  customer?: { sources?: { total_count?: number } };
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
  new_filename?: string;
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
}

interface State {
  show_pay: boolean;
  shift_is_down: boolean;
}
// TODO: change/rewrite Explorer to not have any rtypes.objects and
// add a shouldComponentUpdate!!
export const Explorer = rclass(
  class Explorer extends React.Component<ReactProps & ReduxProps, State> {
    static reduxProps = ({ name }) => {
      return {
        projects: {
          project_map: rtypes.immutable.Map,
          date_when_course_payment_required: rtypes.func.isRequired,
          get_my_group: rtypes.func.isRequired,
          get_total_project_quotas: rtypes.func.isRequired,
        },

        account: {
          other_settings: rtypes.immutable.Map,
          is_logged_in: rtypes.bool,
        },

        billing: {
          customer: rtypes.object,
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
          new_filename: rtypes.string,
          displayed_listing: rtypes.object,
          new_name: rtypes.string,
          library: rtypes.object,
          show_library: rtypes.bool,
          public_paths: rtypes.immutable, // used only to trigger table init
          configuration: rtypes.immutable,
          available_features: rtypes.object,
          file_listing_scroll_top: rtypes.number,
          show_custom_software_reset: rtypes.bool,
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
        show_pay: false,
        shift_is_down: false,
      };
    }

    componentDidMount() {
      // Update AFTER react draws everything
      // Should probably be moved elsewhere
      // Prevents cascading changes which impact responsiveness
      // https://github.com/sagemathinc/cocalc/pull/3705#discussion_r268263750
      setTimeout(() => {
        const billing = redux.getActions("billing");
        if (billing != undefined) {
          billing.update_customer();
        }
      }, 200);
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

    render_files_action_box(file_map?, public_view?) {
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
            public_view={public_view}
            file_map={file_map}
            new_name={this.props.new_name}
            actions={this.props.actions}
            displayed_listing={this.props.displayed_listing}
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

    render_files_actions(listing, public_view, project_is_running) {
      return (
        <ActionBar
          project_id={this.props.project_id}
          checked_files={this.props.checked_files}
          page_number={this.props.page_number}
          page_size={this.file_listing_page_size()}
          public_view={public_view}
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
        <NewButton
          file_search={this.props.file_search}
          current_path={this.props.current_path}
          actions={this.props.actions}
          create_file={this.create_file}
          create_folder={this.create_folder}
          configuration={this.props.configuration}
          disabled={!!this.props.ext_selection}
        />
      );
    }

    render_activity() {
      return (
        <ActivityDisplay
          trunc={80}
          activity={underscore.values(this.props.activity)}
          on_clear={() => this.props.actions.clear_all_activity()}
          style={{ top: "100px" }}
        />
      );
    }

    render_upgrade_in_place() {
      const cards =
        (this.props.customer &&
          this.props.customer.sources &&
          this.props.customer.sources.total_count) ||
        0;

      return (
        <div style={{ marginTop: "10px" }}>
          <BillingPage is_simplified={true} for_course={true} />
          {cards && (
            <PayCourseFee project_id={this.props.project_id} redux={redux} />
          )}
        </div>
      );
    }

    render_course_payment_required() {
      const cards =
        (this.props.customer &&
          this.props.customer.sources &&
          this.props.customer.sources.total_count) ||
        0;

      return (
        <Alert bsStyle="warning">
          <h4 style={{ padding: "2em" }}>
            <Icon name="exclamation-triangle" /> Your instructor requires that
            you pay the one-time ${STUDENT_COURSE_PRICE} course fee for this
            project.
            {cards && <CourseProjectExtraHelp />}
          </h4>
          {this.render_upgrade_in_place()}
        </Alert>
      );
    }

    render_course_payment_warning(pay) {
      let link;
      if (this.state.show_pay) {
        link = <span>pay the one-time ${STUDENT_COURSE_PRICE} course fee</span>;
      } else {
        link = (
          <a
            style={{ cursor: "pointer" }}
            onClick={() => this.setState({ show_pay: true })}
          >
            pay the one-time ${STUDENT_COURSE_PRICE} course fee
          </a>
        );
      }
      return (
        <Alert bsStyle={"warning"} style={{ fontSize: "12pt" }}>
          <Icon name="exclamation-triangle" /> Your instructor requires that you{" "}
          {link} for this project within <TimeAgo date={pay} />.
          {this.state.show_pay ? this.render_upgrade_in_place() : undefined}
        </Alert>
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

    render_access_error(public_view: boolean) {
      return (
        <AccessErrors
          public_view={public_view}
          is_logged_in={!!this.props.is_logged_in}
        />
      );
    }

    render_file_listing(
      listing: ListingItem[] | undefined,
      file_map,
      fetch_directory_error: any,
      public_view: boolean
    ) {
      if (fetch_directory_error) {
        // TODO: the refresh button text is inconsistant
        return (
          <div>
            <FetchDirectoryErrors
              error={fetch_directory_error}
              path={this.props.current_path}
              quotas={this.props.get_total_project_quotas(
                this.props.project_id
              )}
              is_commercial={require("smc-webapp/customize").commercial}
              public_view={public_view}
              is_logged_in={!!this.props.is_logged_in}
            />
            <br />
            <Button
              onClick={() =>
                this.props.actions.fetch_directory_listing({ force: true })
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
            disabled={public_view}
            style={{
              flex: "1 0 auto",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <FileListing
              name={this.props.name}
              active_file_sort={this.props.active_file_sort}
              listing={listing}
              file_map={file_map}
              file_search={this.props.file_search}
              checked_files={this.props.checked_files}
              current_path={this.props.current_path}
              public_view={public_view}
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
        return (
          <div style={{ textAlign: "center" }}>
            <Loading theme={"medium"} />
          </div>
        );
      }
    }

    file_listing_page_size() {
      return (
        this.props.other_settings &&
        this.props.other_settings.get("page_size", 50)
      );
    }

    render_control_row(
      public_view: boolean,
      visible_listing: ListingItem[] | undefined
    ): JSX.Element {
      return (
        <div
          style={{
            display: "flex",
            flexFlow: "row wrap",
            justifyContent: "space-between",
            alignItems: "stretch",
          }}
        >
          <div
            style={{ flex: "1 0 20%", marginRight: "10px", minWidth: "20em" }}
          >
            <SearchBar
              project_id={this.props.project_id}
              key={this.props.current_path}
              file_search={this.props.file_search}
              actions={this.props.actions}
              current_path={this.props.current_path}
              selected_file={
                visible_listing != undefined
                  ? visible_listing[this.props.selected_file_index || 0]
                  : undefined
              }
              selected_file_index={this.props.selected_file_index}
              file_creation_error={this.props.file_creation_error}
              num_files_displayed={
                visible_listing != undefined
                  ? visible_listing.length
                  : undefined
              }
              create_file={this.create_file}
              create_folder={this.create_folder}
              public_view={public_view}
            />
          </div>
          {!public_view && (
            <div
              style={{
                flex: "0 1 auto",
                marginRight: "10px",
                marginBottom: "15px",
              }}
              className="cc-project-files-create-dropdown"
            >
              {this.render_new_file()}
            </div>
          )}
          <div className="cc-project-files-path-nav">
            <PathNavigator project_id={this.props.project_id} />
          </div>
          {!public_view && (
            <>
              <div
                style={{
                  flex: "0 1 auto",
                  marginRight: "10px",
                  marginBottom: "15px",
                }}
              >
                <UsersViewing project_id={this.props.project_id} />
              </div>
              <div style={{ flex: "1 0 auto", marginBottom: "15px" }}>
                <MiniTerminal
                  current_path={this.props.current_path}
                  project_id={this.props.project_id}
                  actions={this.props.actions}
                  show_close_x={false}
                />
              </div>
            </>
          )}
        </div>
      );
    }

    render_project_files_buttons(public_view: boolean): JSX.Element {
      return (
        <div
          style={{ flex: "1 0 auto", marginBottom: "15px", textAlign: "right" }}
        >
          {!public_view && (
            <MiscSideButtons
              project_id={this.props.project_id}
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
              public_view={public_view}
              actions={this.props.actions}
              show_library={this.props.show_library}
              kucalc={this.props.kucalc}
              available_features={this.props.available_features}
            />
          )}
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

    render() {
      let project_is_running: boolean,
        project_state: ProjectStatus | undefined,
        visible_listing: ListingItem[] | undefined;

      if (this.props.checked_files == undefined) {
        // hasn't loaded/initialized at all
        return <Loading />;
      }

      const pay = this.props.date_when_course_payment_required(
        this.props.project_id
      );
      if (pay != undefined && pay <= webapp_client.server_time()) {
        return this.render_course_payment_required();
      }

      const my_group = this.props.get_my_group(this.props.project_id);

      // regardless of consequences, for admins a project is always running
      // see https://github.com/sagemathinc/cocalc/issues/3863
      if (my_group === "admin") {
        project_state = new ProjectStatus({ state: "running" });
        project_is_running = true;
        // next, we check if this is a common user (not public)
      } else if (my_group !== "public") {
        if (this.props.project_map != undefined) {
          project_state = this.props.project_map.getIn([
            this.props.project_id,
            "state",
          ]);
        }
        project_is_running = project_state?.get("state") == "running";
      } else {
        project_is_running = false;
      }

      // enables/disables certain aspects if project is viewed publicly by a non-collaborator
      const public_view = my_group === "public";

      const displayed_listing = this.props.displayed_listing;
      const { listing, file_map } = displayed_listing;
      const directory_error = displayed_listing.error;

      const file_listing_page_size = this.file_listing_page_size();
      if (listing != undefined) {
        const { start_index, end_index } = pager_range(
          file_listing_page_size,
          this.props.page_number
        );
        visible_listing = listing.slice(start_index, end_index);
      }

      const FLEX_ROW_STYLE = {
        display: "flex",
        flexFlow: "row wrap",
        justifyContent: "space-between",
        alignItems: "stretch",
      };

      // be careful with adding height:'100%'. it could cause flex to miscalc. see #3904
      return (
        <div className={"smc-vfill"}>
          <div
            style={{
              flex: "0 0 auto",
              display: "flex",
              flexDirection: "column",
              padding: "5px 5px 0 5px",
            }}
          >
            {pay != undefined
              ? this.render_course_payment_warning(pay)
              : undefined}
            {this.render_error()}
            {this.render_activity()}
            {this.render_control_row(public_view, visible_listing)}
            {this.props.ext_selection != null && (
              <AskNewFilename
                actions={this.props.actions}
                current_path={this.props.current_path}
                ext_selection={this.props.ext_selection}
                new_filename={this.props.new_filename}
                other_settings={this.props.other_settings}
              />
            )}
            <div style={FLEX_ROW_STYLE}>
              <div
                style={{
                  flex: "1 0 auto",
                  marginRight: "10px",
                  minWidth: "20em",
                }}
              >
                {listing != undefined
                  ? this.render_files_actions(
                      listing,
                      public_view,
                      project_is_running
                    )
                  : undefined}
              </div>
              {this.render_project_files_buttons(public_view)}
            </div>

            {project_is_running
              ? this.render_custom_software_reset()
              : undefined}

            {this.props.show_library ? this.render_library() : undefined}

            {this.props.checked_files.size > 0 &&
            this.props.file_action != undefined ? (
              <Row>{this.render_files_action_box(file_map, public_view)}</Row>
            ) : undefined}
          </div>
          <div
            style={{
              flex: "1 0 auto",
              display: "flex",
              flexDirection: "column",
              padding: "0 5px 5px 5px",
            }}
          >
            {public_view && !directory_error
              ? this.render_access_error(public_view)
              : undefined}
            {this.render_file_listing(
              visible_listing,
              file_map,
              directory_error,
              public_view
            )}
            {listing != undefined
              ? this.render_paging_buttons(
                  Math.ceil(listing.length / file_listing_page_size)
                )
              : undefined}
          </div>
        </div>
      );
    }
  }
);
