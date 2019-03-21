import * as React from "react";
import * as immutable from "immutable";
import { ProjectActions } from "../../project_actions";

import { DifferentProjectButton } from "./different-project-button";
import { valid_copy_destination } from "./utils";
import { DifferentProjectDialog } from "./different-project-dialog";

const { Col, Row, ButtonToolbar, Button } = require("react-bootstrap");
const misc = require("smc-util/misc");
const { DirectoryInput, Icon, LoginLink } = require("../../r_misc");
const { analytics_event } = require("../../tracker");

interface Props {
  actions: ProjectActions;
  checked_files: immutable.Set<string>;
  get_user_type;
  public_view;
  on_cancel;
  items_display;
  project_id: string;
  current_path: string;
  get_project_select_list;
}

interface State {
  show_different_project: boolean;
  copy_destination_directory: string;
  copy_destination_project_id: string;
  overwrite_newer: boolean;
  delete_extra_files: boolean;
}

export class Copy extends React.Component<Props, State> {
  constructor(props) {
    super(props);
    this.state = {
      show_different_project: !!props.public_view,
      copy_destination_directory: "",
      copy_destination_project_id: this.props.public_view
        ? ""
        : this.props.project_id,
      overwrite_newer: false,
      delete_extra_files: false
    };
  }

  on_keydown = e => {
    switch (e.keyCode) {
      case 27:
        this.props.on_cancel();
      case 13:
        this.copy();
    }
  };

  on_copy_click = e => {
    console.log(e);
  };

  on_different_project_button_click = e => {
    console.log(e);
  };

  copy = () => {
    if (
      !valid_copy_destination({
        checked_files: this.props.checked_files,
        destination_path: this.state.copy_destination_directory,
        destination_project_id: this.state.copy_destination_project_id,
        src_project_id: this.props.project_id,
        current_path: this.props.current_path
      })
    ) {
      return;
    }
    const destination_directory = this.state.copy_destination_directory;
    const destination_project_id = this.state.copy_destination_project_id;
    const { overwrite_newer, delete_extra_files } = this.state;
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
  };

  render() {
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
                <Button onClick={this.props.on_cancel}>Cancel</Button>
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
                {this.state.show_different_project ? (
                  "project"
                ) : (
                  <DifferentProjectButton
                    on_click={this.on_different_project_button_click}
                  />
                )}
              </h4>
              {this.props.items_display}
            </Col>
            {this.state.show_different_project && (
              <DifferentProjectDialog
                get_project_select_list={this.props.get_project_select_list}
                project_id={this.props.project_id}
                public_view={this.props.public_view}
                copy_destination_project_id={
                  this.state.copy_destination_project_id
                }
                on_select={value =>
                  this.setState({ copy_destination_project_id: value.id })
                }
                on_check_delete_extra={e =>
                  this.setState({ delete_extra_files: e.target.checked })
                }
                on_check_overwrite_newer={e =>
                  this.setState({ overwrite_newer: e.target.checked })
                }
              />
            )}
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
                on_key_up={this.on_keydown}
              />
            </Col>
          </Row>
          <Row>
            <Col sm={12}>
              <ButtonToolbar>
                <Button
                  bsStyle="primary"
                  onClick={this.on_copy_click}
                  disabled={
                    !valid_copy_destination({
                      checked_files: this.props.checked_files,
                      destination_path: this.state.copy_destination_directory,
                      destination_project_id: this.state
                        .copy_destination_project_id,
                      src_project_id: this.props.project_id,
                      current_path: this.props.current_path
                    })
                  }
                >
                  <Icon name="files-o" /> Copy {size}{" "}
                  {misc.plural(size, "Item")}
                </Button>
                <Button onClick={this.props.on_cancel}>Cancel</Button>
              </ButtonToolbar>
            </Col>
          </Row>
        </div>
      );
    }
  }
}
