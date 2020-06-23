/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { Rendered } from "../../../app-framework";
import { Icon } from "../../../r_misc/icon";
import { ProjectActions } from "../../../project_actions";

import { HelpAlert } from "./help-alert";
import { full_path_text } from "./utils";

import { FileTypeSelector } from "../../new";
import { Button, Row, Col } from "react-bootstrap";

import { MainConfiguration } from "../../../project_configuration";

interface Props {
  name: string;
  actions: ProjectActions;
  create_folder: () => void;
  create_file: () => void;
  public_view?: boolean;
  file_search: string;
  current_path?: string;
  project_id: string;
  configuration_main?: MainConfiguration;
}

const row_style: React.CSSProperties = {
  textAlign: "left",
  color: "#888",
  marginTop: "20px",
  wordWrap: "break-word",
};

const create_button_style = {
  fontSize: "40px",
  color: "#888",
  maxWidth: "100%",
};

export class NoFiles extends React.PureComponent<Props> {
  static defaultProps = { file_search: "" };

  handle_click = () => {
    if (this.props.file_search.length === 0) {
      this.props.actions.toggle_new(true);
    } else if (
      this.props.file_search[this.props.file_search.length - 1] === "/"
    ) {
      this.props.create_folder();
    } else {
      this.props.create_file();
    }
  };

  render_create_button(actual_new_filename: string): Rendered {
    let button_text: string;

    if (this.props.file_search.length === 0) {
      button_text = "Create or Upload Files...";
    } else {
      button_text = `Create ${actual_new_filename}`;
    }

    return (
      <Button
        style={create_button_style}
        onClick={(): void => {
          this.handle_click();
        }}
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
          project_id={this.props.project_id}
          create_file={this.props.create_file}
        />
      </div>
    );
  }

  render() {
    if (this.props.configuration_main == null) return null;
    const actual_new_filename =
      this.props.file_search.length === 0
        ? ""
        : full_path_text(
            this.props.file_search,
            this.props.configuration_main.disabled_ext
          );
    return (
      <Row style={row_style}>
        <Col md={12} mdOffset={0} lg={8} lgOffset={2}>
          <span style={{ fontSize: "20px" }}>No files found</span>
          <hr />
          {!this.props.public_view
            ? this.render_create_button(actual_new_filename)
            : undefined}
          <HelpAlert
            file_search={this.props.file_search}
            actual_new_filename={actual_new_filename}
          />
          {this.props.file_search.length > 0
            ? this.render_file_type_selection()
            : undefined}
        </Col>
      </Row>
    );
  }
}
