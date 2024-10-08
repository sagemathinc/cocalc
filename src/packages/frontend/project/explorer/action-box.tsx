/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import React from "react";
import * as immutable from "immutable";
import { rtypes, rclass } from "@cocalc/frontend/app-framework";
import { Icon, Loading, LoginLink } from "@cocalc/frontend/components";
import DirectorySelector from "../directory-selector";
import { file_actions, ProjectActions } from "@cocalc/frontend/project_store";
import { SelectProject } from "@cocalc/frontend/projects/select-project";
import { in_snapshot_path } from "../utils";
import ComputeServerTag from "@cocalc/frontend/compute/server-tag";
import * as misc from "@cocalc/util/misc";
import { Button as AntdButton, Radio, Alert as AntdAlert, Space } from "antd";
import {
  Button,
  Col,
  Row,
  Well,
  Alert,
  Checkbox,
} from "@cocalc/frontend/antd-bootstrap";
import SelectServer from "@cocalc/frontend/compute/select-server";
import ConfigureShare from "@cocalc/frontend/share/config";
import CreateArchive from "./create-archive";
import RenameFile from "./rename-file";
import Download from "./download";

export const PRE_STYLE = {
  marginBottom: "15px",
  maxHeight: "80px",
  minHeight: "34px",
  fontSize: "14px",
  fontFamily: "inherit",
  color: "#555",
  backgroundColor: "#eee",
  padding: "6px 12px",
} as const;

type FileAction = undefined | keyof typeof file_actions;

interface ReactProps {
  checked_files: immutable.Set<string>;
  file_action: FileAction;
  current_path: string;
  project_id: string;
  file_map: object;
  actions: ProjectActions;
  displayed_listing?: object;
  new_name?: string;
  name: string;
}

interface ReduxProps {
  site_name?: string;
  get_user_type: () => string;
  get_total_project_quotas: (
    project_id: string,
  ) => { network: boolean } | undefined;
  compute_server_id?: number;
}

interface State {
  copy_destination_directory: string;
  copy_destination_project_id: string;
  copy_from_compute_server_to: "compute-server" | "project";
  move_destination: string;
  new_name?: string;
  show_different_project?: boolean;
  overwrite_newer?: boolean;
  delete_extra_files?: boolean;
  dest_compute_server_id: number;
}

export const ActionBox = rclass<ReactProps>(
  class ActionBox extends React.Component<ReactProps & ReduxProps, State> {
    static reduxProps = ({ name }) => {
      return {
        projects: {
          // get_total_project_quotas relies on this data
          // Will be removed by #1084
          project_map: rtypes.immutable.Map,
          get_total_project_quotas: rtypes.func,
        },
        account: {
          get_user_type: rtypes.func,
        },
        customize: {
          site_name: rtypes.string,
        },
        [name]: {
          compute_server_id: rtypes.number,
        },
      };
    };

    constructor(props) {
      super(props);
      this.state = {
        copy_destination_directory: "",
        copy_destination_project_id: this.props.project_id,
        move_destination: "",
        new_name: this.props.new_name,
        show_different_project: false,
        copy_from_compute_server_to: "compute-server",
        dest_compute_server_id: props.compute_server_id ?? 0,
      };
    }

    cancel_action = (): void => {
      this.props.actions.set_file_action();
    };

    action_key = (e): void => {
      switch (e.keyCode) {
        case 27:
          this.cancel_action();
          break;
        case 13:
          switch (this.props.file_action) {
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
        <pre style={PRE_STYLE}>
          {this.props.checked_files.toArray().map((name) => (
            <div key={name}>{misc.path_split(name).tail}</div>
          ))}
        </pre>
      );
    }

    delete_click = (): void => {
      this.props.actions.delete_files({
        paths: this.props.checked_files.toArray(),
      });
      this.props.actions.set_file_action();
      this.props.actions.set_all_files_unchecked();
      this.props.actions.fetch_directory_listing();
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
              Deleting a file immediately deletes it from the disk{" "}
              {this.props.compute_server_id ? (
                <>on the compute server</>
              ) : (
                <></>
              )}{" "}
              freeing up space.
              {!this.props.compute_server_id && (
                <div>
                  Older backups of your files may still be available in the{" "}
                  <a
                    href=""
                    onClick={(e) => {
                      e.preventDefault();
                      this.props.actions.open_directory(".snapshots");
                    }}
                  >
                    ~/.snapshots
                  </a>{" "}
                  directory.
                </div>
              )}
            </Col>
          </Row>
          <Row>
            <Col sm={12}>
              <Space>
                <AntdButton onClick={this.cancel_action}>Cancel</AntdButton>
                <AntdButton
                  danger
                  onClick={this.delete_click}
                  disabled={this.props.current_path === ".trash"}
                >
                  <Icon name="trash" /> Delete {size}{" "}
                  {misc.plural(size, "Item")}
                </AntdButton>
              </Space>
            </Col>
          </Row>
        </div>
      );
    }

    private filename_length_test(name: string): boolean {
      return name.length > 250;
    }

    private filename_illegal_chars(name: string): string | false {
      if (misc.contains(name, "/")) return "/";
      return false;
    }

    private filename_illegal_extension(name: string): boolean {
      const ext = misc.filename_extension(name);
      return ext !== ext.trim();
    }

    render_rename_warning(): JSX.Element | undefined {
      const initial_ext = misc.filename_extension(
        this.props.checked_files.first(),
      );
      const new_name = this.state.new_name ?? "";
      const current_ext = misc.filename_extension(new_name);
      let message;
      let bsStyle: "warning" | "danger" = "warning";

      const illegal_char = this.filename_illegal_chars(new_name);

      if (this.filename_length_test(new_name)) {
        bsStyle = "danger";
        message = "The filename is too long.";
      } else if (illegal_char) {
        bsStyle = "danger";
        message = `The filename contains the illegal character '${illegal_char}'.`;
      } else if (initial_ext !== current_ext) {
        if (this.filename_illegal_extension(new_name)) {
          bsStyle = "danger";
          message =
            "You're about to add a space character to the start or end of the extension.";
        } else if (initial_ext === "") {
          message = `Are you sure you want to add the extension ${current_ext}?`;
        } else if (current_ext === "") {
          message = `Are you sure you want to remove the extension ${initial_ext}?`;
        } else {
          message = `Are you sure you want to change the file extension from ${initial_ext} to ${current_ext}?`;
        }
      } else {
        return; // no warning or error
      }
      return (
        <AntdAlert
          type="warning"
          style={{ wordWrap: "break-word", marginTop: "15px" }}
          showIcon
          message={<>Warning</>}
          description={
            <>
              <p>{message}</p>
              {bsStyle === "danger" ? (
                <p>This is not allowed.</p>
              ) : (
                <p>This may cause your file to no longer open properly.</p>
              )}
            </>
          }
        />
      );
    }

    valid_rename_input = (single_item: string): boolean => {
      if (this.state.new_name == null) return false;
      if (
        this.filename_length_test(this.state.new_name) ||
        this.filename_illegal_chars(this.state.new_name) ||
        this.filename_illegal_extension(this.state.new_name)
      ) {
        return false;
      }
      return this.state.new_name.trim() !== misc.path_split(single_item).tail;
    };

    move_click = (): void => {
      this.props.actions.move_files({
        src: this.props.checked_files.toArray(),
        dest: this.state.move_destination,
      });
      this.props.actions.set_file_action();
      this.props.actions.set_all_files_unchecked();
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
              <h4>Move files to a directory</h4>
              {this.render_selected_files_list()}
              <Space>
                <Button onClick={this.cancel_action}>Cancel</Button>
                <AntdButton
                  type="primary"
                  onClick={this.move_click}
                  disabled={!this.valid_move_input()}
                >
                  Move {size} {misc.plural(size, "Item")}
                </AntdButton>
              </Space>
            </Col>
            <Col sm={5} style={{ color: "#666", marginBottom: "15px" }}>
              <h4>
                Destination:{" "}
                {this.state.move_destination == ""
                  ? "Home directory"
                  : this.state.move_destination}
              </h4>
              <DirectorySelector
                title="Select Move Destination Folder"
                key="move_destination"
                onSelect={(move_destination: string) =>
                  this.setState({ move_destination })
                }
                project_id={this.props.project_id}
                startingPath={this.props.current_path}
                isExcluded={(path) => this.props.checked_files.has(path)}
                style={{ width: "100%" }}
                bodyStyle={{ maxHeight: "250px" }}
              />
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
        return (
          <Col sm={4} style={{ color: "#666", marginBottom: "15px" }}>
            <h4>Target Project</h4>
            <SelectProject
              at_top={[this.props.project_id]}
              value={this.state.copy_destination_project_id}
              onChange={(copy_destination_project_id) =>
                this.setState({ copy_destination_project_id })
              }
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
              onChange={(e) =>
                this.setState({ delete_extra_files: (e.target as any).checked })
              }
            >
              Delete extra files in target directory
            </Checkbox>
            <Checkbox
              onChange={(e) =>
                this.setState({ overwrite_newer: (e.target as any).checked })
              }
            >
              Overwrite newer versions of files
            </Checkbox>
          </div>
        );
      }
    }

    getDestinationComputeServerId = () => {
      return this.state.copy_from_compute_server_to == "compute-server"
        ? this.props.compute_server_id
        : 0;
    };

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
          public: false,
          src_project_id: this.props.project_id,
          src: paths,
          target_project_id: destination_project_id,
          target_path: destination_directory,
          overwrite_newer,
          delete_missing: delete_extra_files,
        });
      } else {
        if (this.props.compute_server_id) {
          this.props.actions.copy_paths({
            src: paths,
            dest: destination_directory,
            src_compute_server_id: this.props.compute_server_id,
            dest_compute_server_id: this.getDestinationComputeServerId(),
          });
        } else {
          this.props.actions.copy_paths({
            src: paths,
            dest: destination_directory,
            src_compute_server_id: 0,
            dest_compute_server_id: this.state.dest_compute_server_id,
          });
        }
      }

      this.props.actions.set_file_action();
    };

    valid_copy_input(): boolean {
      const src_path = misc.path_split(this.props.checked_files.first()).head;
      const input = this.state.copy_destination_directory;

      const src_compute_server_id = this.props.compute_server_id ?? 0;
      const dest_compute_server_id = this.getDestinationComputeServerId();

      if (
        input === src_path &&
        this.props.project_id === this.state.copy_destination_project_id &&
        src_compute_server_id == dest_compute_server_id
      ) {
        return false;
      }
      if (this.state.copy_destination_project_id === "") {
        return false;
      }
      if (
        input === this.props.current_path &&
        this.props.project_id === this.state.copy_destination_project_id &&
        src_compute_server_id == dest_compute_server_id
      ) {
        return false;
      }
      if (misc.startswith(input, "/")) {
        return false;
      }
      return true;
    }

    render_copy_description() {
      for (const path of this.props.checked_files) {
        if (in_snapshot_path(path)) {
          return (
            <>
              <h4>Restore files from backup</h4>
              {this.render_selected_files_list()}
            </>
          );
        }
      }
      return (
        <>
          {!this.props.compute_server_id ? (
            <div style={{ display: "flex" }}>
              <h4>Items </h4>

              <div style={{ flex: 1, textAlign: "right" }}>
                <AntdButton
                  onClick={() => {
                    const show_different_project =
                      !this.state.show_different_project;
                    this.setState({
                      show_different_project,
                    });
                    if (show_different_project) {
                      this.setState({ dest_compute_server_id: 0 });
                    }
                  }}
                >
                  {this.state.show_different_project
                    ? "Copy to this project..."
                    : "Copy to a different project..."}
                </AntdButton>
              </div>
            </div>
          ) : (
            <h4>
              <div style={{ display: "inline-block", marginRight: "15px" }}>
                Copy to{" "}
              </div>
              <Radio.Group
                optionType="button"
                buttonStyle="solid"
                value={this.state.copy_from_compute_server_to}
                onChange={(e) => {
                  this.setState({
                    copy_from_compute_server_to: e.target.value,
                  });
                }}
                options={[
                  { label: "Compute Server", value: "compute-server" },
                  { label: "Project", value: "project" },
                ]}
              />
            </h4>
          )}
          <div>{this.render_selected_files_list()}</div>
        </>
      );
    }

    render_copy(): JSX.Element {
      const { size } = this.props.checked_files;
      const signed_in = this.props.get_user_type() === "signed_in";
      if (!signed_in) {
        return (
          <div>
            <LoginLink />
            <Row>
              <Col sm={12}>
                <Space>
                  <Button onClick={this.cancel_action}>Cancel</Button>
                  <Button bsStyle="primary" disabled={true}>
                    <Icon name="files" /> Copy {size}{" "}
                    {misc.plural(size, "item")}
                  </Button>
                </Space>
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
                {this.render_copy_description()}
                <Space>
                  <AntdButton onClick={this.cancel_action}>Cancel</AntdButton>
                  <AntdButton
                    type="primary"
                    onClick={this.copy_click}
                    disabled={!this.valid_copy_input()}
                  >
                    <Icon name="files" /> Copy {size}{" "}
                    {misc.plural(size, "Item")}
                  </AntdButton>
                </Space>
              </Col>
              {this.render_different_project_dialog()}
              <Col
                sm={this.state.show_different_project ? 4 : 5}
                style={{ color: "#666" }}
              >
                <h4
                  style={
                    !this.state.show_different_project
                      ? { minHeight: "25px" }
                      : undefined
                  }
                >
                  Destination:{" "}
                  {this.state.copy_destination_directory == ""
                    ? "Home Directory"
                    : this.state.copy_destination_directory}
                </h4>
                <DirectorySelector
                  title={
                    this.props.compute_server_id ? (
                      `Destination ${
                        this.state.copy_from_compute_server_to ==
                        "compute-server"
                          ? "on the Compute Server"
                          : "in the Project"
                      }`
                    ) : (
                      <div style={{ display: "flex" }}>
                        Destination{" "}
                        {this.props.compute_server_id == 0 &&
                          !this.state.show_different_project && (
                            <div style={{ flex: 1, textAlign: "right" }}>
                              <SelectServer
                                project_id={this.props.project_id}
                                value={this.state.dest_compute_server_id}
                                setValue={(dest_compute_server_id) =>
                                  this.setState({ dest_compute_server_id })
                                }
                              />
                            </div>
                          )}
                      </div>
                    )
                  }
                  onSelect={(value: string) =>
                    this.setState({ copy_destination_directory: value })
                  }
                  key="copy_destination_directory"
                  startingPath={this.props.current_path}
                  project_id={this.state.copy_destination_project_id}
                  style={{ width: "100%" }}
                  bodyStyle={{ maxHeight: "250px" }}
                  compute_server_id={
                    this.props.compute_server_id
                      ? this.state.copy_from_compute_server_to ==
                        "compute-server"
                        ? this.props.compute_server_id
                        : 0
                      : this.state.dest_compute_server_id
                  }
                />
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
      const path: string = this.props.checked_files.first() ?? "";
      if (!path) {
        return <></>;
      }
      const public_data = this.props.file_map[misc.path_split(path).tail];
      if (public_data == undefined) {
        // directory listing not loaded yet... (will get re-rendered when loaded)
        return <Loading />;
      }
      const total_quotas = this.props.get_total_project_quotas(
        this.props.project_id,
      ) || { network: undefined };
      return (
        <ConfigureShare
          project_id={this.props.project_id}
          path={path}
          compute_server_id={this.props.compute_server_id}
          isdir={public_data.isdir}
          size={public_data.size}
          mtime={public_data.mtime}
          is_public={public_data.is_public}
          public={public_data.public}
          close={this.cancel_action}
          action_key={this.action_key}
          set_public_path={(opts) =>
            this.props.actions.set_public_path(path, opts)
          }
          has_network_access={total_quotas.network}
        />
      );
    }

    render_action_box(action: FileAction): JSX.Element | undefined {
      switch (action) {
        case "compress":
          return <CreateArchive />;
        case "copy":
          return this.render_copy();
        case "delete":
          return this.render_delete();
        case "download":
          return <Download />;
        case "rename":
          return <RenameFile />;
        case "duplicate":
          return <RenameFile duplicate />;
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
          <Well
            style={{
              margin: "15px 30px",
              overflowY: "auto",
              maxHeight: "50vh",
              backgroundColor: "#fafafa",
            }}
          >
            <Row>
              <Col
                sm={12}
                style={{ color: "#666", fontWeight: "bold", fontSize: "15pt" }}
              >
                <Icon name={action_button.icon ?? "exclamation-circle"} />{" "}
                {action_button.name}
                <div style={{ float: "right" }}>
                  <AntdButton
                    onClick={this.cancel_action.bind(this)}
                    type="text"
                  >
                    <Icon name="times" />
                  </AntdButton>
                </div>
                {!!this.props.compute_server_id && (
                  <ComputeServerTag
                    id={this.props.compute_server_id}
                    style={{ float: "right", top: "5px" }}
                  />
                )}
              </Col>
              <Col sm={12}>{this.render_action_box(action)}</Col>
            </Row>
          </Well>
        );
      }
    }
  },
);
