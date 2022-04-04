/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as misc from "@cocalc/util/misc";

import { React, rtypes, rclass } from "../../app-framework";
import { default_filename } from "../../account";

import {
  Col,
  Row,
  Button,
  ButtonToolbar,
  FormControl,
  FormGroup,
  Alert,
} from "react-bootstrap";

import { ErrorDisplay, Icon, Tip, SettingBox } from "../../components";
import { ProjectActions } from "../../project_actions";

import { special_filenames_with_no_extension } from "../../project-file";
import { FileUpload } from "../../file-upload";
import { NewFileButton } from "./new-file-button";
import { NewFileDropdown } from "./new-file-dropdown";
import { FileTypeSelector } from "./file-type-selector";
import { AvailableFeatures } from "./types";
import { ProjectMap } from "@cocalc/frontend/todo-types";
import { PathNavigator } from "../explorer/path-navigator";

interface ReactProps {
  project_id: string;
  actions: ProjectActions;
  on_close?: () => void;
  on_create_file?: () => void;
  on_create_folder?: () => void;
  show_header?: boolean;
  default_filename?: string;
  name: string;
}

interface ReduxProps {
  current_path: string;
  default_filename: string;
  file_creation_error: string;
  available_features: AvailableFeatures;
  project_map: ProjectMap;
  downloading_file: boolean;
  get_total_project_quotas: (project_id: string) => Record<string, any>;
}

interface State {
  filename: string;
  extension_warning: boolean;
}

export const ProjectNewForm = rclass<ReactProps>(
  class ProjectNewForm extends React.Component<ReactProps & ReduxProps, State> {
    public static reduxProps = ({ name }): any => {
      return {
        [name]: {
          current_path: rtypes.string,
          default_filename: rtypes.string,
          file_creation_error: rtypes.string,
          available_features: rtypes.immutable,
          downloading_file: rtypes.bool,
        },
        projects: {
          project_map: rtypes.immutable,
          get_total_project_quotas: rtypes.func,
        },
      };
    };

    constructor(props) {
      super(props);
      this.state = {
        filename: this.props.default_filename ?? this.default_filename(),
        extension_warning: false,
      };
    }

    static defaultProps = { show_header: true };

    UNSAFE_componentWillReceiveProps(newProps): void {
      if (newProps.default_filename !== this.props.default_filename) {
        this.setState({ filename: newProps.default_filename });
      }
    }

    default_filename = (): string => {
      return default_filename(undefined, this.props.project_id);
    };

    create_file = (ext?: string): void => {
      if (!this.state.filename) {
        return;
      }
      // If state.filename='a.txt', but ext is "sagews", we make the file
      // be called "a.sagews", not "a.txt.sagews":
      const filename_ext = misc.filename_extension(this.state.filename);
      const name =
        filename_ext && ext && filename_ext != ext
          ? this.state.filename.slice(
              0,
              this.state.filename.length - filename_ext.length - 1
            )
          : this.state.filename;
      this.props.actions.create_file({
        name,
        ext,
        current_path: this.props.current_path,
      });
      this.props.on_create_file?.();
    };

    submit = (ext?: string): void => {
      if (!this.state.filename) {
        // empty filename
        return;
      }
      if (
        ext ||
        special_filenames_with_no_extension().indexOf(this.state.filename) > -1
      ) {
        this.create_file(ext);
      } else if (this.state.filename[this.state.filename.length - 1] === "/") {
        this.create_folder();
      } else if (
        misc.filename_extension(this.state.filename) ||
        misc.is_only_downloadable(this.state.filename)
      ) {
        this.create_file();
      } else {
        this.setState({ extension_warning: true });
      }
    };

    submit_via_enter = (e): void => {
      e.preventDefault();
      this.submit();
    };

    private render_close_button(): JSX.Element {
      const on_close = this.props.on_close ?? this.show_files.bind(this);
      return (
        <Button onClick={on_close} className={"pull-right"}>
          Close
        </Button>
      );
    }

    private render_error(): JSX.Element {
      let message;
      const error = this.props.file_creation_error;
      if (error === "not running") {
        message = "The project is not running. Please try again in a moment";
      } else {
        message = error;
      }
      return (
        <ErrorDisplay
          error={message}
          onClose={(): void => {
            this.props.actions.setState({ file_creation_error: "" });
          }}
        />
      );
    }

    private blocked(): string {
      if (this.props.project_map == undefined) {
        return "";
      }
      if (this.props.get_total_project_quotas(this.props.project_id)?.network) {
        return "";
      } else {
        return " (access blocked -- see project settings)";
      }
    }

    private create_folder = (): void => {
      this.props.actions.create_folder({
        name: this.state.filename,
        current_path: this.props.current_path,
        switch_over: true,
      });
      this.props.on_create_folder?.();
    };

    private render_no_extension_alert(): JSX.Element {
      return (
        <Alert
          bsStyle="warning"
          style={{ marginTop: "10px", fontWeight: "bold" }}
        >
          <p>
            Warning: Are you sure you want to create a file with no extension?
            This will use a plain text editor. If you do not want this, click a
            button below to create the corresponding type of file.
          </p>
          <ButtonToolbar style={{ marginTop: "10px" }}>
            <Button
              onClick={(): void => {
                this.create_file();
              }}
              bsStyle="success"
            >
              Yes, please create this file with no extension
            </Button>
            <Button
              onClick={(): void => {
                this.setState({ extension_warning: false });
              }}
              bsStyle="default"
            >
              Cancel
            </Button>
          </ButtonToolbar>
        </Alert>
      );
    }

    private render_close_row(): JSX.Element | undefined {
      return (
        <Row>
          <Col sm={9}>
            <div style={{ color: "#666" }}>
              <em>
                Read about{" "}
                <a
                  href="https://doc.cocalc.com/howto/upload.html"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  other ways to upload files.
                </a>{" "}
                You can also drag & drop files on the file listing.
              </em>
            </div>
          </Col>
          <Col sm={3}>
            <Row>
              <Col sm={12}>{this.render_close_button()}</Col>
            </Row>
          </Col>
        </Row>
      );
    }

    private render_upload(): JSX.Element {
      return (
        <>
          <Row style={{ marginTop: "20px" }}>
            <Col sm={12}>
              <h4>
                <Icon name="cloud-upload" /> Upload
              </h4>
            </Col>
          </Row>
          <Row>
            <Col sm={12}>
              <FileUpload
                dropzone_handler={{
                  complete: (): void => {
                    this.props.actions.fetch_directory_listing();
                  },
                }}
                project_id={this.props.project_id}
                current_path={this.props.current_path}
                show_header={false}
              />
            </Col>
          </Row>
          {this.render_close_row()}
        </>
      );
    }

    private render_create(): JSX.Element {
      let desc: string;
      if (this.state.filename.endsWith("/")) {
        desc = "folder";
      } else if (
        this.state.filename.toLowerCase().startsWith("http:") ||
        this.state.filename.toLowerCase().startsWith("https:")
      ) {
        desc = "download";
      } else {
        const ext = misc.filename_extension(this.state.filename);
        if (ext) {
          desc = `${ext} file`;
        } else {
          desc = "file with no extension";
        }
      }
      return (
        <Tip
          icon="file"
          title={`Create ${desc}`}
          tip={`Create ${desc}.  You can also press return.`}
        >
          <Button
            disabled={this.state.filename.trim() == ""}
            onClick={() => this.submit()}
          >
            Create {desc}
          </Button>
        </Tip>
      );
    }

    private render_more_types(): JSX.Element {
      return (
        <>
          <Tip
            icon="file"
            title="Any Type of File"
            tip="Create a wide range of files, including HTML, Markdown, C/C++ and Java programs, etc."
            placement="top"
          >
            <NewFileDropdown
              create_file={(ext?: string): void => {
                this.submit(ext);
              }}
            />
          </Tip>
        </>
      );
    }

    private render_filename_form(): JSX.Element {
      const onChange = (e): void => {
        if (this.state.extension_warning) {
          this.setState({ extension_warning: false });
        } else {
          this.setState({
            filename: e.target.value,
          });
        }
      };

      const onKey = (e: React.KeyboardEvent<FormControl>): void => {
        if (e.keyCode === 27) {
          this.props.on_close?.();
        }
      };

      return (
        <form
          onSubmit={(e): void => {
            this.submit_via_enter(e);
          }}
        >
          <FormGroup>
            <FormControl
              autoFocus
              value={this.state.filename}
              type={"text"}
              disabled={this.state.extension_warning}
              placeholder={
                "Name your file, folder, or a URL to download from..."
              }
              onChange={onChange}
              onKeyDown={onKey}
            />
          </FormGroup>
        </form>
      );
    }

    private render_title(): JSX.Element | undefined {
      if (this.props.current_path != undefined) {
        return (
          <span>
            Create new files in{" "}
            <PathNavigator
              project_id={this.props.project_id}
              style={{ display: "inline" }}
            />
          </span>
        );
      }
    }

    private show_files(): void {
      this.props.actions.set_active_tab("files");
    }

    render(): JSX.Element {
      //key is so autofocus works below
      return (
        <SettingBox
          show_header={this.props.show_header}
          icon={"plus-circle"}
          title={this.render_title()}
          close={this.props.on_close ?? this.show_files.bind(this)}
        >
          <Row key={this.props.default_filename}>
            <Col sm={12}>
              <div
                style={{
                  color: "#666",
                  paddingBottom: "5px",
                  fontSize: "16px",
                }}
              >
                Name your file, folder or paste in a link. End filename with /
                to make a folder.
              </div>
              <div
                style={{
                  display: "flex",
                  flexFlow: "row wrap",
                  justifyContent: "space-between",
                  alignItems: "stretch",
                }}
              >
                <div
                  style={{
                    flex: "1 0 auto",
                    marginRight: "10px",
                    minWidth: "20em",
                  }}
                >
                  {this.render_filename_form()}
                </div>
                <div style={{ flex: "0 0 auto", marginRight: "10px" }}>
                  {this.render_create()}
                </div>
                <div style={{ flex: "0 0 auto" }}>
                  {this.render_more_types()}
                </div>
              </div>
              {this.state.extension_warning
                ? this.render_no_extension_alert()
                : undefined}
              {this.props.file_creation_error ? this.render_error() : undefined}
              <div
                style={{
                  color: "#666",
                  paddingBottom: "5px",
                  fontSize: "16px",
                }}
              >
                What would you like to create? All documents can be
                simultaneously edited in realtime with your collaborators.
              </div>
              <FileTypeSelector
                create_file={this.submit}
                create_folder={this.create_folder.bind(this)}
                project_id={this.props.project_id}
              >
                <Tip
                  title={"Download files from the Internet"}
                  icon={"cloud"}
                  placement={"bottom"}
                  tip={`Paste a URL into the box above, then click here to download a file from the internet. ${this.blocked()}`}
                >
                  <NewFileButton
                    icon={"cloud"}
                    name={`Download from Internet ${this.blocked()}`}
                    on_click={this.create_file}
                    loading={this.props.downloading_file}
                  />
                </Tip>
              </FileTypeSelector>
            </Col>
          </Row>
          {this.render_upload()}
        </SettingBox>
      );
    }
  }
);
