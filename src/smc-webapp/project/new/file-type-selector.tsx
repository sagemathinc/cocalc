import * as React from "react";
import { Col, Row } from "react-bootstrap";

import { rclass, rtypes } from "../../app-framework";
import { Tip } from "../../r_misc";

import { JupyterServerPanel } from "../plain-jupyter-server";
import { JupyterLabServerPanel } from "../jupyterlab-server";

import { NewFileButton } from "./new-file-button";
import { AvailableFeatures } from "./types";

interface ReduxProps {
  available_features: AvailableFeatures;
}

interface ReactProps {
  create_file: (name?: string) => void;
  create_folder: (name?: string) => void;
  styles?: React.CSSProperties;
  project_id?: string;
  name: string;
}

interface State {
  show_jupyter_server_panel: boolean;
  show_jupyterlab_server_panel: boolean;
}
// TODO: Change to function component.
// Use Rows and Cols to append more buttons to this class.
// Could be changed to auto adjust to a list of pre-defined button names.
export const FileTypeSelector = rclass<ReactProps>(
  class FileTypeSelector extends React.Component<
    ReactProps & ReduxProps,
    State
  > {
    constructor(props) {
      super(props);
      this.state = {
        show_jupyter_server_panel: false,
        show_jupyterlab_server_panel: false
      };
    }

    static reduxProps = ({ name }): any => {
      return {
        [name]: {
          available_features: rtypes.immutable
        }
      };
    };

    render(): JSX.Element | null {
      if (
        !this.props.create_file ||
        !this.props.create_file ||
        !this.props.project_id
      ) {
        return null;
      }

      const row_style = { marginBottom: "8px" };

      // why is available_features immutable?
      const available = this.props.available_features?.toJS() ?? {};

      // console.log("FileTypeSelector: available", available)

      return (
        <>
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
        </>
      );
    }
  }
);
