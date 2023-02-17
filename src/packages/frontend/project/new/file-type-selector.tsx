/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Col, Row } from "antd";
import { Gutter } from "antd/es/grid/row";
import React from "react";

import { useActions } from "@cocalc/frontend/app-framework";
import { Tip } from "@cocalc/frontend/components";
import { useAvailableFeatures } from "../use-available-features";
import { NewFileButton } from "./new-file-button";

interface Props {
  create_file: (name?: string) => void;
  create_folder: (name?: string) => void;
  project_id: string;
  children?: React.ReactNode;
}

// Use Rows and Cols to append more buttons to this class.
// Could be changed to auto adjust to a list of pre-defined button names.
export const FileTypeSelector: React.FC<Props> = (props: Props) => {
  const { create_file, create_folder, project_id, children } = props;

  const project_actions = useActions({ project_id });
  const available = useAvailableFeatures(project_id);

  if (!create_file || !create_file || !project_id) {
    return null;
  }

  // col width of Antd's 24 grid system
  const md = 6;
  const sm = 12;
  const y: Gutter = 30;
  const gutter: [Gutter, Gutter] = [20, y / 2];
  const newRowStyle = { marginTop: `${y}px` };

  // console.log("FileTypeSelector: available", available)
  return (
    <>
      <Row gutter={gutter}>
        {available.jupyter_notebook && (
          <Col sm={sm} md={md}>
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
          </Col>
        )}

        <Col sm={sm} md={md}>
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
        </Col>

        <Col sm={sm} md={md}>
          <Tip
            icon="layout"
            title="Computational Whiteboard"
            tip="Create a computational whiteboard with Jupyter code cells."
          >
            <NewFileButton
              icon="layout"
              name="Whiteboard"
              on_click={create_file}
              ext="board"
            />
          </Tip>
        </Col>

        <Col sm={sm} md={md}>
          <Tip
            icon="slides"
            title="Slides"
            tip="Create a slideshow with Jupyter code cells."
          >
            <NewFileButton
              icon="slides"
              name="Slides"
              on_click={create_file}
              ext="slides"
            />
          </Tip>
        </Col>

        <Col sm={sm} md={md}>
          <Tip
            title="Markdown Document"
            icon="markdown"
            tip="Create a rich editable text document backed by markdown that contains mathematical formulas, lists, headings, images and code."
          >
            <NewFileButton
              icon="markdown"
              name="Markdown"
              on_click={create_file}
              ext="md"
            />
          </Tip>
        </Col>

        {available.sage && (
          <Col sm={sm} md={md}>
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
            </Tip>{" "}
          </Col>
        )}

        {available.latex && (
          <Col sm={sm} md={md}>
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
          </Col>
        )}

        {available.x11 && (
          <Col sm={sm} md={md}>
            <Tip
              title="Linux X11 Desktop"
              icon="window-restore"
              tip="Create an X11 desktop for running graphical applications.  CoCalc lets you collaboratively run any graphical Linux application in your browser."
            >
              <NewFileButton
                icon="window-restore"
                name="Graphical desktop"
                on_click={create_file}
                ext="x11"
              />
            </Tip>
          </Col>
        )}

        <Col sm={sm} md={md}>
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

      <Row gutter={gutter} style={newRowStyle}>
        <Col sm={sm} md={md}>
          <Tip
            title="Create a Chatroom"
            placement="bottom"
            icon="comment"
            tip="Create a chatroom for chatting with other collaborators on this project."
          >
            <NewFileButton
              icon="comment"
              name="Chatroom"
              on_click={create_file}
              ext="sage-chat"
            />
          </Tip>
        </Col>
        <Col sm={sm} md={md}>
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

      <Row gutter={gutter} style={newRowStyle}>
        {available.rmd && (
          <Col sm={sm} md={md}>
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
          </Col>
        )}

        <Col sm={sm} md={md}>
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
        </Col>
        <Col sm={sm} md={md}>
          <Tip
            title="Stopwatch and Timers"
            icon="stopwatch"
            tip="Create collaborative stopwatches and timers to coordinate time."
          >
            <NewFileButton
              icon="stopwatch"
              name="Timers"
              on_click={create_file}
              ext="time"
            />
          </Tip>
        </Col>
        <Col sm={24}>{children}</Col>
        <Col md={12} offset={6}>
          <NewFileButton
            name={'Servers moved to "Servers" tab.'}
            icon={"server"}
            on_click={() => {
              project_actions?.set_active_tab("servers", {
                change_history: true,
              });
            }}
          />
        </Col>
      </Row>
    </>
  );
};
