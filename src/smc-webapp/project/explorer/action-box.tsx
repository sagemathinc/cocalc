import * as React from "react";
import * as ReactDOM from "react-dom";
import * as immutable from "immutable";

import { rtypes, rclass } from "../../app-framework";
import { DirectoryInput, Icon, Loading, LoginLink } from "../../r_misc";
import { analytics_event } from "../../tracker";
import { file_actions, ProjectActions } from "../../project_store";
const misc = require("smc-util/misc");
const {
  Button,
  ButtonToolbar,
  Col,
  Row,
  Well,
  FormControl,
  FormGroup,
  Alert,
  Checkbox
} = require("react-bootstrap");
const account = require("../../account");

const ConfigureShare = require("../../share/config/config").Configure;

// TODO: delete this when the combobox is in r_misc
const Combobox = require("react-widgets/lib/Combobox");

type FileAction = undefined | keyof typeof file_actions;

interface ReactProps {
  checked_files: immutable.Set<string>;
  file_action: FileAction;
  current_path: string;
  project_id: string;
  public_view?: boolean;
  file_map: object;
  actions: ProjectActions;
  displayed_listing?: object;
  new_name?: string;
}

interface ReduxProps {
  site_name?: string;
  get_user_type: () => string;
  get_total_project_quotas: (
    project_id: string
  ) => { network: boolean } | undefined;
  get_project_select_list: (project_id: string) => any;
}

interface State {
  copy_destination_directory: string;
  copy_destination_project_id: string;
  move_destination: "";
  new_name?: string;
  show_different_project?: boolean;

  overwrite_newer?: boolean;
  delete_extra_files?: boolean;
}

export const ActionBox = rclass<ReactProps>(
  class ActionBox extends React.Component<ReactProps & ReduxProps, State> {
    private pre_styles: React.CSSProperties;

    static reduxProps = () => {
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
      this.pre_styles = {
        marginBottom: "15px",
        maxHeight: "80px",
        minHeight: "34px",
        fontSize: "14px",
        fontFamily: "inherit",
        color: "#555",
        backgroundColor: "#eee",
        padding: "6px 12px"
      } as const;
    }

    cancel_action = (): void => {
      this.props.actions.set_file_action();
    };

    action_key = (e: React.KeyboardEvent): void => {
      switch (e.keyCode) {
        case 27:
          this.cancel_action();
          break;
        case 13:
          switch (this.props.file_action) {
            case "compress":
              this.compress_click();
              break;
            case "rename":
            case "duplicate":
              this.submit_action_rename();
              break;
            case "move":
              this.submit_action_move();
              break;
            case "copy":
              this.submit_action_copy();
              break;
          }
      }
    };

    render_selected_files_list(): JSX.Element {
      return (
        <pre style={this.pre_styles}>
          {this.props.checked_files.toArray().map(name => (
            <div key={name}>{misc.path_split(name).tail}</div>
          ))}
        </pre>
      );
    }

    compress_click = (): void => {
      const destination = (ReactDOM.findDOMNode(
        this.refs.result_archive
      ) as any).value;
      this.props.actions.zip_files({
        src: this.props.checked_files.toArray(),
        dest: misc.path_to_file(this.props.current_path, destination)
      });
      this.props.actions.set_all_files_unchecked();
      this.props.actions.set_file_action();
      analytics_event("project_file_listing", "compress item");
    };

    render_compress = (): JSX.Element => {
      const { size } = this.props.checked_files;
      return (
        <div>
          <Row>
            <Col sm={5} style={{ color: "#666" }}>
              <h4>Create a zip file</h4>
              {this.render_selected_files_list()}
            </Col>

            <Col sm={5} style={{ color: "#666" }}>
              <h4>Result archive</h4>
              <FormGroup>
                <FormControl
                  autoFocus={true}
                  ref="result_archive"
                  key="result_archive"
                  type="text"
                  defaultValue={account.default_filename(
                    "zip",
                    this.props.project_id
                  )}
                  placeholder="Result archive..."
                  onKeyDown={this.action_key}
                />
              </FormGroup>
            </Col>
          </Row>
          <Row>
            <Col sm={12}>
              <ButtonToolbar>
                <Button bsStyle="warning" onClick={this.compress_click}>
                  <Icon name="compress" /> Compress {size}{" "}
                  {misc.plural(size, "Item")}
                </Button>
                <Button onClick={this.cancel_action}>Cancel</Button>
              </ButtonToolbar>
            </Col>
          </Row>
        </div>
      );
    };

    delete_click = (): void => {
      this.props.actions.delete_files({
        paths: this.props.checked_files.toArray()
      });
      this.props.actions.set_file_action();
      this.props.actions.set_all_files_unchecked();
      this.props.actions.fetch_directory_listing();
      analytics_event("project_file_listing", "delete item");
    };

    render_delete_warning(): JSX.Element | undefined {
      if (this.props.current_path === ".trash") {
        return (
          <Col sm={5}>
            <Alert bsStyle="danger">
              <h4>
                <Icon name="exclamation-triangle" /> Notice
              </h4>
              <p>Your files have already been moved to the trash.</p>
            </Alert>
          </Col>
        );
      }
    }

    render_delete(): JSX.Element | undefined {
      const { size } = this.props.checked_files;
      return (
        <div>
          <Row>
            <Col sm={5} style={{ color: "#666" }}>
              {this.render_selected_files_list()}
            </Col>
            {this.render_delete_warning()}
          </Row>
          <Row style={{ marginBottom: "10px" }}>
            <Col sm={12}>
              Deleting a file immediately deletes it from disk freeing up space;
              however, older backups of your files may still be available in the{" "}
              <a
                href=""
                onClick={e => {
                  e.preventDefault();
                  this.props.actions.open_directory(".snapshots");
                }}
              >
                ~/.snapshots
              </a>{" "}
              directory.
            </Col>
          </Row>
          <Row>
            <Col sm={12}>
              <ButtonToolbar>
                <Button
                  bsStyle="danger"
                  onClick={this.delete_click}
                  disabled={this.props.current_path === ".trash"}
                >
                  <Icon name="trash-o" /> Delete {size}{" "}
                  {misc.plural(size, "Item")}
                </Button>
                <Button onClick={this.cancel_action}>Cancel</Button>
              </ButtonToolbar>
            </Col>
          </Row>
        </div>
      );
    }

    rename_or_duplicate_click(): void {
      const rename_dir = misc.path_split(
        this.props.checked_files != null
          ? this.props.checked_files.first()
          : undefined
      ).head;
      const destination = (ReactDOM.findDOMNode(this.refs.new_name) as any)
        .value;
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
      this.props.actions.set_all_files_unchecked();
    }

    render_rename_warning(): JSX.Element | undefined {
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

    valid_rename_input = (single_item: string): boolean => {
      if (
        (this.state.new_name as any).length > 250 ||
        misc.contains(this.state.new_name, "/")
      ) {
        return false;
      }
      return (
        (this.state.new_name as any).trim() !==
        misc.path_split(single_item).tail
      );
    };

    render_rename_or_duplicate(): JSX.Element {
      let action_title, first_heading;
      const single_item = this.props.checked_files.first("");
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
                      new_name: (ReactDOM.findDOMNode(
                        this.refs.new_name
                      ) as any).value
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

    submit_action_rename = (): void => {
      const single_item = this.props.checked_files.first("");
      if (this.valid_rename_input(single_item)) {
        this.rename_or_duplicate_click();
      }
    };

    move_click = (): void => {
      this.props.actions.move_files({
        src: this.props.checked_files.toArray(),
        dest: this.state.move_destination,
        dest_is_folder: true,
        include_chats: true
      });
      this.props.actions.set_file_action();
      this.props.actions.set_all_files_unchecked();
      analytics_event("project_file_listing", "move item");
    };

    valid_move_input = (): boolean => {
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
    };

    render_move(): JSX.Element {
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

    submit_action_move(): void {
      if (this.valid_move_input()) {
        this.move_click();
      }
    }

    render_different_project_dialog(): JSX.Element | undefined {
      if (this.state.show_different_project) {
        const data = this.props.get_project_select_list(this.props.project_id);
        if (data == undefined) {
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

    render_copy_different_project_options(): JSX.Element | undefined {
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

    different_project_button(): JSX.Element {
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

    copy_click = (): void => {
      const destination_directory = this.state.copy_destination_directory;
      const destination_project_id = this.state.copy_destination_project_id;
      const { overwrite_newer } = this.state;
      const { delete_extra_files } = this.state;
      const paths = this.props.checked_files.toArray();
      if (
        destination_project_id != undefined &&
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

      this.props.actions.set_file_action();
    };

    valid_copy_input(): boolean {
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
      if (
        input === this.props.current_path &&
        this.props.project_id === this.state.copy_destination_project_id
      ) {
        return false;
      }
      if (misc.startswith(input, "/")) {
        return false;
      }
      return true;
    }

    render_copy(): JSX.Element {
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

    submit_action_copy(): void {
      if (this.valid_copy_input()) {
        this.copy_click();
      }
    }

    render_share(): JSX.Element {
      // currently only works for a single selected file
      const path = this.props.checked_files.first();
      const public_data = this.props.file_map[misc.path_split(path).tail];
      if (public_data == undefined) {
        // directory listing not loaded yet... (will get re-rendered when loaded)
        return <Loading />;
      }
      const total_quotas = this.props.get_total_project_quotas(
        this.props.project_id
      ) || { network: undefined };
      return (
        <ConfigureShare
          project_id={this.props.project_id}
          path={path}
          isdir={public_data.isdir}
          size={public_data.size}
          mtime={public_data.mtime}
          is_public={public_data.is_public}
          public={public_data.public}
          close={this.cancel_action}
          action_key={this.action_key}
          set_public_path={opts =>
            this.props.actions.set_public_path(path, opts)
          }
          has_network_access={total_quotas.network}
        />
      );
    }

    download_single_click = (): void => {
      this.props.actions.download_file({
        path: this.props.checked_files.first(),
        log: true
      });
      this.props.actions.set_file_action();
      analytics_event("project_file_listing", "download item");
    };

    download_multiple_click = (): void => {
      const destination = (ReactDOM.findDOMNode(
        this.refs.download_archive
      ) as any).value;
      const dest = misc.path_to_file(this.props.current_path, destination);
      const files = this.props.checked_files.toArray();
      this.props.actions.zip_files({
        src: files,
        dest,
        cb: err => {
          if (err) {
            this.props.actions.set_activity({ id: misc.uuid(), error: err });
            return;
          }
          this.props.actions.download_file({
            path: dest,
            log: files
          });
          this.props.actions.fetch_directory_listing();
        }
      });
      this.props.actions.set_all_files_unchecked();
      this.props.actions.set_file_action();
      analytics_event("project_file_listing", "download item");
    };

    render_download_single(single_item: string): JSX.Element {
      const target = (this.props.actions.get_store() as any).get_raw_link(
        single_item
      );
      return (
        <div>
          <h4>Download link</h4>
          <pre style={this.pre_styles}>
            <a href={target} target="_blank">
              {target}
            </a>
          </pre>
        </div>
      );
    }

    render_download_multiple(): JSX.Element {
      return (
        <div>
          <h4>Download as archive</h4>
          <FormGroup>
            <FormControl
              autoFocus={true}
              ref="download_archive"
              key="download_archive"
              type="text"
              defaultValue={account.default_filename(
                "zip",
                this.props.project_id
              )}
              placeholder="Result archive..."
              onKeyDown={this.action_key}
            />
          </FormGroup>
        </div>
      );
    }

    render_download(): JSX.Element {
      let download_multiple_files;
      const single_item = this.props.checked_files.first("");
      const listing_item = this.props.file_map[
        misc.path_split(single_item).tail
      ] || { isdir: undefined };
      if (this.props.checked_files.size !== 1 || listing_item.isdir) {
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

    render_action_box(action: FileAction): JSX.Element | undefined {
      switch (action) {
        case "compress":
          return this.render_compress();
        case "copy":
          return this.render_copy();
        case "delete":
          return this.render_delete();
        case "download":
          return this.render_download();
        case "rename":
        case "duplicate":
          return this.render_rename_or_duplicate();
        case "move":
          return this.render_move();
        case "share":
          return this.render_share();
        default:
          return undefined;
      }
    }

    render(): JSX.Element {
      const action = this.props.file_action;
      const action_button = file_actions[action || "undefined"];
      if (action_button == undefined) {
        return <div>Undefined action</div>;
      }
      if (this.props.file_map == undefined) {
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
                    action_button.icon != undefined
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
