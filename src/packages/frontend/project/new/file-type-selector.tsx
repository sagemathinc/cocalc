/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Col, Row, Tag } from "antd";
import { Gutter } from "antd/es/grid/row";
import React from "react";

import { A } from "@cocalc/frontend/components/A";
import { Icon } from "@cocalc/frontend/components/icon";
import { Tip } from "@cocalc/frontend/components/tip";
import { NEW_FILETYPE_ICONS } from "./consts";
import { NewFileButton } from "./new-file-button";

interface Props {
  create_file: (name?: string) => void;
  create_folder?: (name?: string) => void;
  projectActions?;
  availableFeatures;
  disabledFeatures?;
  chatgptNotebook?;
  children?: React.ReactNode;
  mode?: "flyout" | "full";
  selectedExt?: string;
}

export const delayShow = 1500;

// Use Rows and Cols to append more buttons to this class.
// Could be changed to auto adjust to a list of pre-defined button names.
export function FileTypeSelector({
  create_file,
  create_folder,
  projectActions,
  availableFeatures,
  disabledFeatures,
  chatgptNotebook,
  mode = "full",
  selectedExt,
  children,
}: Props) {
  if (!create_file) {
    return null;
  }

  const isFlyout = mode === "flyout";
  const btnSize = isFlyout ? "small" : "large";

  // col width of Antd's 24 grid system
  const md = isFlyout ? 24 : 6;
  const sm = isFlyout ? 24 : 12;
  const y: Gutter = isFlyout ? 15 : 30;
  const gutter: [Gutter, Gutter] = [20, y / 2];
  const newRowStyle = { marginTop: `${y}px` };

  function btnActive(ext: string): boolean {
    if (!isFlyout) return false;
    return ext === selectedExt;
  }

  // console.log("FileTypeSelector: available", available)
  return (
    <div>
      {(availableFeatures.jupyter_notebook ||
        availableFeatures.sage ||
        availableFeatures.latex ||
        availableFeatures.rmd) && (
        <>
          <Section color="geekblue" icon="jupyter" isFlyout={isFlyout}>
            Data & Science
          </Section>
          <Row gutter={gutter} style={newRowStyle}>
            {availableFeatures.jupyter_notebook && (
              <Col sm={sm} md={md}>
                <Tip
                  delayShow={delayShow}
                  icon={NEW_FILETYPE_ICONS["ipynb"]}
                  title="Jupyter Notebook"
                  tip="Create an interactive notebook for using Python, Sage, R, Octave and more."
                >
                  <NewFileButton
                    name="Jupyter Notebook"
                    on_click={create_file}
                    ext={"ipynb"}
                    size={btnSize}
                    active={btnActive("ipynb")}
                  />
                </Tip>
                {chatgptNotebook}
              </Col>
            )}

            {availableFeatures.sage && (
              <Col sm={sm} md={md}>
                <Tip
                  delayShow={delayShow}
                  icon={NEW_FILETYPE_ICONS.sagews}
                  title="SageMath Worksheet"
                  tip="Create an interactive worksheet for using the SageMath mathematical software, Python, R, and many other systems.  Do sophisticated mathematics, draw plots, compute integrals, work with matrices, etc."
                >
                  <NewFileButton
                    name="SageMath Worksheet"
                    on_click={create_file}
                    ext="sagews"
                    size={btnSize}
                    active={btnActive("sagews")}
                  />
                </Tip>{" "}
              </Col>
            )}

            {availableFeatures.latex && (
              <Col sm={sm} md={md}>
                <Tip
                  delayShow={delayShow}
                  title="LaTeX Document"
                  icon={NEW_FILETYPE_ICONS.tex}
                  tip="Create a professional quality technical paper that contains sophisticated mathematical formulas and can run Python and Sage code."
                >
                  <NewFileButton
                    name="LaTeX Document"
                    on_click={create_file}
                    ext="tex"
                    size={btnSize}
                    active={btnActive("tex")}
                  />
                </Tip>
              </Col>
            )}

            {availableFeatures.rmd && (
              <Col sm={sm} md={md}>
                <Tip
                  delayShow={delayShow}
                  title="RMarkdown File"
                  icon={NEW_FILETYPE_ICONS.rmd}
                  tip="RMarkdown document with real-time preview."
                >
                  <NewFileButton
                    name="RMarkdown"
                    on_click={create_file}
                    ext="rmd"
                    size={btnSize}
                    active={btnActive("rmd")}
                  />
                </Tip>
              </Col>
            )}
          </Row>
        </>
      )}

      {!disabledFeatures?.linux && (
        <>
          <Section color="orange" icon="linux" isFlyout={isFlyout}>
            Linux Operating System
          </Section>

          <Row gutter={gutter} style={newRowStyle}>
            <Col sm={sm} md={md}>
              <Tip
                delayShow={delayShow}
                title="Linux Terminal"
                icon={NEW_FILETYPE_ICONS.term}
                tip="Create a command line Linux terminal.  CoCalc includes a full Linux environment.  Run command line software, vim, emacs and more."
              >
                <NewFileButton
                  name="Linux Terminal"
                  on_click={create_file}
                  ext="term"
                  size={btnSize}
                  active={btnActive("term")}
                />
              </Tip>
            </Col>
            {availableFeatures.x11 && (
              <Col sm={sm} md={md}>
                <Tip
                  delayShow={delayShow}
                  title="Graphical X11 Desktop"
                  icon={NEW_FILETYPE_ICONS.x11}
                  tip="Create an X11 desktop for running graphical applications.  CoCalc lets you collaboratively run any graphical Linux application in your browser."
                >
                  <NewFileButton
                    name="Graphical X11 Desktop"
                    on_click={create_file}
                    ext="x11"
                    size={btnSize}
                    active={btnActive("x11")}
                  />
                </Tip>
              </Col>
            )}
          </Row>
        </>
      )}

      {!disabledFeatures?.md && (
        <>
          <Section color="green" icon="markdown" isFlyout={isFlyout}>
            Computational Markdown Suite
          </Section>
          <Row gutter={gutter} style={newRowStyle}>
            <Col sm={sm} md={md}>
              <Tip
                delayShow={delayShow}
                title="Computational Markdown Document"
                icon={NEW_FILETYPE_ICONS.md}
                tip="Create a rich editable text document backed by markdown and Jupyter code that contains mathematical formulas, lists, headings, images and run code."
              >
                <NewFileButton
                  name="Markdown"
                  on_click={create_file}
                  ext="md"
                  size={btnSize}
                  active={btnActive("md")}
                />
              </Tip>
            </Col>
            <Col sm={sm} md={md}>
              <Tip
                icon={NEW_FILETYPE_ICONS.board}
                title="Computational Whiteboard"
                tip="Create a computational whiteboard with mathematical formulas, lists, headings, images and Jupyter code cells."
              >
                <NewFileButton
                  name="Whiteboard"
                  on_click={create_file}
                  ext="board"
                  size={btnSize}
                  active={btnActive("board")}
                />
              </Tip>
            </Col>

            <Col sm={sm} md={md}>
              <Tip
                delayShow={delayShow}
                icon={NEW_FILETYPE_ICONS.slides}
                title="Slides"
                tip="Create a slideshow presentation with mathematical formulas, lists, headings, images and code cells."
              >
                <NewFileButton
                  name="Slides"
                  on_click={create_file}
                  ext="slides"
                  size={btnSize}
                  active={btnActive("slides")}
                />
              </Tip>
            </Col>

            <Col sm={sm} md={md}>
              <Tip
                delayShow={delayShow}
                title="Task List"
                icon={NEW_FILETYPE_ICONS.tasks}
                tip="Create a task list to keep track of everything you are doing on a project.  Put #hashtags in the item descriptions and set due dates.  Run code."
              >
                <NewFileButton
                  name="Task List"
                  on_click={create_file}
                  ext="tasks"
                  size={btnSize}
                  active={btnActive("tasks")}
                />
              </Tip>
            </Col>
          </Row>
        </>
      )}

      {!(disabledFeatures?.course && disabledFeatures?.chat) && (
        <>
          <Section color="purple" icon="graduation-cap" isFlyout={isFlyout}>
            Teaching and Social
          </Section>

          <Row gutter={gutter} style={newRowStyle}>
            {!disabledFeatures?.chat && (
              <Col sm={sm} md={md}>
                <Tip
                  delayShow={delayShow}
                  title="Create a Chatroom"
                  placement="bottom"
                  icon={NEW_FILETYPE_ICONS["sage-chat"]}
                  tip={
                    <>
                      Create a chatroom for chatting with collaborators on this
                      project. You can also embed and run computations in chat
                      messages.
                    </>
                  }
                >
                  <NewFileButton
                    name={"Chatroom"}
                    on_click={create_file}
                    ext="sage-chat"
                    size={btnSize}
                    active={btnActive("sage-chat")}
                  />
                </Tip>
              </Col>
            )}
            {!disabledFeatures?.course && (
              <Col sm={sm} md={md}>
                <Tip
                  delayShow={delayShow}
                  title="Manage a Course"
                  placement="bottom"
                  icon={NEW_FILETYPE_ICONS.course}
                  tip={
                    <>
                      If you are a teacher, click here to create a new course.
                      You can add students and assignments to, and use to
                      automatically create projects for everybody, send
                      assignments to students, collect them, grade them, etc.
                      See{" "}
                      <A href="https://doc.cocalc.com/teaching-instructors.html">
                        the docs
                      </A>
                      .
                    </>
                  }
                >
                  <NewFileButton
                    name="Manage a Course"
                    on_click={create_file}
                    ext="course"
                    size={btnSize}
                    active={btnActive("course")}
                  />
                </Tip>
              </Col>
            )}
            {!disabledFeatures?.timers && (
              <Col sm={sm} md={md}>
                <Tip
                  delayShow={delayShow}
                  title="Stopwatches and Timers"
                  icon={NEW_FILETYPE_ICONS.time}
                  tip="A handy little utility to create collaborative stopwatches and timers to track your use of time."
                >
                  <NewFileButton
                    name="Timers"
                    on_click={create_file}
                    ext="time"
                    size={btnSize}
                    active={btnActive("time")}
                  />
                </Tip>
              </Col>
            )}
          </Row>
        </>
      )}

      {!disabledFeatures?.servers && !isFlyout && (
        <>
          <Section color="red" icon="server" isFlyout={isFlyout}>
            Files and Servers
          </Section>

          <Row gutter={gutter} style={newRowStyle}>
            {create_folder != null && (
              <Col sm={sm} md={md}>
                <Tip
                  delayShow={delayShow}
                  title={"Create New Folder"}
                  placement="left"
                  icon={NEW_FILETYPE_ICONS["/"]}
                  tip={
                    "Create a folder (subdirectory) in which to store and organize your files.  CoCalc provides a full featured filesystem.  You can also type a path in the input box above that ends with a forward slash / and press enter."
                  }
                >
                  <NewFileButton
                    ext="/"
                    name={"New Folder"}
                    on_click={create_folder}
                    size={btnSize}
                    active={btnActive("/")}
                  />
                </Tip>
              </Col>
            )}
            <Col sm={sm} md={md}>
              {children}
            </Col>
            {projectActions != null && (
              <Col sm={sm} md={md}>
                <NewFileButton
                  size={btnSize}
                  name={`Jupyter, VS Code and Pluto Servers...`}
                  ext="server"
                  on_click={() => {
                    projectActions.set_active_tab("servers", {
                      change_history: true,
                    });
                  }}
                  active={false}
                />
              </Col>
            )}
          </Row>
        </>
      )}
    </div>
  );
}

function Section({
  children,
  color,
  icon,
  style,
  isFlyout,
}: {
  children;
  color;
  icon;
  style?;
  isFlyout: boolean;
}) {
  return (
    <div
      style={{
        margin: isFlyout ? "20px 0 -10px 0" : "20px 0 -20px 0",
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
