/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Col, Flex, Modal, Row, Tag } from "antd";
import { Gutter } from "antd/es/grid/row";
import type { ReactNode } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { Available } from "@cocalc/comm/project-configuration";
import { CSS } from "@cocalc/frontend/app-framework";
import { A } from "@cocalc/frontend/components/A";
import { Icon, isIconName } from "@cocalc/frontend/components/icon";
import { Tip } from "@cocalc/frontend/components/tip";
import { computeServersEnabled } from "@cocalc/frontend/compute/config";
import { labels } from "@cocalc/frontend/i18n";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { Ext } from "@cocalc/frontend/project/page/home-page/ai-generate-examples";
import { ProjectActions } from "@cocalc/frontend/project_actions";
import { AIGenerateDocumentButton } from "../page/home-page/ai-generate-document";
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
  filenameChanged?: boolean;
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
  filenameChanged,
}: Props) {
  const { project_id } = useProjectContext();
  const intl = useIntl();

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
        <Section color="blue" icon="jupyter" isFlyout={isFlyout}>
          Popular Documents
        </Section>
        <Row gutter={gutter} style={newRowStyle}>
          <JupyterNotebookButtons
            mode={mode}
            availableFeatures={availableFeatures}
            create_file={create_file}
            btnSize={btnSize}
            btnActive={btnActive}
            grid={[sm, md]}
            filename={filename}
            filenameChanged={filenameChanged}
            makeNewFilename={() => makeNewFilename?.("ipynb")}
            after={
              /* Those come after the main button, then the additional jupyter notebooks – to avoid jumpyness */
              [renderLaTeX(), renderQuarto(), renderMD()]
            }
          />
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
              title={intl.formatMessage(labels.linux_terminal)}
              icon={NEW_FILETYPE_ICONS.term}
              tip={intl.formatMessage({
                id: "new.file-type-selector.linux.tooltip",
                defaultMessage:
                  "Create a command line Linux terminal.  CoCalc includes a full Linux environment.  Run command line software, vim, emacs and more.",
              })}
            >
              <NewFileButton
                name={intl.formatMessage(labels.linux_terminal)}
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
                title={intl.formatMessage(labels.x11_desktop)}
                icon={NEW_FILETYPE_ICONS.x11}
                tip={intl.formatMessage({
                  id: "new.file-type-selector.x11.tooltip",
                  defaultMessage:
                    "Create an X11 desktop for running graphical applications. CoCalc lets you collaboratively run any graphical Linux application in your browser.",
                })}
              >
                <NewFileButton
                  name={intl.formatMessage(labels.x11_desktop)}
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
                title={intl.formatMessage({
                  id: "new.file-type-selector.folder.title",
                  defaultMessage: "Create New Folder",
                })}
                placement="left"
                icon={NEW_FILETYPE_ICONS["/"]}
                tip={intl.formatMessage({
                  id: "new.file-type-selector.folder.tooltip",
                  defaultMessage:
                    "Create a folder (subdirectory) in which to store and organize your files.  CoCalc provides a full featured filesystem.  You can also type a path in the input box above that ends with a forward slash / and press enter.",
                })}
              >
                <NewFileButton
                  ext="/"
                  name={intl.formatMessage({
                    id: "project.new.file-type-selector.new.label",
                    defaultMessage: "New Folder",
                    description:
                      "short label of a button to create a new folder in a file-system",
                  })}
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
                icon={"cloud"}
                tip={"Affordable GPUs and high-end dedicated virtual machines."}
              >
                <NewFileButton
                  name={"Compute Server: GPUs and VM's"}
                  icon="servers"
                  on_click={() => {
                    projectActions?.setServerTab("compute-servers");
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
                name={`JupyterLab, VS Code, Pluto, R IDE, etc....`}
                ext="server"
                on_click={() => {
                  projectActions?.setServerTab("notebooks");
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

    const label = intl.formatMessage({
      id: "project.new.file-type-selector.course.label",
      defaultMessage: "Manage a Course",
      description:
        "short label on a button to create a course management environment",
    });

    return (
      <>
        <Section color="purple" icon="graduation-cap" isFlyout={isFlyout}>
          Teaching and Chat
        </Section>

        <Row gutter={gutter} style={newRowStyle}>
          {!disabledFeatures?.course && (
            <Col sm={doubleSm} md={doubleMd}>
              <Tip
                delayShow={DELAY_SHOW_MS}
                title={label}
                placement="bottom"
                icon={NEW_FILETYPE_ICONS.course}
                tip={
                  <FormattedMessage
                    id="project.new.file-type-selector.course.tooltip"
                    defaultMessage={`If you are a teacher, click here to create a new course.
                    You can add students and assignments to, and use to automatically create projects for everybody,
                    send assignments to students, collect them, grade them, etc.
                    See <A>documentation</A> to learn more.`}
                    values={{
                      A: (c) => (
                        <A href="https://doc.cocalc.com/teaching-instructors.html">
                          {c}
                        </A>
                      ),
                    }}
                  />
                }
              >
                <NewFileButton
                  name={label}
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
                title={intl.formatMessage({
                  id: "project.new.file-type-selector.chatroom.title",
                  defaultMessage: "Create a Chatroom",
                })}
                placement="bottom"
                icon={NEW_FILETYPE_ICONS["sage-chat"]}
                tip={
                  <FormattedMessage
                    id="project.new.file-type-selector.chatroom.tooltip"
                    defaultMessage={`Create a chatroom for chatting with collaborators on this project.
                      You can also embed and run computations in chat messages.
                      See <A>documentation</A> to learn more.`}
                    values={{
                      A: (c) => (
                        <A href="https://doc.cocalc.com/chat.html">{c}</A>
                      ),
                    }}
                  />
                }
              >
                <NewFileButton
                  name={intl.formatMessage(labels.chatroom)}
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

    function handleClick(ext) {
      Modal.confirm({
        icon: <Icon name="exclamation-circle" />,
        title: intl.formatMessage({
          id: "project.new.file-type-selector.sagews.modal.title",
          defaultMessage: "SageMath Worksheets are Deprecated",
        }),
        content: intl.formatMessage({
          id: "project.new.file-type-selector.sagews.modal.content",
          defaultMessage:
            "Consider creating a Jupyter Notebook and use a SageMath Kernel (use the 'SageMath Notebook' button). You can also convert existing SageMath Worksheets to Jupyter Notebooks by opening the worksheet and clicking 'Jupyter'.",
        }),
        okText: intl.formatMessage({
          id: "project.new.file-type-selector.sagews.modal.ok",
          defaultMessage: "Create SageMath Worksheet Anyways",
        }),
        onOk: (close) => {
          create_file(ext);
          close();
        },
        closable: true,
      });
    }

    return (
      <Col sm={sm} md={md}>
        <Tip
          delayShow={DELAY_SHOW_MS}
          icon={NEW_FILETYPE_ICONS.sagews}
          title={intl.formatMessage(labels.sagemath_worksheet)}
          tip={intl.formatMessage({
            id: "new.file-type-selector.sagews.tooltip",
            defaultMessage:
              "Create an interactive worksheet for using the SageMath mathematical software, Python, R, and many other systems.  Do sophisticated mathematics, draw plots, compute integrals, work with matrices, etc.",
          })}
        >
          <NewFileButton
            name={intl.formatMessage(labels.sagemath_worksheet)}
            on_click={handleClick}
            ext="sagews"
            size={btnSize}
            active={btnActive("sagews")}
          />
        </Tip>
      </Col>
    );
  }

  function addAiDocGenerate(btn: JSX.Element, ext: Ext) {
    if (isFlyout) {
      return (
        <Col sm={sm} md={md} key={`with-ai-${ext}`}>
          <Flex align="flex-start" vertical={false} gap={"5px"}>
            <Flex flex={"1 1 auto"}>{btn}</Flex>
            <Flex flex={"0 0 auto"}>
              <AIGenerateDocumentButton
                project_id={project_id}
                mode="flyout"
                ext={ext}
                filename={filenameChanged ? filename : undefined}
              />
            </Flex>
          </Flex>
        </Col>
      );
    } else {
      return (
        <Col sm={sm} md={md} key={`with-ai-${ext}`}>
          {btn}
          <AIGenerateDocumentButton
            project_id={project_id}
            mode="full"
            ext={ext}
            filename={filenameChanged ? filename : undefined}
          />
        </Col>
      );
    }
  }

  function renderQuarto() {
    if (mode !== "flyout") return null;
    if (!availableFeatures.qmd) return null;

    const btn = (
      <Tip
        key="quarto-button"
        delayShow={DELAY_SHOW_MS}
        title="Quarto File"
        icon={NEW_FILETYPE_ICONS.qmd}
        tip="Quarto document with real-time preview."
        style={mode === "flyout" ? { flex: "1 1 auto" } : undefined}
      >
        <NewFileButton
          name="Quarto"
          on_click={create_file}
          ext="qmd"
          size={btnSize}
          active={btnActive("qmd")}
        />
      </Tip>
    );

    return addAiDocGenerate(btn, "qmd");
  }

  function renderLaTeX() {
    if (!availableFeatures.latex) return null;

    const btn = (
      <Tip
        key="latex-button"
        delayShow={DELAY_SHOW_MS}
        title={intl.formatMessage(labels.latex_document)}
        icon={NEW_FILETYPE_ICONS.tex}
        tip={intl.formatMessage({
          id: "new.file-type-selector.latex.tooltip",
          defaultMessage:
            "Create a professional quality technical paper that contains sophisticated mathematical formulas and can run Python, R and Sage code.",
        })}
        style={mode === "flyout" ? { flex: "1 1 auto" } : undefined}
      >
        <NewFileButton
          name={intl.formatMessage(labels.latex_document)}
          on_click={create_file}
          ext="tex"
          size={btnSize}
          active={btnActive("tex")}
        />
      </Tip>
    );
    return addAiDocGenerate(btn, "tex");
  }

  function renderMD() {
    const btn = (
      <Tip
        key="markdown-button"
        delayShow={DELAY_SHOW_MS}
        title="Computational Markdown Document"
        icon={NEW_FILETYPE_ICONS.md}
        tip={intl.formatMessage({
          id: "new.file-type-selector.markdown.tooltip",
          defaultMessage:
            "Create a rich editable text document backed by markdown and Jupyter code that contains mathematical formulas, lists, headings, images and run code.",
        })}
        style={mode === "flyout" ? { flex: "1 1 auto" } : undefined}
      >
        <NewFileButton
          name="Markdown"
          on_click={create_file}
          ext="md"
          size={btnSize}
          active={btnActive("md")}
        />
      </Tip>
    );

    return addAiDocGenerate(btn, "md");
  }

  function renderMarkdown() {
    if (disabledFeatures?.md) return;

    const labelSlides = intl.formatMessage({
      id: "new.file-type-selector.slides.title",
      defaultMessage: "Slides",
      description: "Short label on a button to create a new slideshow file",
    });

    return (
      <>
        <Section color="green" icon="markdown" isFlyout={isFlyout}>
          Miscellaneous Documents
        </Section>
        <Row gutter={gutter} style={newRowStyle}>
          {availableFeatures.rmd &&
            addAiDocGenerate(
              <Tip
                delayShow={DELAY_SHOW_MS}
                title="RMarkdown File"
                icon={NEW_FILETYPE_ICONS.rmd}
                tip="RMarkdown document with real-time preview."
                style={mode === "flyout" ? { flex: "1 1 auto" } : undefined}
              >
                <NewFileButton
                  name="RMarkdown"
                  on_click={create_file}
                  ext="rmd"
                  size={btnSize}
                  active={btnActive("rmd")}
                />
              </Tip>,
              "rmd",
            )}
          <Col sm={sm} md={md}>
            <Tip
              icon={NEW_FILETYPE_ICONS.board}
              title={intl.formatMessage({
                id: "new.file-type-selector.whiteboard.title",
                defaultMessage: "Computational Whiteboard",
                description:
                  "Short label on a button to create a new whiteboard file",
              })}
              tip={intl.formatMessage({
                id: "new.file-type-selector.whiteboard.tooltip",
                defaultMessage:
                  "Create a computational whiteboard with mathematical formulas, lists, headings, images and Jupyter code cells.",
              })}
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
              title={labelSlides}
              tip={intl.formatMessage({
                id: "new.file-type-selector.slides.tooltip",
                defaultMessage:
                  "Create a slideshow presentation with mathematical formulas, lists, headings, images and code cells.",
              })}
            >
              <NewFileButton
                name={labelSlides}
                on_click={create_file}
                ext="slides"
                size={btnSize}
                active={btnActive("slides")}
              />
            </Tip>
          </Col>
          {renderSageWS()}
        </Row>
      </>
    );
  }

  function renderUtilities() {
    const labelTaskList = intl.formatMessage({
      id: "new.file-type-selector.tasks.label",
      defaultMessage: "Task List",
    });

    const labelStopWatchTimer = intl.formatMessage({
      id: "project.new.file-type-selector.timers.label",
      defaultMessage: "Stopwatch and Timer",
    });

    return (
      <>
        <Section color="yellow" icon="wrench" isFlyout={isFlyout}>
          Utilities
        </Section>
        <Row gutter={gutter} style={newRowStyle}>
          <Col sm={doubleSm} md={doubleMd}>
            <Tip
              delayShow={DELAY_SHOW_MS}
              title={labelTaskList}
              icon={NEW_FILETYPE_ICONS.tasks}
              tip={intl.formatMessage({
                id: "new.file-type-selector.tasks.tooltip",
                defaultMessage:
                  "Create a task list to keep track of everything you are doing on a project.  Put #hashtags in the item descriptions and set due dates.  Run code.",
              })}
            >
              <NewFileButton
                name={labelTaskList}
                on_click={create_file}
                ext="tasks"
                size={btnSize}
                active={btnActive("tasks")}
              />
            </Tip>
          </Col>
          {!disabledFeatures?.timers && (
            <Col sm={doubleSm} md={doubleMd}>
              <Tip
                delayShow={DELAY_SHOW_MS}
                title={labelStopWatchTimer}
                icon={NEW_FILETYPE_ICONS.time}
                tip={intl.formatMessage({
                  id: "project.new.file-type-selector.timers.tooltip",
                  defaultMessage:
                    "Create collaborative stopwatches and timers to keep track of how long it takes to do something.",
                })}
              >
                <NewFileButton
                  name={labelStopWatchTimer}
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
    );
  }

  return (
    <div>
      {renderJupyterNotebook()}
      {renderLinux()}
      {renderMarkdown()}
      {renderTeachingSocial()}
      {renderServers()}
      {renderUtilities()}
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
  icon: string;
  style?: CSS;
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
        icon={isIconName(icon) && <Icon name={icon} />}
        color={color}
        style={{ fontSize: "11pt" }}
      >
        {children}
      </Tag>
    </div>
  );
}
