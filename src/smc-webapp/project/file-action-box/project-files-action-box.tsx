import * as React from "react";
import * as immutable from "immutable";

import { AppRedux, rclass, rtypes } from "../app-framework";
import { ProjectActions } from "../../project_actions";
import { ProjectMap } from "../../todo-types";

import { Compress } from "./compress";
import { Delete } from "./delete";

const {
  Col,
  Row,
  ButtonToolbar,
  ButtonGroup,
  MenuItem,
  Button,
  Well,
  FormControl,
  FormGroup,
  Radio,
  Alert,
  Checkbox
} = require("react-bootstrap");
const misc = require("smc-util/misc");
const {
  DirectoryInput,
  Icon,
  Space,
  Loading,
  LoginLink,
  CopyToClipBoard
} = require("../../r_misc");
const { file_actions } = require("../../project_store");
const { analytics_event } = require("../../tracker");

const account = require("../../account");

/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS104: Avoid inline assignments
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */

const pre_style = {
  marginBottom: "15px",
  maxHeight: "80px",
  minHeight: "34px",
  fontSize: "14px",
  fontFamily: "inherit",
  color: "#555",
  backgroundColor: "#eee",
  padding: "6px 12px"
};

type FileAction =
  | "compress"
  | "delete"
  | "rename"
  | "duplicate"
  | "move"
  | "copy"
  | "share"
  | undefined;

interface Props {
  file_action: FileAction;
  checked_files?: immutable.Set<string>;
  current_path: string;
  project_id: string;
  public_view?: boolean;
  file_map: any;
  new_name: string;
  actions: ProjectActions;
  displayed_listing?: object;
}

interface ReduxProps {
  get_project_select_list: func;
  // get_total_project_quotas relys on this data
  // Will be removed by #1084
  project_map: ProjectMap;
  get_total_project_quotas: (project_id: string) => ;
  get_user_type: func;
  site_name: string;
}

interface State {
  copy_destination_directory: string;
  copy_destination_project_id: string;
  move_destination: string;
  new_name: string;
  show_different_project: boolean;
}

export const ProjectFilesActionBox = rclass<ReactProps>(
  class ProjectFilesActionBox extends React.Component<
    ReactProps & ReduxProps,
    State
  > {
    static reduxProps = _ => {
      return {
        projects: {
          get_project_select_list: rtypes.func,
          // get_total_project_quotas relys on this data
          // Will be removed by #1084
          project_map: rtypes.immutable.Map,
          get_total_project_quotas: rtypes.func
        },

        account: {
          get_user_type: rtypes.func
        },
        customize: {
          site_name: rtypes.string
        }
      };
    };

    constructor(props) {
      super(props);
      this.state = {
        copy_destination_directory: "",
        copy_destination_project_id: this.props.public_view
          ? ""
          : this.props.project_id,
        move_destination: "",
        new_name: this.props.new_name,
        show_different_project: this.props.public_view
      };
    }

    cancel_action() {
      return this.props.actions.set_file_action();
    }

    action_key(e) {
      switch (e.keyCode) {
        case 27:
          return this.cancel_action();
        case 13:
          switch (this.props.file_action) {
            case "rename":
              this.submit_action_rename();
            case "duplicate":
              this.submit_action_duplicate();
            case "move":
              this.submit_action_move();
            case "copy":
              this.submit_action_copy();
            case "share":
              this.submit_action_share();
            default:
              console.warn("Unknown file action", this.props.file_action);
          }
      }
    }

    render_selected_files_list() {
      return (
        <pre style={pre_style}>
          {this.props.checked_files.toArray().map(name => (
            <div key={name}>{misc.path_split(name).tail}</div>
          ))}
        </pre>
      );
    }

    compress(destination) {
      this.props.actions.zip_files({
        src: this.props.checked_files.toArray(),
        dest: misc.path_to_file(this.props.current_path, destination)
      });
      this.props.actions.set_all_files_unchecked();
      this.props.actions.set_file_action();
      return analytics_event("project_file_listing", "compress item");
    }

    render_compress() {
      return (
        <Compress
          items_display={this.render_selected_files_list()}
          size={this.props.checked_files.size}
          on_compress={this.compress}
          on_cancel={this.cancel_action}
          on_keydown={this.action_key}
        />
      );
    }

    delete_click() {
      this.props.actions.delete_files({
        paths: this.props.checked_files.toArray()
      });
      this.props.actions.set_file_action();
      this.props.actions.set_all_files_unchecked();
      this.props.actions.fetch_directory_listing();
      return analytics_event("project_file_listing", "delete item");
    }

    render_delete() {
      return (
        <Delete
          selected_files_display={this.render_selected_files_list()}
          current_path={this.prop.current_path}
          size={this.props.checked_files.size}
          on_delete={this.delete_click}
          on_cancel={this.cancel_action}
          open_snapshots={e => {
            e.preventDefault();
            return this.props.actions.open_directory(".snapshots");
          }}
        />
      );
    }

    rename_or_duplicate_click() {
      const rename_dir = misc.path_split(
        this.props.checked_files != null
          ? this.props.checked_files.first()
          : undefined
      ).head;
      const destination = ReactDOM.findDOMNode(this.refs.new_name).value;
      switch (this.props.file_action) {
        case "rename":
          this.props.actions.move_files({
            src: this.props.checked_files.toArray(),
            dest: misc.path_to_file(rename_dir, destination),
            dest_is_folder: false,
            include_chats: true
          });
          analytics_event("project_file_listing", "rename item");
          break;
        case "duplicate":
          this.props.actions.copy_paths({
            src: this.props.checked_files.toArray(),
            dest: misc.path_to_file(rename_dir, destination),
            only_contents: true
          });
          analytics_event("project_file_listing", "duplicate item");
          break;
      }
      this.props.actions.set_file_action();
      return this.props.actions.set_all_files_unchecked();
    }

    render_rename_warning() {
      const initial_ext = misc.filename_extension(
        this.props.checked_files.first()
      );
      const current_ext = misc.filename_extension(this.state.new_name);
      if (initial_ext !== current_ext) {
        let message;
        if (initial_ext === "") {
          message = `Are you sure you want to add the extension ${current_ext}?`;
        } else if (current_ext === "") {
          message = `Are you sure you want to remove the extension ${initial_ext}?`;
        } else {
          message = `Are you sure you want to change the file extension from ${initial_ext} to ${current_ext}?`;
        }

        return (
          <Alert bsStyle="warning" style={{ wordWrap: "break-word" }}>
            <h4>
              <Icon name="exclamation-triangle" /> Warning
            </h4>
            <p>{message}</p>
            <p>This may cause your file to no longer open properly.</p>
          </Alert>
        );
      }
    }

    valid_rename_input(single_item) {
      if (
        this.state.new_name.length > 250 ||
        misc.contains(this.state.new_name, "/")
      ) {
        return false;
      }
      return this.state.new_name.trim() !== misc.path_split(single_item).tail;
    }

    render_rename_or_duplicate() {
      let action_title, first_heading;
      const single_item = this.props.checked_files.first();
      switch (this.props.file_action) {
        case "rename":
          action_title = "Rename";
          first_heading = "Change the name";
          break;
        case "duplicate":
          action_title = "Duplicate";
          first_heading = "File to duplicate";
          break;
      }
      return (
        <div>
          <Row>
            <Col sm={5} style={{ color: "#666" }}>
              <h4>{first_heading}</h4>
              {this.render_selected_files_list()}
            </Col>
            <Col sm={5} style={{ color: "#666" }}>
              <h4>New name</h4>
              <FormGroup>
                <FormControl
                  autoFocus={true}
                  ref="new_name"
                  key="new_name"
                  type="text"
                  defaultValue={this.state.new_name}
                  placeholder="New file name..."
                  onChange={() =>
                    this.setState({
                      new_name: ReactDOM.findDOMNode(this.refs.new_name).value
                    })
                  }
                  onKeyDown={this.action_key}
                />
              </FormGroup>
              {this.render_rename_warning()}
            </Col>
          </Row>
          <Row>
            <Col sm={12}>
              <ButtonToolbar>
                <Button
                  bsStyle="info"
                  onClick={() => this.rename_or_duplicate_click()}
                  disabled={!this.valid_rename_input(single_item)}
                >
                  <Icon name="pencil" /> {action_title} Item
                </Button>
                <Button onClick={this.cancel_action}>Cancel</Button>
              </ButtonToolbar>
            </Col>
          </Row>
        </div>
      );
    }

    render_rename() {
      return this.render_rename_or_duplicate();
    }

    render_duplicate() {
      return this.render_rename_or_duplicate();
    }

    submit_action_rename() {
      const single_item = this.props.checked_files.first();
      if (this.valid_rename_input(single_item)) {
        return this.rename_or_duplicate_click();
      }
    }

    // Make submit_action_duplicate an alias for submit_action_rename, due to how our
    // dynamically generated function calls work.
    submit_action_duplicate() {
      return this.submit_action_rename();
    }

    move_click() {
      this.props.actions.move_files({
        src: this.props.checked_files.toArray(),
        dest: this.state.move_destination,
        dest_is_folder: true,
        include_chats: true
      });
      this.props.actions.set_file_action();
      this.props.actions.set_all_files_unchecked();
      return analytics_event("project_file_listing", "move item");
    }

    valid_move_input() {
      const src_path = misc.path_split(this.props.checked_files.first()).head;
      let dest = this.state.move_destination.trim();
      if (dest === src_path) {
        return false;
      }
      if (misc.contains(dest, "//") || misc.startswith(dest, "/")) {
        return false;
      }
      if (dest.charAt(dest.length - 1) === "/") {
        dest = dest.slice(0, dest.length - 1);
      }
      return dest !== this.props.current_path;
    }

    render_move() {
      const { size } = this.props.checked_files;
      return (
        <div>
          <Row>
            <Col sm={5} style={{ color: "#666" }}>
              <h4>Move to a folder</h4>
              {this.render_selected_files_list()}
            </Col>
            <Col sm={5} style={{ color: "#666", marginBottom: "15px" }}>
              <h4>Destination</h4>
              <DirectoryInput
                autoFocus={true}
                on_change={value => this.setState({ move_destination: value })}
                key="move_destination"
                default_value=""
                placeholder="Home directory"
                project_id={this.props.project_id}
                on_key_up={this.action_key}
                exclusions={this.props.checked_files.toArray()}
              />
            </Col>
          </Row>
          <Row>
            <Col sm={12}>
              <ButtonToolbar>
                <Button
                  bsStyle="warning"
                  onClick={this.move_click}
                  disabled={!this.valid_move_input()}
                >
                  <Icon name="arrows" /> Move {size} {misc.plural(size, "Item")}
                </Button>
                <Button onClick={this.cancel_action}>Cancel</Button>
              </ButtonToolbar>
            </Col>
          </Row>
        </div>
      );
    }

    submit_action_move() {
      if (this.valid_move_input()) {
        return this.move_click();
      }
    }

    render_different_project_dialog() {
      if (this.state.show_different_project) {
        const data = this.props.get_project_select_list(this.props.project_id);
        if (data == null) {
          return <Loading />;
        }
        return (
          <Col sm={4} style={{ color: "#666", marginBottom: "15px" }}>
            <h4>In the project</h4>
            <Combobox
              valueField="id"
              textField="title"
              data={data}
              filter="contains"
              defaultValue={
                !this.props.public_view ? this.props.project_id : undefined
              }
              placeholder="Select a project..."
              onSelect={value =>
                this.setState({ copy_destination_project_id: value.id })
              }
              messages={{ emptyFilter: "", emptyList: "" }}
            />
            {this.render_copy_different_project_options()}
          </Col>
        );
      }
    }

    render_copy_different_project_options() {
      if (this.props.project_id !== this.state.copy_destination_project_id) {
        return (
          <div>
            <Checkbox
              ref="delete_extra_files_checkbox"
              onChange={e =>
                this.setState({ delete_extra_files: e.target.checked })
              }
            >
              Delete extra files in target directory
            </Checkbox>
            <Checkbox
              ref="overwrite_newer_checkbox"
              onChange={e =>
                this.setState({ overwrite_newer: e.target.checked })
              }
            >
              Overwrite newer versions of files
            </Checkbox>
          </div>
        );
      }
    }

    different_project_button() {
      return (
        <Button
          bsSize="large"
          onClick={() => this.setState({ show_different_project: true })}
          style={{ padding: "0px 5px" }}
        >
          A Different Project
        </Button>
      );
    }

    copy_click() {
      const destination_directory = this.state.copy_destination_directory;
      const destination_project_id = this.state.copy_destination_project_id;
      const { overwrite_newer } = this.state;
      const { delete_extra_files } = this.state;
      const paths = this.props.checked_files.toArray();
      if (
        destination_project_id != null &&
        this.props.project_id !== destination_project_id
      ) {
        this.props.actions.copy_paths_between_projects({
          public: this.props.public_view,
          src_project_id: this.props.project_id,
          src: paths,
          target_project_id: destination_project_id,
          target_path: destination_directory,
          overwrite_newer,
          delete_missing: delete_extra_files
        });
        analytics_event("project_file_listing", "copy between projects");
      } else {
        this.props.actions.copy_paths({
          src: paths,
          dest: destination_directory
        });
        analytics_event("project_file_listing", "copy within a project");
      }

      return this.props.actions.set_file_action();
    }

    valid_copy_input() {
      const src_path = misc.path_split(this.props.checked_files.first()).head;
      const input = this.state.copy_destination_directory;
      if (
        input === src_path &&
        this.props.project_id === this.state.copy_destination_project_id
      ) {
        return false;
      }
      if (this.state.copy_destination_project_id === "") {
        return false;
      }
      if (input === this.props.current_directory) {
        return false;
      }
      if (misc.startswith(input, "/")) {
        return false;
      }
      return true;
    }

    render_copy() {
      const { size } = this.props.checked_files;
      const signed_in = this.props.get_user_type() === "signed_in";
      if (this.props.public_view && !signed_in) {
        return (
          <div>
            <LoginLink />
            <Row>
              <Col sm={12}>
                <ButtonToolbar>
                  <Button bsStyle="primary" disabled={true}>
                    <Icon name="files-o" /> Copy {size}{" "}
                    {misc.plural(size, "item")}
                  </Button>
                  <Button onClick={this.cancel_action}>Cancel</Button>
                </ButtonToolbar>
              </Col>
            </Row>
          </div>
        );
      } else {
        return (
          <div>
            <Row>
              <Col
                sm={this.state.show_different_project ? 4 : 5}
                style={{ color: "#666" }}
              >
                <h4>
                  Copy to a folder or{" "}
                  {this.state.show_different_project
                    ? "project"
                    : this.different_project_button()}
                </h4>
                {this.render_selected_files_list()}
              </Col>
              {this.render_different_project_dialog()}
              <Col
                sm={this.state.show_different_project ? 4 : 5}
                style={{ color: "#666" }}
              >
                <h4
                  style={
                    !this.state.show_different_project
                      ? { height: "25px" }
                      : undefined
                  }
                >
                  Destination
                </h4>
                <DirectoryInput
                  autoFocus={true}
                  on_change={value =>
                    this.setState({ copy_destination_directory: value })
                  }
                  key="copy_destination_directory"
                  placeholder="Home directory"
                  default_value=""
                  project_id={this.state.copy_destination_project_id}
                  on_key_up={this.action_key}
                />
              </Col>
            </Row>
            <Row>
              <Col sm={12}>
                <ButtonToolbar>
                  <Button
                    bsStyle="primary"
                    onClick={this.copy_click}
                    disabled={!this.valid_copy_input()}
                  >
                    <Icon name="files-o" /> Copy {size}{" "}
                    {misc.plural(size, "Item")}
                  </Button>
                  <Button onClick={this.cancel_action}>Cancel</Button>
                </ButtonToolbar>
              </Col>
            </Row>
          </div>
        );
      }
    }

    submit_action_copy() {
      if (this.valid_copy_input()) {
        return this.copy_click();
      }
    }

    share_click() {
      const description = ReactDOM.findDOMNode(this.refs.share_description)
        .value;
      this.props.actions.set_public_path(this.props.checked_files.first(), {
        description
      });
      return analytics_event("project_file_listing", "share item");
    }

    stop_sharing_click() {
      this.props.actions.disable_public_path(this.props.checked_files.first());
      return analytics_event("project_file_listing", "stop sharing item");
    }

    render_share_warning() {
      return (
        <Alert bsStyle="warning" style={{ wordWrap: "break-word" }}>
          <h4>
            <Icon name="exclamation-triangle" /> Notice!
          </h4>
          <p>This file is in a public folder.</p>
          <p>In order to stop sharing it, you must stop sharing the parent.</p>
        </Alert>
      );
    }

    construct_public_share_url(single_file) {
      let url = document.URL;
      url = url.slice(0, url.indexOf("/projects/"));
      let display_url = `${url}/share/${
        this.props.project_id
      }/${misc.encode_path(single_file)}?viewer=share`;
      if (
        __guard__(
          this.props.file_map[misc.path_split(single_file).tail],
          x => x.isdir
        )
      ) {
        display_url += "/";
      }
      return display_url;
    }

    render_public_link_header(url, as_link) {
      if (as_link) {
        return (
          <h4>
            <a href={url} target="_blank">
              Public link
            </a>
          </h4>
        );
      } else {
        return <h4>Public link (not active)</h4>;
      }
    }

    render_share_defn() {
      return (
        <div style={{ color: "#555" }}>
          <a href={WIKI_SHARE_HELP_URL} target="_blank" rel="noopener">
            Use sharing
          </a>{" "}
          to make a file or directory{" "}
          <a
            href="https://share.cocalc.com/share"
            target="_blank"
            rel="noopener"
          >
            <b>
              <i>visible to the world</i>
            </b>
          </a>
          . Files are automatically copied to{" "}
          <a
            href="https://share.cocalc.com/share"
            target="_blank"
            rel="noopener"
          >
            the share server
          </a>{" "}
          about 30 seconds after you edit them. If you would instead like to
          privately collaborate and chat with people in this project, go to the
          Project Settings tab and "Add new collaborators".
        </div>
      );
    }

    set_public_file_unlisting_to(new_value) {
      const description = ReactDOM.findDOMNode(this.refs.share_description)
        .value;
      return this.props.actions.set_public_path(
        this.props.checked_files.first(),
        { description, unlisted: new_value }
      );
    }

    render_unlisting_checkbox(single_file_data) {
      const is_unlisted = !!(single_file_data.public != null
        ? single_file_data.public.unlisted
        : undefined);

      return (
        <form>
          <Checkbox
            checked={is_unlisted}
            onChange={() => this.set_public_file_unlisting_to(!is_unlisted)}
          >
            <i>Unlisted:</i> Only allow those with a link to view this.
          </Checkbox>
        </form>
      );
    }

    render_share_error() {
      return (
        <Alert
          bsStyle={"danger"}
          style={{ padding: "30px", marginBottom: "30px" }}
        >
          <h3>Publicly sharing files requires internet access</h3>
          <div style={{ fontSize: "12pt" }}>
            You <b>must</b> first enable the 'Internet access' upgrade in
            project settings in order to publicly share files from this project.
          </div>
        </Alert>
      );
    }

    render_how_shared(parent_is_public, single_file_data) {
      if (parent_is_public) {
        return;
      }
      const single_file = this.props.checked_files.first();
      return (
        <div>
          <br />
          <div style={{ color: "#444", fontSize: "15pt" }}>
            Choose how to share {single_file}:
          </div>
          <br />
          {this.render_sharing_options(single_file_data)}
        </div>
      );
    }

    render_share() {
      // currently only works for a single selected file
      let parent_is_public;
      const single_file = this.props.checked_files.first();
      const single_file_data = this.props.file_map[
        misc.path_split(single_file).tail
      ];
      if (single_file_data == null) {
        // directory listing not loaded yet... (will get re-rendered when loaded)
        return <Loading />;
      } else {
        if (
          single_file_data.is_public &&
          (single_file_data.public != null
            ? single_file_data.public.path
            : undefined) !== single_file
        ) {
          parent_is_public = true;
        }
      }
      const show_social_media =
        require("../../customize").commercial && single_file_data.is_public;

      const url = this.construct_public_share_url(single_file);
      const { open_new_tab } = require("smc-webapp/misc_page");
      const button_before = (
        <Button bsStyle="default" onClick={() => open_new_tab(url)}>
          <Icon name="external-link" />
        </Button>
      );

      return (
        <div>
          <Row>
            <Col sm={8} style={{ color: "#666", fontSize: "12pt" }}>
              {this.render_share_defn()}
            </Col>
          </Row>
          <Row>
            <Col sm={12} style={{ fontSize: "12pt" }}>
              {this.render_how_shared(parent_is_public, single_file_data)}
            </Col>
          </Row>
          {!single_file_data.is_public ? (
            undefined
          ) : (
            <>
              <Row>
                <Col sm={4} style={{ color: "#666" }}>
                  <h4>Description</h4>
                  <FormGroup>
                    <FormControl
                      autoFocus={true}
                      ref="share_description"
                      key="share_description"
                      type="text"
                      defaultValue={
                        (single_file_data.public != null
                          ? single_file_data.public.description
                          : undefined) != null
                          ? single_file_data.public != null
                            ? single_file_data.public.description
                            : undefined
                          : ""
                      }
                      disabled={parent_is_public}
                      placeholder="Description..."
                      onKeyUp={this.action_key}
                    />
                  </FormGroup>
                  {parent_is_public ? this.render_share_warning() : undefined}
                </Col>
                <Col sm={4} style={{ color: "#666" }}>
                  <h4>Items</h4>
                  {this.render_selected_files_list()}
                </Col>
                {single_file_data.is_public ? (
                  <Col sm={4} style={{ color: "#666" }}>
                    <h4>Shared publicly</h4>
                    <CopyToClipBoard
                      value={url}
                      button_before={button_before}
                      hide_after={true}
                    />
                  </Col>
                ) : (
                  undefined
                )}
              </Row>
              <Row>
                <Col sm={12}>
                  <Button
                    bsStyle="primary"
                    onClick={this.share_click}
                    disabled={parent_is_public}
                    style={{ marginBottom: "5px" }}
                  >
                    <Icon name="share-square-o" /> Update Description
                  </Button>
                </Col>
              </Row>
            </>
          )}
          <Row>
            <Col sm={12}>
              <Button onClick={this.cancel_action}>Close</Button>
            </Col>
          </Row>
        </div>
      );
    }

    handle_sharing_options_change(single_file_data) {
      return e => {
        // The reason we need single_file_data is because I think "set_public_path" does not
        // merge the "options", so you have to pass in the current description.
        let description;
        const state = e.target.value;
        if (state === "private") {
          return this.props.actions.disable_public_path(
            this.props.checked_files.first()
          );
        } else if (state === "public_listed") {
          // single_file_data.public is suppose to work in this state
          description =
            (single_file_data.public != null
              ? single_file_data.public.description
              : undefined) != null
              ? single_file_data.public != null
                ? single_file_data.public.description
                : undefined
              : "";
          return this.props.actions.set_public_path(
            this.props.checked_files.first(),
            { description, unlisted: false }
          );
        } else if (state === "public_unlisted") {
          description =
            (single_file_data.public != null
              ? single_file_data.public.description
              : undefined) != null
              ? single_file_data.public != null
                ? single_file_data.public.description
                : undefined
              : "";
          return this.props.actions.set_public_path(
            this.props.checked_files.first(),
            { description, unlisted: true }
          );
        }
      };
    }

    get_sharing_options_state(single_file_data) {
      if (
        single_file_data.is_public &&
        (single_file_data.public != null
          ? single_file_data.public.unlisted
          : undefined)
      ) {
        return "public_unlisted";
      }
      if (
        single_file_data.is_public &&
        !(single_file_data.public != null
          ? single_file_data.public.unlisted
          : undefined)
      ) {
        return "public_listed";
      }
      return "private";
    }

    render_sharing_options(single_file_data) {
      const state = this.get_sharing_options_state(single_file_data);
      const handler = this.handle_sharing_options_change(single_file_data);
      return (
        <>
          <FormGroup>
            {__guard__(
              this.props.get_total_project_quotas(this.props.project_id),
              x => x.network
            ) ? (
              <Radio
                name="sharing_options"
                value="public_listed"
                checked={state === "public_listed"}
                onChange={handler}
                inline
              >
                <Icon name="eye" />
                <Space />
                <i>Public (listed)</i> - This will appear on the{" "}
                <a href="https://share.cocalc.com/share" target="_blank">
                  public share server
                </a>
                .
              </Radio>
            ) : (
              <Radio
                disabled={true}
                name="sharing_options"
                value="public_listed"
                checked={state === "public_listed"}
                inline
              >
                <Icon name="eye" />
                <Space />
                <del>
                  <i>Public (listed)</i> - This will appear on the{" "}
                  <a href="https://share.cocalc.com/share" target="_blank">
                    share server
                  </a>
                  .
                </del>{" "}
                Public (listed) is only available for projects with network
                enabled.
              </Radio>
            )}
            <br />
            <Radio
              name="sharing_options"
              value="public_unlisted"
              checked={state === "public_unlisted"}
              onChange={handler}
              inline
            >
              <Icon name="eye-slash" />
              <Space />
              <i>Public (unlisted)</i> - Only people with the link can view
              this.
            </Radio>
            <br />
            <Radio
              name="sharing_options"
              value="private"
              checked={state === "private"}
              onChange={handler}
              inline
            >
              <Icon name="lock" />
              <Space />
              <i>Private</i> - Only collaborators on this project can view this.
            </Radio>
          </FormGroup>
        </>
      );
    }

    render_social_buttons(single_file) {
      // sort like in account settings
      let left;
      const btns = {
        // mapping ID to button title and icon name
        email: ["Email", "envelope"],
        facebook: ["Facebook", "facebook"],
        google: ["Google+", "google-plus"],
        twitter: ["Twitter", "twitter"]
      };
      const strategies =
        (left = __guard__(redux.getStore("account").get("strategies"), x =>
          x.toArray()
        )) != null
          ? left
          : [];
      const _ = require("underscore");
      const btn_keys = _.sortBy(_.keys(btns), function(b) {
        const i = strategies.indexOf(b);
        if (i >= 0) {
          return i;
        } else {
          return btns.length + 1;
        }
      });
      const ret = [];
      for (let b of Array.from(btn_keys)) {
        (b => {
          const [title, icon] = btns[b];
          return ret.push(
            <Button
              onClick={() => this.share_social_network(b, single_file)}
              key={b}
            >
              <Icon name={icon} /> {title}
            </Button>
          );
        })(b);
      }
      return ret;
    }

    share_social_network(where, single_file) {
      let url;
      const { SITE_NAME, TWITTER_HANDLE } = require("smc-util/theme");
      const file_url = this.construct_public_share_url(single_file);
      const public_url = encodeURIComponent(file_url);
      const filename = misc.path_split(single_file).tail;
      const text = encodeURIComponent(`Check out ${filename}`);
      const site_name =
        this.props.site_name != null ? this.props.site_name : SITE_NAME;
      analytics_event("project_file_listing", "share item via", where);
      switch (where) {
        case "facebook":
          // https://developers.facebook.com/docs/sharing/reference/share-dialog
          // 806558949398043 is the ID of "SageMathcloud"
          // TODO CoCalc
          url = `https://www.facebook.com/dialog/share?app_id=806558949398043&display=popup&
href=${public_url}&redirect_uri=https%3A%2F%2Ffacebook.com&quote=${text}`;
          break;
        case "twitter":
          // https://dev.twitter.com/web/tweet-button/web-intent
          url = `https://twitter.com/intent/tweet?text=${text}&url=${public_url}&via=${TWITTER_HANDLE}`;
          break;
        case "google":
          url = `https://plus.google.com/share?url=${public_url}`;
          break;
        case "email":
          url = `mailto:?to=&subject=${filename} on ${site_name}&
body=A file is shared with you: ${public_url}`;
          break;
      }
      if (url != null) {
        const { open_popup_window } = require("./misc_page");
        return open_popup_window(url);
      } else {
        return console.warn(`Unknown social media channel '${where}'`);
      }
    }

    submit_action_share() {
      const single_file = this.props.checked_files.first();
      const single_file_data = this.props.file_map[
        misc.path_split(single_file).tail
      ];
      if (single_file_data != null) {
        if (
          !(
            single_file_data.is_public &&
            (single_file_data.public != null
              ? single_file_data.public.path
              : undefined) !== single_file
          )
        ) {
          return this.share_click();
        }
      }
    }

    download_single_click() {
      this.props.actions.download_file({
        path: this.props.checked_files.first(),
        log: true
      });
      this.props.actions.set_file_action();
      return analytics_event("project_file_listing", "download item");
    }

    download_multiple_click() {
      const destination = ReactDOM.findDOMNode(this.refs.download_archive)
        .value;
      const dest = misc.path_to_file(this.props.current_path, destination);
      this.props.actions.zip_files({
        src: this.props.checked_files.toArray(),
        dest,
        cb: err => {
          if (err) {
            this.props.actions.set_activity({ id: misc.uuid(), error: err });
            return;
          }
          this.props.actions.download_file({
            path: dest,
            log: true
          });
          return this.props.actions.fetch_directory_listing();
        }
      });
      this.props.actions.set_all_files_unchecked();
      this.props.actions.set_file_action();
      return analytics_event("project_file_listing", "download item");
    }

    render_download_single(single_item) {
      const target = this.props.actions.get_store().get_raw_link(single_item);
      return (
        <div>
          <h4>Download link</h4>
          <pre style={pre_style}>
            <a href={target} target="_blank">
              {target}
            </a>
          </pre>
        </div>
      );
    }

    render_download_multiple() {
      return (
        <div>
          <h4>Download as archive</h4>
          <FormGroup>
            <FormControl
              autoFocus={true}
              ref="download_archive"
              key="download_archive"
              type="text"
              defaultValue={account.default_filename("zip")}
              placeholder="Result archive..."
              onKeyDown={this.action_key}
            />
          </FormGroup>
        </div>
      );
    }

    render_download() {
      let download_multiple_files;
      const single_item = this.props.checked_files.first();
      if (
        this.props.checked_files.size !== 1 ||
        __guard__(
          this.props.file_map[misc.path_split(single_item).tail],
          x => x.isdir
        )
      ) {
        download_multiple_files = true;
      }
      return (
        <div>
          <Row>
            <Col sm={5} style={{ color: "#666" }}>
              <h4>Download file(s) to your computer</h4>
              {this.render_selected_files_list()}
            </Col>
            <Col sm={7} style={{ color: "#666" }}>
              {download_multiple_files
                ? this.render_download_multiple()
                : this.render_download_single(single_item)}
            </Col>
          </Row>
          <Row>
            <Col sm={12}>
              <ButtonToolbar>
                <Button
                  bsStyle="primary"
                  onClick={
                    download_multiple_files
                      ? this.download_multiple_click
                      : this.download_single_click
                  }
                >
                  <Icon name="cloud-download" /> Download
                </Button>
                <Button onClick={this.cancel_action}>Cancel</Button>
              </ButtonToolbar>
            </Col>
          </Row>
        </div>
      );
    }

    render_action_box(action: FileAction) {
      switch (action) {
        case "compress":
          return this.render_compress();
        case "delete":
          return this.render_delete();
        case "rename":
          return this.render_rename();
        case "duplicate":
          return this.render_duplicate();
        case "move":
          return this.render_move();
        case "copy":
          return this.render_copy();
        case "share":
          return this.render_share();
        default:
          console.warn("Unknown file action", this.props.file_action);
          return undefined;
      }
    }

    render() {
      const action = this.props.file_action;
      const action_button = file_actions[action];
      if (action_button == null) {
        return <div>Undefined action</div>;
      }
      if (this.props.file_map == null) {
        return <Loading />;
      } else {
        return (
          <Well>
            <Row>
              <Col
                sm={12}
                style={{ color: "#666", fontWeight: "bold", fontSize: "15pt" }}
              >
                <Icon
                  name={
                    action_button.icon != null
                      ? action_button.icon
                      : "exclamation-circle"
                  }
                />{" "}
                {action_button.name}
              </Col>
              <Col sm={12}>{this.render_action_box(action)}</Col>
            </Row>
          </Well>
        );
      }
    }
  }
);

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}
