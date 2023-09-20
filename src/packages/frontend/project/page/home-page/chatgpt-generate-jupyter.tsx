/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */
/*
TODO:
- input description box could be Markdown wysiwyg editor
*/

import { Alert, Button, Input, Modal } from "antd";
import { delay } from "awaiting";
import { throttle } from "lodash";
import { CSSProperties, useEffect, useState } from "react";
import {
  redux,
  useActions,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { ChatStream } from "@cocalc/frontend/client/openai";
import {
  A,
  HelpIcon,
  Icon,
  Loading,
  Markdown,
  Paragraph,
  Title,
} from "@cocalc/frontend/components";
import OpenAIAvatar from "@cocalc/frontend/components/openai-avatar";
import ProgressEstimate from "@cocalc/frontend/components/progress-estimate";
import SelectKernel from "@cocalc/frontend/components/run-button/select-kernel";
import type { JupyterEditorActions } from "@cocalc/frontend/frame-editors/jupyter-editor/actions";
import { NotebookFrameActions } from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/actions";
import getKernelSpec from "@cocalc/frontend/jupyter/kernelspecs";
import { StartButton } from "@cocalc/frontend/project/start-button";
import track from "@cocalc/frontend/user-tracking";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { JupyterActions } from "@cocalc/jupyter/redux/actions";
import type { KernelSpec } from "@cocalc/jupyter/types";
import { field_cmp, to_iso_path } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { Block } from "./block";
import ModelSwitch, {
  modelToName,
  Model,
  DEFAULT_MODEL,
} from "@cocalc/frontend/frame-editors/chatgpt/model-switch";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";

const TAG = "generate-jupyter";

const PLACEHOLDER = "Describe your notebook...";

const EXAMPLES: { [language: string]: string } = {
  python:
    "Fit a statistical model to this time series of monthly values: 72, 42, 63, 44, 46, 51, 47, 39, 21, 31, 19, 22. Then plot it with extrapolation.",
  r: "Fit a statistical model to these monthly values: 72, 42, 63, 44, 46, 51, 47, 39, 21, 31, 19, 22. Then plot it.",
  sagemath:
    "Generate a random 5x5 matrix over GF_2 and calculate its determinant.",
} as const;

const DEFAULT_LANG_EXTRA = "Prefer using the standard library.";

const LANG_EXTRA: { [language: string]: string } = {
  python:
    "Prefer using the standard library or the following packages: numpy, matplotlib, pandas, scikit-learn, sympy, scipy, sklearn, seaborn, statsmodels, nltk, tensorflow, pytorch, pymc3, dask, numba, bokeh.",
  r: "Prefer using the standard library or the following: tidyverse, tidyr, stringr, dplyr, data.table, ggplot2, car, mgcv, lme4, nlme, randomForest, survival, glmnet.",
  sagemath: "Use all functions in SageMath.",
} as const;

interface Props {
  project_id: string;
  onSuccess?: () => void;
}

export default function ChatGPTGenerateJupyterNotebook({
  onSuccess,
  project_id,
}: Props) {
  const [model, setModel] = useState<Model>(DEFAULT_MODEL);
  const [kernelSpecs, setKernelSpecs] = useState<KernelSpec[] | null | string>(
    null
  );
  const projectState = useTypedRedux("projects", "project_map")?.getIn([
    project_id,
    "state",
    "state",
  ]);
  useEffect(() => {
    if (projectState != "running") {
      setKernelSpecs("start");
      return;
    }
    (async () => {
      try {
        setKernelSpecs(null);
        const X = await getKernelSpec(project_id);
        X.sort(field_cmp("display_name"));
        setKernelSpecs(X);
        if (spec == null) {
          const name = redux
            .getStore("account")
            .getIn(["editor_settings", "jupyter", "kernel"]);
          if (name != null) {
            for (const a of X) {
              if (a.name == name) {
                setSpec(a);
                break;
              }
            }
          }
        }
      } catch (err) {
        setKernelSpecs(
          "Unable to load Jupyter kernels.  Make sure the project is running and Jupyter is installed."
        );
      }
    })();
  }, [project_id, projectState]);

  const projectActions = useActions({ project_id });
  const current_path = useTypedRedux({ project_id }, "current_path");

  // The name of the selected kernel.  This determines the language, display name and
  // everything else.
  const [spec, setSpec] = useState<KernelSpec | null>(null);

  // User's description of notebook they way to generate.
  const [prompt, setPrompt] = useState<string>("");

  const [querying, setQuerying] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  // A helpful example, in some cases
  const [example, setExample] = useState<string>("");

  useEffect(() => {
    if (spec == null) {
      setExample("");
      return;
    }
    setExample(EXAMPLES[spec.language] ?? "");
  }, [spec]);

  async function generate() {
    if (spec == null) return;
    const input = createInput({ spec, prompt });

    try {
      setQuerying(true);

      const gptStream = webapp_client.openai_client.chatgptStream({
        input,
        project_id,
        path: current_path, // mainly for analytics / metadata -- can't put the actual notebook path since the model outputs that.
        tag: TAG,
        model,
      });

      await updateNotebook(gptStream);
    } catch (err) {
      setError(
        `${err}\n\nOpenAI [status](https://status.openai.com) and [downdetector](https://downdetector.com/status/openai).`
      );
      setQuerying(false);
    }
  }

  async function createNotebook(filenameGPT: string): Promise<string> {
    const filename = sanitizeFilename(filenameGPT);
    // constructs a proto jupyter notebook with the given kernel
    const prefix = current_path ? `${current_path}/` : "";
    const timestamp = getTimestamp();
    const path = `${prefix}${filename}-${timestamp}.ipynb`;
    const nb = {
      cells: [],
      metadata: { kernelspec: spec },
    };

    track("chatgpt", { project_id, path, tag: TAG, type: "generate" });

    // we don't check if the file exists, because the prompt+timestamp should be unique enough
    await webapp_client.project_client.write_text_file({
      project_id,
      path,
      content: JSON.stringify(nb, null, 2),
    });
    return path;
  }

  async function getJupyterFrameActions(
    path
  ): Promise<JupyterEditorActions | null> {
    // first we open the file
    await projectActions?.open_file({
      path,
      foreground: true,
    });
    // and then we try to "activate" it
    for (let i = 0; i < 20; i++) {
      const jupyterFrameActions = redux.getEditorActions(
        project_id,
        path
      ) as JupyterEditorActions;
      if (jupyterFrameActions != null) {
        return jupyterFrameActions;
      } else {
        await delay(500);
      }
    }
    return null;
  }

  async function updateNotebook(gptStream: ChatStream): Promise<void> {
    // local state, modified when more data comes in
    let init = false;
    let ja: JupyterActions | undefined = undefined;
    let jfa: NotebookFrameActions | undefined = undefined;
    let curCell: string = "";
    let numCells: number = 0;

    async function initNotebook(filenameGPT: string) {
      let path = await createNotebook(filenameGPT);
      // Start it running, so user doesn't have to wait... but actions
      // might not be immediately available...
      const jea: JupyterEditorActions | null = await getJupyterFrameActions(
        path
      );
      if (jea == null) {
        throw new Error(`Unable to create Jupyter Notebook for ${path}`);
      }
      ja = jea.jupyter_actions;
      const jfaTmp: NotebookFrameActions | undefined = jea.get_frame_actions();
      if (jfaTmp == null) {
        throw new Error(`Unable to create Jupyter Notebook for ${path}`);
      }
      jfa = jfaTmp;

      // // first cell
      const fistCell = jfa.insert_cell(1);

      const promptIndented =
        prompt
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n") + "\n";

      jfa.set_cell_input(
        fistCell,
        `# ${modelToName(
          model
        )} generated notebook\n\nThis notebook was generated in [CoCalc](https://cocalc.com) by [${modelToName(
          model
        )}](https://chat.openai.com/) using the prompt:\n\n${promptIndented}`
      );
      ja.set_cell_type(fistCell, "markdown");

      // and below we insert an empty cell, ready to be updated in updateCells
      curCell = jfa.insert_cell(1); // insert empty cell below
      numCells += 1;

      // This closes the modal, since we have a notebook now, and it's open, and has some content
      setQuerying(false);
      onSuccess?.();
    }

    const updateCells = throttle(
      // every update interval, we extract all the answer text,
      function (answer) {
        const allCells = splitCells(answer);
        if (jfa == null) {
          console.warn(
            "unable to update cells since jupyter frame actions are not defined"
          );
          return;
        }
        if (ja == null) {
          console.warn(
            "unable to update cells since jupyter actions are not defined"
          );
          return;
        }

        // we always have to update the last cell, even if there are more cells ahead
        jfa.set_cell_input(curCell, allCells[numCells - 1].source.join(""));
        ja.set_cell_type(curCell, allCells[numCells - 1].cell_type);

        if (allCells.length > numCells) {
          // for all new cells, insert them and update lastCell and numCells
          for (let i = numCells; i < allCells.length; i++) {
            curCell = jfa.insert_cell(1); // insert cell below the current one
            jfa.set_cell_input(curCell, allCells[i].source.join(""));
            ja.set_cell_type(curCell, allCells[i].cell_type);
            numCells += 1;
          }
        }
      },
      1000,
      { leading: true, trailing: true }
    );

    let answer = "";
    gptStream.on("token", (token) => {
      if (token != null) {
        answer += token;
        const filenameGPT = getFilename(answer, prompt);
        if (!init && filenameGPT != null) {
          init = true;
          initNotebook(filenameGPT);
        }
        // those are != null if we have a notebook open
        if (ja != null && jfa != null) {
          updateCells(answer);
        }
      } else {
        // we're done
        ja?.delete_all_blank_code_cells();
        ja?.run_all_cells();
      }
    });

    gptStream.on("error", (err) => {
      setError(`${err}`);
      setQuerying(false);
      const error = `# Error generating code cell\n\n\`\`\`\n${err}\n\`\`\`\n\nOpenAI [status](https://status.openai.com) and [downdetector](https://downdetector.com/status/openai).`;
      if (ja == null) {
        // have to make error message without markdown since error isn't markdown.
        // This case happens if we turn on the chatgpt UI, but do not put an openai key in.
        setError(error);
        return;
      }
      ja.set_cell_input(curCell, error);
      ja.set_cell_type(curCell, "markdown");
      ja.set_mode("escape");
      return;
    });

    // after setting up listeners, we start the stream
    gptStream.emit("start");
  }

  if (!redux.getStore("projects").hasOpenAI(project_id)) {
    return null;
  }

  function info() {
    return (
      <HelpIcon title="OpenAI GPT" style={{ float: "right" }}>
        <Paragraph style={{ minWidth: "300px", maxWidth: "500px" }}>
          This sends your requst to{" "}
          <A href={"https://chat.openai.com/"}>{modelToName(model)}</A>, and we
          turn the response into a Jupyter Notebook. Check the result then
          evaluate the cells. Some things might now work on the first try, but
          this should give you some good ideas to help you accomplish your goal.
          If it does not work, try again with a better prompt, ask in chat, and
          ask for suggested fixes.
        </Paragraph>
      </HelpIcon>
    );
  }

  const input = createInput({ spec, prompt });

  return (
    <Block style={{ padding: "0 15px" }}>
      <Title level={4}>
        <OpenAIAvatar size={30} /> Create Notebook Using{" "}
        <ModelSwitch
          model={model}
          setModel={setModel}
          style={{ marginTop: "-7.5px" }}
        />
        {info()}
      </Title>
      {typeof kernelSpecs == "string" && (
        <Alert
          description={
            kernelSpecs == "start" ? (
              <StartButton />
            ) : (
              kernelSpecs
            )
          }
          type="info"
          showIcon
        />
      )}
      {kernelSpecs == null && <Loading />}
      {typeof kernelSpecs == "object" && kernelSpecs != null && (
        <>
          <Paragraph>
            Generate a Jupyter Notebook using the following Jupyter kernel:
          </Paragraph>
          <Paragraph>
            <SelectKernel
              placeholder="Select a kernel..."
              size="large"
              disabled={querying}
              project_id={project_id}
              kernelSpecs={kernelSpecs}
              style={{ width: "100%", maxWidth: "350px" }}
              onSelect={(value) => {
                if (kernelSpecs == null || typeof kernelSpecs != "object")
                  return;
                for (const spec of kernelSpecs) {
                  if (spec.name == value) {
                    setSpec(spec);
                    break;
                  }
                }
              }}
              kernel={spec?.name}
            />
          </Paragraph>
          {spec != null && (
            <>
              <Paragraph>
                Provide a detailed description of the notebook you want to
                create:
              </Paragraph>
              <Paragraph>
                <Input.TextArea
                  allowClear
                  autoSize={{ minRows: 3, maxRows: 6 }}
                  maxLength={3000}
                  placeholder={PLACEHOLDER}
                  value={prompt}
                  disabled={querying}
                  onChange={({ target: { value } }) => setPrompt(value)}
                  onPressEnter={(e) => {
                    if (e.shiftKey) {
                      generate();
                    }
                  }}
                />
                <br />
                {!error && example && (
                  <div style={{ color: COLORS.GRAY_D, marginTop: "15px" }}>
                    Example: <i>"{example}"</i>
                  </div>
                )}
              </Paragraph>
              {!error && (
                <Paragraph style={{ textAlign: "center" }}>
                  <Button
                    type="primary"
                    size="large"
                    onClick={generate}
                    disabled={querying || !prompt?.trim() || !spec}
                  >
                    <Icon name="paper-plane" /> Create Notebook using{" "}
                  {modelToName(model)} (shift+enter)
                  </Button>
                </Paragraph>
              )}
              {!error && querying && <ProgressEstimate seconds={30} />}
              {error && (
                <Alert
                  closable
                  onClose={() => {
                    setError("");
                  }}
                  showIcon
                  type="error"
                  message="Error"
                  description={<Markdown value={error} />}
                />
              )}
              {input && (
                <div>
                  The following will be sent to {modelToName(model)}:
                  <StaticMarkdown
                    value={input}
                    style={{
                      border: "1px solid lightgrey",
                      borderRadius: "5px",
                      margin: "5px 0",
                      padding: "5px",
                    }}
                  />
                </div>
              )}
              {!error && querying && <ProgressEstimate seconds={30} />}
            </>
          )}
        </>
      )}
    </Block>
  );
}

/**
 * The text string contains markdown text with code blocks. This split this into cells of type markdown and code.
 */
function splitCells(
  text: string
): { cell_type: "markdown" | "code"; source: string[] }[] {
  const ret: { cell_type: "markdown" | "code"; source: string[] }[] = [];

  let lines = text.split("\n");
  let cell_type: "markdown" | "code" = "markdown";
  let source: string[] = [];
  for (const line of lines) {
    if (line.startsWith("filename:")) continue;
    if (line.startsWith("```")) {
      stripTrailingWhitespace(source);
      if (source.length > 0) {
        ret.push({ cell_type, source });
        source = [];
      }
      cell_type = cell_type == "markdown" ? "code" : "markdown";
    } else {
      source.push(`${line}\n`);
    }
  }

  stripTrailingWhitespace(source);
  if (source.length > 0) {
    ret.push({ cell_type, source });
  }

  return ret;
}

function stripTrailingWhitespace(source: string[]) {
  // remove trailing blank lines.
  let i = source.length - 1;
  while (i >= 0 && !source[i].trim()) {
    i -= 1;
    source.splice(-1); // deletes the last entry in place!
  }
  // also remove only trailing whitespace from last line
  if (source.length > 0) {
    source[source.length - 1] = source[source.length - 1].trimRight();
  }
}

export function ChatGPTGenerateNotebookButton({
  project_id,
  style,
}: {
  project_id: string;
  style?: CSSProperties;
}) {
  const [show, setShow] = useState<boolean>(false);
  if (!redux.getStore("projects").hasOpenAI(project_id)) {
    return null;
  }
  const handleCancel = () => {
    setShow(false);
  };

  return (
    <>
      <Button onClick={() => setShow(true)} style={style}>
        Generate Jupyter Notebook...
      </Button>
      <Modal
        title="Generate Jupyter Notebook"
        width={600}
        open={show}
        onCancel={handleCancel}
        footer={null}
      >
        <ChatGPTGenerateJupyterNotebook
          project_id={project_id}
          onSuccess={() => setShow(false)}
        />
      </Modal>
    </>
  );
}

function sanitizeFilename(text: string): string {
  text = text.trim().split("\n").shift() ?? "";
  text = text.replace(/["']/g, "");
  // remove ending, we'll add it back later
  text = text.replace(/\.ipynb/, "");

  // if there is a "filename:" in the text, remove everything until after it
  const i = text.indexOf("filename:");
  if (i >= 0) {
    text = text.slice(i + "filename:".length);
  }

  text = text
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9-_]/g, "")
    .trim()
    .slice(0, 64);

  return text;
}

function getTimestamp(): string {
  return to_iso_path(new Date());
}

function getFilename(text: string, prompt: string): string | null {
  // we give up if there are more than 5 lines
  if (text.split("\n").length > 3) {
    return sanitizeFilename(prompt.split("\n").join("_"));
  }
  // use regex to search for '"filename: [filename]"'
  const match = text.match(/"filename: (.*)"/);
  if (match == null) return null;
  return sanitizeFilename(match[1]);
}

function createInput({ spec, prompt }): string {
  if (spec == null || !prompt?.trim()) return "";
  const langExtra = LANG_EXTRA[spec.language] ?? DEFAULT_LANG_EXTRA;

  return `Explain directly and to the point, how to do the following task in the programming language "${spec.display_name}", which I will be using in a Jupyter notebook. ${langExtra} Break down all blocks of code into small snippets and wrap each one in triple backticks. Explain each snippet with a concise description, but do not tell me what the output will be. Skip formalities. Do not add a summary. Do not put it all together. Suggest a filename by starting with "filename: [filename]".\n\n${prompt}`;
}
