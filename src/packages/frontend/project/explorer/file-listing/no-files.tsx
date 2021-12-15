/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";
import { CSS, Rendered } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";
import { ProjectActions } from "@cocalc/frontend/project_actions";

import { HelpAlert } from "./help-alert";
import { full_path_text } from "./utils";

import { FileTypeSelector } from "@cocalc/frontend/project/new";
import { Button, Row, Col } from "react-bootstrap";

import { MainConfiguration } from "@cocalc/frontend/project_configuration";

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

const row_style: CSS = {
  textAlign: "left",
  color: "#888",
  marginTop: "20px",
  wordWrap: "break-word",
} as const;

const create_button_style: CSS = {
  fontSize: "40px",
  color: "#888",
  maxWidth: "100%",
} as const;

export const NoFiles: React.FC<Props> = (props: Props) => {
  const {
    actions,
    create_folder,
    create_file,
    public_view,
    file_search = "",
    // current_path,
    project_id,
    configuration_main,
  } = props;

  function handle_click() {
    if (file_search.length === 0) {
      actions.set_active_tab("new");
    } else if (file_search[file_search.length - 1] === "/") {
      create_folder();
    } else {
      create_file();
    }
  }

  function render_create_button(actual_new_filename: string): Rendered {
    let button_text: string;

    if (file_search.length === 0) {
      button_text = "Create or Upload Files...";
    } else {
      button_text = `Create ${actual_new_filename}`;
    }

    return (
      <Button
        style={create_button_style}
        onClick={(): void => {
          handle_click();
        }}
      >
        <Icon name="plus-circle" /> {button_text}
      </Button>
    );
  }

  function render_file_type_selection() {
    return (
      <div style={{ marginTop: "15px" }}>
        <h4 style={{ color: "#666" }}>Or select a file type</h4>
        <FileTypeSelector
          project_id={project_id}
          create_file={create_file}
          create_folder={create_folder}
        />
      </div>
    );
  }

  if (configuration_main == null) return null;
  const actual_new_filename =
    file_search.length === 0
      ? ""
      : full_path_text(file_search, configuration_main.disabled_ext);
  return (
    <Row style={row_style}>
      <Col md={12} mdOffset={0} lg={8} lgOffset={2}>
        <span style={{ fontSize: "20px" }}>No files found</span>
        <hr />
        {!public_view ? render_create_button(actual_new_filename) : undefined}
        <HelpAlert
          file_search={file_search}
          actual_new_filename={actual_new_filename}
        />
        {file_search.length > 0 ? render_file_type_selection() : undefined}
      </Col>
    </Row>
  );
};
