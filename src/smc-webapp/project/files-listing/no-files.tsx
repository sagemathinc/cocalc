import * as React from "react";

import { analytics_event } from "../../tracker";
import { Icon } from "../../r_misc/icon";
import { ProjectActions } from "../../project_actions"

import { HelpAlert } from "./help-alert";
import { full_path_text } from "./utils";

const { FileTypeSelector } = require("../../project_new");
const { Button, Row, Col } = require("react-bootstrap");

interface Props {
  actions: ProjectActions;
  create_folder: () => void;
  create_file: () => void;
  public_view?: boolean;
  file_search: string;
  current_path?: string;
}

export class NoFiles extends React.PureComponent<Props> {
  static defaultProps = { file_search: "" };

  handle_click = () => {
    if (this.props.file_search.length === 0) {
      this.props.actions.toggle_new(true);
      analytics_event("project_file_listing", "listing_create_button", "empty");
    } else if (
      this.props.file_search[this.props.file_search.length - 1] === "/"
    ) {
      this.props.create_folder();
      analytics_event(
        "project_file_listing",
        "listing_create_button",
        "folder"
      );
    } else {
      this.props.create_file();
      analytics_event("project_file_listing", "listing_create_button", "file");
    }
  }

  render_create_button() {
    let button_text: string;

    if (this.props.file_search.length === 0) {
      button_text = "Create or Upload Files...";
    } else {
      button_text = `Create ${full_path_text(this.props.file_search)}`;
    }

    return (
      <Button
        style={{ fontSize: "40px", color: "#888", maxWidth: "100%" }}
        onClick={() => this.handle_click()}
      >
        <Icon name="plus-circle" /> {button_text}
      </Button>
    );
  }

  render_file_type_selection() {
    return (
      <div>
        <h4 style={{ color: "#666" }}>Or select a file type</h4>
        <FileTypeSelector
          create_file={this.props.create_file}
          create_folder={this.props.create_folder}
        />
      </div>
    );
  }

  render() {
    return (
      <Row
        style={{
          textAlign: "left",
          color: "#888",
          marginTop: "20px",
          wordWrap: "break-word"
        }}
      >
        <Col md={12} mdOffset={0} lg={8} lgOffset={2}>
          <span style={{ fontSize: "20px" }}>No files found</span>
          <hr />
          {!this.props.public_view ? this.render_create_button() : undefined}
          <HelpAlert file_search={this.props.file_search} />
          {this.props.file_search.length > 0
            ? this.render_file_type_selection()
            : undefined}
        </Col>
      </Row>
    );
  }
}
