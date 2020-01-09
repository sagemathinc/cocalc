import * as React from "react";
import { Col, Row } from "react-bootstrap";

import { Tip } from "../../r_misc";

import { JupyterServerPanel } from "../plain-jupyter-server";
import { JupyterLabServerPanel } from "../jupyterlab-server";

import { NewFileButton } from "./new-file-button";
import { AvailableFeatures } from "./types";
import { ALL_AVAIL } from "../../project_configuration";
import { redux } from "../../app-framework";

interface Props {
  create_file: (name?: string) => void;
  project_id?: string;
  children?: React.ReactNode;
  name: string;
}

// Use Rows and Cols to append more buttons to this class.
// Could be changed to auto adjust to a list of pre-defined button names.
export function FileTypeSelector({
  name,
  create_file,
  project_id,
  children
}: Props): JSX.Element | null {
  const [show_jupyter_server, set_show_jupyter_server] = React.useState(false);
  const [show_jupyterlab_server, set_show_jupyterlab_server] = React.useState(
    false
  );

  const available_features = redux.useProjectStore(name, store => {
    return store.get("available_features");
  });

  if (!create_file || !create_file || !project_id) {
    return null;
  }

  const row_style = { marginBottom: "8px" };

  // If the configuration is not yet available, we default to the *most likely*
  // configuration, not the least likely configuration.
  // See https://github.com/sagemathinc/cocalc/issues/4293
  // This is also consistent with src/smc-webapp/project/explorer/new-button.tsx
  const available = available_features?.toJS() ?? ALL_AVAIL;

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
                on_click={create_file}
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
                on_click={create_file}
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
                on_click={create_file}
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
              on_click={create_file}
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
                on_click={create_file}
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
              on_click={create_file}
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
              on_click={create_file}
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
              on_click={create_file}
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
                on_click={create_file}
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
              on_click={create_file}
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
              on_click={create_file}
              ext="time"
            />
          </Tip>
        </Col>
      </Row>
      <Row style={row_style}>
        <Col sm={12}>{children}</Col>
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
                  set_show_jupyter_server(true);
                }}
                disabled={show_jupyter_server}
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
                  set_show_jupyterlab_server(true);
                }}
                disabled={show_jupyterlab_server}
              />
            </Tip>
          ) : (
            undefined
          )}
        </Col>
      </Row>
      <Row style={row_style}>
        <Col sm={6}>
          {show_jupyter_server ? (
            <JupyterServerPanel project_id={project_id} />
          ) : (
            undefined
          )}
        </Col>
        <Col sm={6}>
          {show_jupyterlab_server ? (
            <JupyterLabServerPanel project_id={project_id} />
          ) : (
            undefined
          )}
        </Col>
      </Row>
    </>
  );
}
