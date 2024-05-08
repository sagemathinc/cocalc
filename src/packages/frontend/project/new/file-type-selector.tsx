/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Col, Row, Tag } from "antd";
import { Gutter } from "antd/es/grid/row";
import type { ReactNode } from "react";

import { Available } from "@cocalc/comm/project-configuration";
import { A } from "@cocalc/frontend/components/A";
import { Icon } from "@cocalc/frontend/components/icon";
import { Tip } from "@cocalc/frontend/components/tip";
import { computeServersEnabled } from "@cocalc/frontend/compute/config";
import { ProjectActions } from "@cocalc/frontend/project_actions";
import { DELAY_SHOW_MS, NEW_FILETYPE_ICONS } from "./consts";
import { JupyterNotebookButtons } from "./jupyter-buttons";
import { NewFileButton } from "./new-file-button";

interface DisabledFeatures {
  linux?: boolean;
  servers?: boolean;
  course?: boolean;
  chat?: boolean;
  md?: boolean;
  timers?: boolean;
}

interface Props {
  create_file: (name?: string) => void;
  create_folder?: (name?: string) => void;
  projectActions: ProjectActions | undefined;
  availableFeatures: Readonly<Available>;
  disabledFeatures?: Readonly<DisabledFeatures>;
  children?: ReactNode;
  mode?: "flyout" | "full";
  selectedExt?: string;
  filename: string;
  makeNewFilename?: (ext: string) => void;
}

// Use Rows and Cols to append more buttons to this class.
// Could be changed to auto adjust to a list of pre-defined button names.
export function FileTypeSelector({
  create_file,
  create_folder,
  projectActions,
  availableFeatures,
  disabledFeatures,
  mode = "full",
  selectedExt,
  children,
  filename,
  makeNewFilename,
}: Props) {
  if (!create_file) {
    return null;
  }

  const isFlyout = mode === "flyout";
  const btnSize = isFlyout ? "small" : "large";

  // col width of Antd's 24 grid system
  const base = 6;
  const md = isFlyout ? 24 : base;
  const sm = isFlyout ? 24 : 2 * base;
  const doubleMd = isFlyout ? 24 : 2 * base;
  const doubleSm = isFlyout ? 24 : 4 * base;
  const y: Gutter = isFlyout ? 15 : 30;
  const gutter: [Gutter, Gutter] = [20, y / 2];
  const newRowStyle = { marginTop: `${y}px` };

  function btnActive(ext: string): boolean {
    if (!isFlyout) return false;
    return ext === selectedExt;
  }

  function renderJupyterNotebook() {
    if (
      !availableFeatures.jupyter_notebook &&
      !availableFeatures.sage &&
      !availableFeatures.latex
    ) {
      return;
    }

    return (
      <>
        <Row gutter={gutter} style={newRowStyle}>
          <JupyterNotebookButtons
            mode={mode}
            availableFeatures={availableFeatures}
            create_file={create_file}
            btnSize={btnSize}
            btnActive={btnActive}
            grid={[sm, md]}
            filename={filename}
            makeNewFilename={() => makeNewFilename?.("ipynb")}
          />
          {renderSageWS()}
          {renderLaTeX()}
          {renderRMD()}
        </Row>
      </>
    );
  }

  function renderLinux() {
    if (disabledFeatures?.linux) return;
    return (
      <>
        <Section color="orange" icon="linux" isFlyout={isFlyout}>
          Linux
        </Section>

        <Row gutter={gutter} style={newRowStyle}>
          <Col sm={sm} md={md}>
            <Tip
              delayShow={DELAY_SHOW_MS}
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
                delayShow={DELAY_SHOW_MS}
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
          {create_folder != null && (
            <Col sm={sm} md={md}>
              <Tip
                delayShow={DELAY_SHOW_MS}
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
        </Row>
      </>
    );
  }

  function renderServers() {
    if (disabledFeatures?.servers || mode === "flyout") return;

    return (
      <>
        <Section color="red" icon="server" isFlyout={isFlyout}>
          Servers
        </Section>

        <Row gutter={gutter} style={newRowStyle}>
          {computeServersEnabled() && (
            <Col sm={doubleSm} md={doubleMd}>
              <Tip
                delayShow={DELAY_SHOW_MS}
                title={"Create a Compute Server"}
                placement="left"
                icon={"servers"}
                tip={"Affordable GPUs and high-end dedicated virtual machines."}
              >
                <NewFileButton
                  name={"Compute Server: GPUs and VM's"}
                  icon="servers"
                  on_click={() => {
                    projectActions?.setState({ create_compute_server: true });
                    projectActions?.set_active_tab("servers", {
                      change_history: true,
                    });
                  }}
                  size={btnSize}
                />
              </Tip>
            </Col>
          )}

          {projectActions != null && (
            <Col sm={doubleSm} md={doubleMd}>
              <NewFileButton
                size={btnSize}
                name={`Jupyter, VS Code, Pluto, RStudio, etc....`}
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
    );
  }

  function renderTeachingSocial() {
    if (disabledFeatures?.course && disabledFeatures?.chat) return;

    return (
      <>
        <Section color="purple" icon="graduation-cap" isFlyout={isFlyout}>
          Teaching and Social
        </Section>

        <Row gutter={gutter} style={newRowStyle}>
          {!disabledFeatures?.course && (
            <Col sm={doubleSm} md={doubleMd}>
              <Tip
                delayShow={DELAY_SHOW_MS}
                title="Manage a Course"
                placement="bottom"
                icon={NEW_FILETYPE_ICONS.course}
                tip={
                  <>
                    If you are a teacher, click here to create a new course. You
                    can add students and assignments to, and use to
                    automatically create projects for everybody, send
                    assignments to students, collect them, grade them, etc. See{" "}
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
          {!disabledFeatures?.chat && (
            <Col sm={doubleSm} md={doubleMd}>
              <Tip
                delayShow={DELAY_SHOW_MS}
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

          {/*           {!disabledFeatures?.timers && (
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
          )} */}
        </Row>
      </>
    );
  }

  function renderSageWS() {
    if (!availableFeatures.sage) return;

    return (
      <Col sm={sm} md={md}>
        <Tip
          delayShow={DELAY_SHOW_MS}
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
    );
  }

  function renderRMD() {
    if (!availableFeatures.rmd) return;

    return (
      <Col sm={sm} md={md}>
        <Tip
          delayShow={DELAY_SHOW_MS}
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
    );
  }

  function renderLaTeX() {
    if (!availableFeatures.latex) return;

    return (
      <Col sm={sm} md={md}>
        <Tip
          delayShow={DELAY_SHOW_MS}
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
    );
  }

  function renderMarkdown() {
    if (disabledFeatures?.md) return;

    return (
      <>
        <Section color="green" icon="markdown" isFlyout={isFlyout}>
          Markdown
        </Section>
        <Row gutter={gutter} style={newRowStyle}>
          <Col sm={sm} md={md}>
            <Tip
              delayShow={DELAY_SHOW_MS}
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
              delayShow={DELAY_SHOW_MS}
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
              delayShow={DELAY_SHOW_MS}
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
    );
  }

  return (
    <div>
      {renderJupyterNotebook()}
      {renderLinux()}
      {renderServers()}
      {renderTeachingSocial()}
      {renderMarkdown()}
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
