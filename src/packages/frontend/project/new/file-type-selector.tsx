/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";
import { Col, Row } from "react-bootstrap";

import { Tip } from "../../components";

import { NamedServerPanel } from "../named-server-panel";

import { NewFileButton } from "./new-file-button";
import { ALL_AVAIL } from "../../project_configuration";
import { useTypedRedux, useState } from "../../app-framework";

interface Props {
  create_file: (name?: string) => void;
  create_folder: (name?: string) => void;
  project_id: string;
  children?: React.ReactNode;
}

// Use Rows and Cols to append more buttons to this class.
// Could be changed to auto adjust to a list of pre-defined button names.
export const FileTypeSelector: React.FC<Props> = ({
  create_file,
  create_folder,
  project_id,
  children,
}: Props): JSX.Element | null => {
  const [showNamedServer, setShowNamedServer] = useState<
    "" | "jupyter" | "jupyterlab" | "code" | "pluto"
  >("");

  const available_features = useTypedRedux(
    { project_id },
    "available_features"
  );

  if (!create_file || !create_file || !project_id) {
    return null;
  }

  const row_style = { marginBottom: "8px" };

  // If the configuration is not yet available, we default to the *most likely*
  // configuration, not the least likely configuration.
  // See https://github.com/sagemathinc/cocalc/issues/4293
  // This is also consistent with src/@cocalc/frontend/project/explorer/new-button.tsx
  const available = available_features?.toJS() ?? ALL_AVAIL;

  // console.log("FileTypeSelector: available", available)
  return (
    <>
      <Row style={row_style}>
        <Col sm={12}>
          {available.jupyter_notebook ? (
            <Tip
              icon="jupyter"
              title="Jupyter notebook"
              tip="Create an interactive notebook for using Python, Julia, R and more."
            >
              <NewFileButton
                icon="jupyter"
                name="Jupyter Notebook"
                on_click={create_file}
                ext={"ipynb"}
              />
            </Tip>
          ) : undefined}
          <Tip
            title="Linux Terminal"
            icon="terminal"
            tip="Create a command line Linux terminal.  CoCalc includes a full Linux environment.  Run command line software, vim, emacs and more."
          >
            <NewFileButton
              icon="terminal"
              name="Linux Terminal"
              on_click={create_file}
              ext="term"
            />
          </Tip>
          <Tip icon="layout" title="Whiteboard" tip="Create a whiteboard.">
            <NewFileButton
              icon="layout"
              name="Whiteboard"
              on_click={create_file}
              ext="board"
            />
          </Tip>
          {available.sage ? (
            <Tip
              icon="sagemath-bold"
              title="Sage Worksheet"
              tip="Create an interactive worksheet for using the SageMath mathematical software, R, and many other systems.  Do sophisticated mathematics, draw plots, compute integrals, work with matrices, etc."
            >
              <NewFileButton
                icon="sagemath-bold"
                name="Sage Worksheet"
                on_click={create_file}
                ext="sagews"
              />
            </Tip>
          ) : undefined}
          {available.latex ? (
            <Tip
              title="LaTeX Document"
              icon="tex-file"
              tip="Create a professional quality technical paper that contains sophisticated mathematical formulas."
            >
              <NewFileButton
                icon="tex-file"
                name="LaTeX Document"
                on_click={create_file}
                ext="tex"
              />
            </Tip>
          ) : undefined}
          {available.x11 ? (
            <Tip
              title="Linux X11 Desktop"
              icon="window-restore"
              tip="Create an X11 desktop for running graphical applications.  CoCalc lets you collaboratively run any graphical Linux application in your browser."
            >
              <NewFileButton
                icon="window-restore"
                name="Linux Graphical X11 desktop"
                on_click={create_file}
                ext="x11"
              />
            </Tip>
          ) : undefined}
          <Tip
            title={"Create a Folder"}
            placement={"left"}
            icon={"folder-open"}
            tip={
              "Create a folder (sub-directory) in which to store and organize your files.  CoCalc provides a full featured filesystem."
            }
          >
            <NewFileButton
              icon={"folder-open"}
              name={"Create a folder"}
              on_click={create_folder}
            />
          </Tip>
        </Col>
      </Row>
      <Row style={row_style}>
        <Col sm={12}>
          <Tip
            title="Create a Chatroom"
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
            title="Manage a Course"
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
            icon="markdown"
            tip="Create a Markdown formatted document with real-time preview."
          >
            <NewFileButton
              icon="markdown"
              name="Markdown"
              on_click={create_file}
              ext="md"
            />
          </Tip>
          {available.rmd ? (
            <Tip
              title="RMarkdown File"
              icon="r"
              tip="RMarkdown document with real-time preview."
            >
              <NewFileButton
                icon="r"
                name="RMarkdown"
                on_click={create_file}
                ext="rmd"
              />
            </Tip>
          ) : undefined}
          <Tip
            title="Todo List"
            icon="tasks"
            tip="Create a todo list to keep track of everything you are doing on a project.  Put #hashtags in the item descriptions and set due dates."
          >
            <NewFileButton
              icon="tasks"
              name="Todo list"
              on_click={create_file}
              ext="tasks"
            />
          </Tip>
          <Tip
            title="Stopwatch"
            icon="stopwatch"
            tip="Create collaborative stopwatches and timers to coordinate time."
          >
            <NewFileButton
              icon="stopwatch"
              name="Stopwatches and Timers"
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
          {available.jupyter_notebook && (
            <NewFileButton
              name={"Jupyter Classic Server..."}
              icon={"ipynb"}
              on_click={(): void => {
                showNamedServer == "jupyter"
                  ? setShowNamedServer("")
                  : setShowNamedServer("jupyter");
              }}
            />
          )}
          {available.jupyter_lab && (
            <NewFileButton
              name={"JupyterLab Server..."}
              icon={"ipynb"}
              on_click={(): void => {
                showNamedServer == "jupyterlab"
                  ? setShowNamedServer("")
                  : setShowNamedServer("jupyterlab");
              }}
            />
          )}
          <NewFileButton
            name={"VS Code Server..."}
            icon={"vscode"}
            on_click={(): void => {
              showNamedServer == "code"
                ? setShowNamedServer("")
                : setShowNamedServer("code");
            }}
          />
          <NewFileButton
            name={"Pluto server..."}
            icon={"julia"}
            on_click={(): void => {
              showNamedServer == "pluto"
                ? setShowNamedServer("")
                : setShowNamedServer("pluto");
            }}
          />
        </Col>
      </Row>
      <Row style={row_style}>
        <Col sm={12}>
          {showNamedServer && (
            <NamedServerPanel project_id={project_id} name={showNamedServer} />
          )}
        </Col>
      </Row>
    </>
  );
};
