/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Tag, Col, Row } from "antd";
import { Gutter } from "antd/es/grid/row";
import React from "react";

import { redux, useActions } from "@cocalc/frontend/app-framework";
import { A, Icon, Tip } from "@cocalc/frontend/components";
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
    <div>
      <Section color="geekblue" icon="jupyter" style={{ margin: "0 0 15px 0" }}>
        Data & Science
      </Section>
      <Row gutter={gutter}>
        {available.jupyter_notebook && (
          <Col sm={sm} md={md}>
            <Tip
              icon="jupyter"
              title="Jupyter Notebook"
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

        {available.sage && (
          <Col sm={sm} md={md}>
            <Tip
              icon="sagemath-bold"
              title="SageMath Worksheet"
              tip="Create an interactive worksheet for using the SageMath mathematical software, R, and many other systems.  Do sophisticated mathematics, draw plots, compute integrals, work with matrices, etc."
            >
              <NewFileButton
                icon="sagemath-bold"
                name="SageMath Worksheet"
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
              tip="Create a professional quality technical paper that contains sophisticated mathematical formulas and can run Python and Sage code."
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
      </Row>

      <Section color="orange" icon="linux">
        Linux Operating System
      </Section>

      <Row gutter={gutter} style={newRowStyle}>
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
        {available.x11 && (
          <Col sm={sm} md={md}>
            <Tip
              title="Graphical Linux X11 Desktop"
              icon="window-restore"
              tip="Create an X11 desktop for running graphical applications.  CoCalc lets you collaboratively run any graphical Linux application in your browser."
            >
              <NewFileButton
                icon="window-restore"
                name="Graphical Linux X11 Desktop"
                on_click={create_file}
                ext="x11"
              />
            </Tip>
          </Col>
        )}
      </Row>

      <Section color="green" icon="markdown">
        Computational Markdown Suite
      </Section>
      <Row gutter={gutter} style={newRowStyle}>
        <Col sm={sm} md={md}>
          <Tip
            title="Computational Markdown Document"
            icon="markdown"
            tip="Create a rich editable text document backed by markdown and Jupyter code that contains mathematical formulas, lists, headings, images and run code."
          >
            <NewFileButton
              icon="markdown"
              name="Markdown"
              on_click={create_file}
              ext="md"
            />
          </Tip>
        </Col>
        <Col sm={sm} md={md}>
          <Tip
            icon="layout"
            title="Computational Whiteboard"
            tip="Create a computational whiteboard with mathematical formulas, lists, headings, images and Jupyter code cells."
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
            tip="Create a slideshow presentation with mathematical formulas, lists, headings, images and code cells."
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
            title="Task List"
            icon="tasks"
            tip="Create a task list to keep track of everything you are doing on a project.  Put #hashtags in the item descriptions and set due dates.  Run code."
          >
            <NewFileButton
              icon="tasks"
              name="Task List"
              on_click={create_file}
              ext="tasks"
            />
          </Tip>
        </Col>
      </Row>

      <Section color="purple" icon="graduation-cap">
        Teaching and Social
      </Section>

      <Row gutter={gutter} style={newRowStyle}>
        <Col sm={sm} md={md}>
          <Tip
            title="Create a Chatroom"
            placement="bottom"
            icon="comment"
            tip={
              <>
                Create a chatroom for chatting with collaborators on this
                project
                {redux.getStore("projects").hasOpenAI(project_id) ? (
                  <>
                    {" "}
                    and{" "}
                    <A href="https://doc.cocalc.com/chatgpt.html">
                      with ChatGPT
                    </A>
                  </>
                ) : (
                  ""
                )}
                . You can also embed and run computations in chat messages.
              </>
            }
          >
            <NewFileButton
              icon="comment"
              name={"Chatroom"}
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
            tip={
              <>
                If you are a teacher, click here to create a new course. You can
                add students and assignments to, and use to automatically create
                projects for everybody, send assignments to students, collect
                them, grade them, etc. See{" "}
                <A href="https://doc.cocalc.com/teaching-instructors.html">
                  the docs
                </A>
                .
              </>
            }
          >
            <NewFileButton
              icon="graduation-cap"
              name="Manage a Course"
              on_click={create_file}
              ext="course"
            />
          </Tip>
        </Col>
        <Col sm={sm} md={md}>
          <Tip
            title="Stopwatch and Timers"
            icon="stopwatch"
            tip="A handy little utility to create collaborative stopwatches and timers to coordinate time."
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

      <Section color="red" icon="server">
        Files and Servers
      </Section>

      <Row gutter={gutter} style={newRowStyle}>
        <Col sm={sm} md={md}>
          <Tip
            title={"Create New Folder"}
            placement={"left"}
            icon={"folder-open"}
            tip={
              "Create a folder (subdirectory) in which to store and organize your files.  CoCalc provides a full featured filesystem.  You can also type a path in the input box above that ends with a forward slash / and press enter."
            }
          >
            <NewFileButton
              icon={"folder-open"}
              name={"New Folder"}
              on_click={create_folder}
            />
          </Tip>
        </Col>
        <Col sm={sm} md={md}>
          {children}
        </Col>
        <Col sm={sm} md={md}>
          <NewFileButton
            name={`Jupyter, VS Code and Pluto Servers...`}
            icon={"server"}
            on_click={() => {
              project_actions?.set_active_tab("servers", {
                change_history: true,
              });
            }}
          />
        </Col>
      </Row>
    </div>
  );
};

function Section({
  children,
  color,
  icon,
  style,
}: {
  children;
  color;
  icon;
  style?;
}) {
  return (
    <div
      style={{
        margin: "20px 0 -20px 0",
        ...style,
      }}
    >
      <Tag
        icon={<Icon name={icon} />}
        color={color}
        style={{ fontSize: "11pt" }}
      >
        {children}
      </Tag>
    </div>
  );
}
