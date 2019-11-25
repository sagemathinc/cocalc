/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS104: Avoid inline assignments
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
//#############################################################################
//
//    CoCalc: Collaborative Calculation in the Cloud
//
//    Copyright (C) 2016, Sagemath Inc.
//
//    This program is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.
//
//    This program is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with this program.  If not, see <http://www.gnu.org/licenses/>.
//
//##############################################################################
import * as misc from "smc-util/misc";

import { React, ReactDOM, rtypes, rclass, Fragment } from "../../app-framework";

import {
  Col,
  Row,
  Button,
  ButtonToolbar,
  FormControl,
  FormGroup,
  Alert
} from "react-bootstrap";

import { ErrorDisplay, Icon, Tip, SettingBox } from "../../r_misc";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { special_filenames_with_no_extension } = require("../../project_file");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { SMC_Dropzone } = require("../../smc-dropzone");
import { JupyterServerPanel } from "../plain-jupyter-server";
import { JupyterLabServerPanel } from "../jupyterlab-server";

import { PathLink } from "./path-link";
import { NewFileButton } from "./new-file-button";
import { NewFileDropdown } from "./new-file-dropdown";

// Use Rows and Cols to append more buttons to this class.
// Could be changed to auto adjust to a list of pre-defined button names.
export const FileTypeSelector = rclass(function({ name }) {
  return {
    displayName: "ProjectNew-FileTypeSelector",

    reduxProps: {
      [name]: {
        available_features: rtypes.immutable
      }
    },

    propTypes: {
      create_file: rtypes.func, //.required # commented, causes an exception upon init
      create_folder: rtypes.func, //.required
      styles: rtypes.object,
      project_id: rtypes.string
    },

    getInitialState() {
      return {
        show_jupyter_server_panel: false,
        show_jupyterlab_server_panel: false
      };
    },

    render() {
      let left;
      if (
        !this.props.create_file ||
        !this.props.create_file ||
        !this.props.project_id
      ) {
        return null;
      }

      const row_style = { marginBottom: "8px" };

      // why is available_features immutable?
      const available =
        (left = __guardMethod__(this.props.available_features, "toJS", o => {
          return o.toJS();
        })) != null
          ? left
          : {};

      // console.log("FileTypeSelector: available", available)

      return (
        <Fragment>
          <Row style={row_style}>
            <Col sm={12}>
              {available.sage ? (
                <Tip
                  icon="cc-icon-sagemath-bold"
                  title="Sage worksheet"
                  tip="Create an interactive worksheet for using the SageMath mathematical software, R, and many other systems.  Do sophisticated mathematics, draw plots, compute integrals, work with matrices, etc."
                >
                  <NewFileButton
                    icon="cc-icon-sagemath-bold"
                    name="Sage worksheet"
                    on_click={this.props.create_file}
                    ext="sagews"
                  />
                </Tip>
              ) : (
                undefined
              )}
              {available.jupyter_notebook ? (
                <Tip
                  icon="cc-icon-jupyter"
                  title="Jupyter notebook"
                  tip="Create an interactive notebook for using Python, Julia, R and more."
                >
                  <NewFileButton
                    icon="cc-icon-jupyter"
                    name="Jupyter notebook"
                    on_click={this.props.create_file}
                    ext={"ipynb"}
                  />
                </Tip>
              ) : (
                undefined
              )}
              {available.latex ? (
                <Tip
                  title="LaTeX Document"
                  icon="cc-icon-tex-file"
                  tip="Create a professional quality technical paper that contains sophisticated mathematical formulas."
                >
                  <NewFileButton
                    icon="cc-icon-tex-file"
                    name="LaTeX document"
                    on_click={this.props.create_file}
                    ext="tex"
                  />
                </Tip>
              ) : (
                undefined
              )}
              <Tip
                title="Linux terminal"
                icon="terminal"
                tip="Create a command line Linux terminal.  CoCalc includes a full Linux environment.  Run command line software, vim, emacs and more."
              >
                <NewFileButton
                  icon="terminal"
                  name="Linux terminal"
                  on_click={this.props.create_file}
                  ext="term"
                />
              </Tip>
              {available.x11 ? (
                <Tip
                  title="X11 desktop"
                  icon="window-restore"
                  tip="Create an X11 desktop for running graphical applications.  CoCalc lets you collaboratively run any graphical Linux application in your browser."
                >
                  <NewFileButton
                    icon="window-restore"
                    name="X11 desktop"
                    on_click={this.props.create_file}
                    ext="x11"
                  />
                </Tip>
              ) : (
                undefined
              )}
            </Col>
          </Row>
          <Row style={row_style}>
            <Col sm={12}>
              <Tip
                title="Create a chatroom"
                placement="bottom"
                icon="comment"
                tip="Create a chatroom for chatting with other collaborators on this project."
              >
                <NewFileButton
                  icon="comment"
                  name="Create a chatroom"
                  on_click={this.props.create_file}
                  ext="sage-chat"
                />
              </Tip>
              <Tip
                title="Manage a course"
                placement="bottom"
                icon="graduation-cap"
                tip="If you are a teacher, click here to create a new course.  This is a file that you can add students and assignments to, and use to automatically create projects for everybody, send assignments to students, collect them, grade them, etc."
              >
                <NewFileButton
                  icon="graduation-cap"
                  name="Manage a course"
                  on_click={this.props.create_file}
                  ext="course"
                />
              </Tip>
            </Col>
          </Row>
          <Row style={row_style}>
            <Col sm={12}>
              <Tip
                title="Markdown File"
                icon="cc-icon-markdown"
                tip="Create a Markdown formatted document with real-time preview."
              >
                <NewFileButton
                  icon="cc-icon-markdown"
                  name="Markdown"
                  on_click={this.props.create_file}
                  ext="md"
                />
              </Tip>
              {available.rmd ? (
                <Tip
                  title="RMarkdown File"
                  icon="cc-icon-r"
                  tip="RMarkdown document with real-time preview."
                >
                  <NewFileButton
                    icon="cc-icon-r"
                    name="RMarkdown"
                    on_click={this.props.create_file}
                    ext="rmd"
                  />
                </Tip>
              ) : (
                undefined
              )}
              <Tip
                title="Task list"
                icon="tasks"
                tip="Create a todo list to keep track of everything you are doing on a project.  Put #hashtags in the item descriptions and set due dates."
              >
                <NewFileButton
                  icon="tasks"
                  name="Task list"
                  on_click={this.props.create_file}
                  ext="tasks"
                />
              </Tip>
              <Tip
                title="Stopwatch"
                icon="stopwatch"
                tip="Create a collaborative stopwatch to keep track how long it takes to do something."
              >
                <NewFileButton
                  icon="stopwatch"
                  name="Stopwatch"
                  on_click={this.props.create_file}
                  ext="time"
                />
              </Tip>
            </Col>
          </Row>
          <Row style={row_style}>
            <Col sm={12}>{this.props.children}</Col>
          </Row>
          <Row style={row_style}>
            <Col sm={12}>
              {available.jupyter_notebook ? (
                <Tip
                  title={"Jupyter server"}
                  icon={"cc-icon-ipynb"}
                  tip={
                    "Start a Jupyter classic notebook server running from your project, which only project collaborators can access."
                  }
                >
                  <NewFileButton
                    name={"Jupyter classic server..."}
                    icon={"cc-icon-ipynb"}
                    on_click={(): void => {
                      this.setState({ show_jupyter_server_panel: true });
                    }}
                    disabled={this.state.show_jupyter_server_panel}
                  />
                </Tip>
              ) : (
                undefined
              )}
              {available.jupyter_lab ? (
                <Tip
                  title={"JupyterLab server"}
                  icon={"cc-icon-ipynb"}
                  tip={
                    "Start a JupyterLab server running from your project, which only project collaborators can access."
                  }
                >
                  <NewFileButton
                    name={"JupyterLab server..."}
                    icon={"cc-icon-ipynb"}
                    on_click={(): void => {
                      this.setState({ show_jupyterlab_server_panel: true });
                    }}
                    disabled={this.state.show_jupyterlab_server_panel}
                  />
                </Tip>
              ) : (
                undefined
              )}
            </Col>
          </Row>
          <Row style={row_style}>
            <Col sm={6}>
              {this.state.show_jupyter_server_panel ? (
                <JupyterServerPanel project_id={this.props.project_id} />
              ) : (
                undefined
              )}
            </Col>
            <Col sm={6}>
              {this.state.show_jupyterlab_server_panel ? (
                <JupyterLabServerPanel project_id={this.props.project_id} />
              ) : (
                undefined
              )}
            </Col>
          </Row>
        </Fragment>
      );
    }
  };
});

export const ProjectNewForm = rclass(function({ name }) {
  return {
    displayName: "ProjectNew-ProjectNewForm",

    reduxProps: {
      [name]: {
        current_path: rtypes.string,
        default_filename: rtypes.string,
        file_creation_error: rtypes.string,
        available_features: rtypes.immutable
      },
      projects: {
        project_map: rtypes.immutable,
        get_total_project_quotas: rtypes.func
      }
    },

    propTypes: {
      project_id: rtypes.string.isRequired,
      actions: rtypes.object.isRequired,
      close: rtypes.func,
      show_header: rtypes.bool
    },

    getInitialState() {
      return {
        filename:
          this.props.default_filename != null
            ? this.props.default_filename
            : this.default_filename(),
        extension_warning: false
      };
    },

    getDefaultProps() {
      return { show_header: true };
    },

    componentWillReceiveProps(newProps) {
      if (newProps.default_filename !== this.props.default_filename) {
        return this.setState({ filename: newProps.default_filename });
      }
    },

    default_filename() {
      return require("./account").default_filename(
        undefined,
        this.props.project_id
      );
    },

    focus_input() {
      return ReactDOM.findDOMNode(this.refs.project_new_filename).focus();
    },

    create_file(ext) {
      if (!this.state.filename) {
        this.focus_input();
        return;
      }
      this.props.actions.create_file({
        name: this.state.filename,
        ext,
        current_path: this.props.current_path
      });
      return typeof this.props.close === "function"
        ? this.props.close()
        : undefined;
    },

    submit(ext) {
      if (!this.state.filename) {
        // empty filename
        return;
      }
      if (
        ext ||
        special_filenames_with_no_extension().indexOf(this.state.filename) > -1
      ) {
        return this.create_file(ext);
      } else if (this.state.filename[this.state.filename.length - 1] === "/") {
        return this.create_folder();
      } else if (
        misc.filename_extension(this.state.filename) ||
        misc.is_only_downloadable(this.state.filename)
      ) {
        return this.create_file();
      } else {
        return this.setState({ extension_warning: true });
      }
    },

    submit_via_enter(e) {
      e.preventDefault();
      return this.submit();
    },

    close_button() {
      if (!this.props.close) {
        return;
      }
      return (
        <Button
          onClick={(): void => {
            this.props.close();
          }}
          className={"pull-right"}
        >
          Close
        </Button>
      );
    },

    render_error() {
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
    },

    blocked() {
      if (this.props.project_map == null) {
        return "";
      }
      if (
        __guard__(
          this.props.get_total_project_quotas(this.props.project_id),
          x => {
            return x.network;
          }
        )
      ) {
        return "";
      } else {
        return " (access blocked -- see project settings)";
      }
    },

    create_folder() {
      this.props.actions.create_folder({
        name: this.state.filename,
        current_path: this.props.current_path,
        switch_over: true
      });
      return typeof this.props.close === "function"
        ? this.props.close()
        : undefined;
    },

    render_no_extension_alert() {
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
    },

    render_close_row() {
      if (!this.props.close) {
        return;
      }
      return (
        <Row>
          <Col sm={9}>
            <div style={{ color: "#666" }}>
              <em>
                Read about{" "}
                <a
                  href="https://doc.cocalc.com/howto/upload.html"
                  target="_blank"
                >
                  other ways to upload files.
                </a>{" "}
                You can also drag & drop files on the file listing.
              </em>
            </div>
          </Col>
          <Col sm={3}>
            <Row>
              <Col sm={12}>{this.close_button()}</Col>
            </Row>
          </Col>
        </Row>
      );
    },

    render_upload() {
      return (
        <Fragment>
          <Row style={{ marginTop: "20px" }}>
            <Col sm={12}>
              <h4>
                <Icon name="cloud-upload" /> Upload
              </h4>
            </Col>
          </Row>
          <Row>
            <Col sm={12}>
              <SMC_Dropzone
                dropzone_handler={{
                  complete: () => {
                    return this.props.actions.fetch_directory_listing();
                  }
                }}
                project_id={this.props.project_id}
                current_path={this.props.current_path}
                show_header={false}
              />
            </Col>
          </Row>
          {this.render_close_row()}
        </Fragment>
      );
    },

    render_new_file_folder() {
      return (
        <Fragment>
          <Tip
            title={"Folder"}
            placement={"left"}
            icon={"folder-open-o"}
            tip={
              "Create a folder (sub-directory) in which to store and organize your files.  CoCalc provides a full featured filesystem."
            }
          >
            <NewFileButton
              icon={"folder-open-o"}
              name={"Folder"}
              on_click={this.create_folder}
              className={"pull-right"}
            />
          </Tip>
          <Tip
            icon="file"
            title="Any Type of File"
            tip="Create a wide range of files, including HTML, Markdown, C/C++ and Java programs, etc."
            placement="top"
          >
            <NewFileDropdown create_file={this.submit} />
          </Tip>
        </Fragment>
      );
    },

    render_filename_form() {
      const onChange = () => {
        if (this.state.extension_warning) {
          return this.setState({ extension_warning: false });
        } else {
          return this.setState({
            filename: ReactDOM.findDOMNode(this.refs.project_new_filename).value
          });
        }
      };

      const onKey = e => {
        if (e.keyCode === 27) {
          return typeof this.props.close === "function"
            ? this.props.close()
            : undefined;
        }
      };

      return (
        <form onSubmit={this.submit_via_enter}>
          <FormGroup>
            <FormControl
              autoFocus
              ref={"project_new_filename"}
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
    },

    render_title() {
      if (this.props.current_path != null) {
        return (
          <span>
            Create new files in{" "}
            <PathLink
              path={this.props.current_path}
              actions={this.props.actions}
            />
          </span>
        );
      }
    },

    render() {
      //key is so autofocus works below
      return (
        <SettingBox
          show_header={this.props.show_header}
          icon={"plus-circle"}
          title_el={this.render_title()}
          close={this.props.close}
        >
          <Row key={this.props.default_filename}>
            <Col sm={12}>
              <div style={{ color: "#666", paddingBottom: "5px" }}>
                Name your file, folder or paste in a link
              </div>
              <div
                style={{
                  display: "flex",
                  flexFlow: "row wrap",
                  justifyContent: "space-between",
                  alignItems: "stretch"
                }}
              >
                <div
                  style={{
                    flex: "1 0 auto",
                    marginRight: "10px",
                    minWidth: "20em"
                  }}
                >
                  {this.render_filename_form()}
                </div>
                <div style={{ flex: "0 0 auto" }}>
                  {this.render_new_file_folder()}
                </div>
              </div>
              {this.state.extension_warning
                ? this.render_no_extension_alert()
                : undefined}
              {this.props.file_creation_error ? this.render_error() : undefined}
              <div style={{ color: "#666", paddingBottom: "5px" }}>
                Select the type of file
              </div>
              <FileTypeSelector
                name={name}
                create_file={this.submit}
                create_folder={this.create_folder}
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
                    loading={this.state.downloading}
                  />
                </Tip>
              </FileTypeSelector>
            </Col>
          </Row>
          {this.render_upload()}
        </SettingBox>
      );
    }
  };
});

export const ProjectNew = rclass(function({ name }) {
  return {
    propTypes: {
      project_id: rtypes.string
    },

    render() {
      return (
        <Row style={{ marginTop: "15px" }}>
          <Col md={12} mdOffset={0} lg={10} lgOffset={1}>
            <ProjectNewForm
              project_id={this.props.project_id}
              name={name}
              actions={this.actions(name)}
            />
          </Col>
        </Row>
      );
    }
  };
});

function __guardMethod__(obj, methodName, transform) {
  if (
    typeof obj !== "undefined" &&
    obj !== null &&
    typeof obj[methodName] === "function"
  ) {
    return transform(obj, methodName);
  } else {
    return undefined;
  }
}
function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}
