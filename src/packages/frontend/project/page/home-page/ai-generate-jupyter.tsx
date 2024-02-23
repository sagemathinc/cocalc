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
import { useEffect, useState } from "react";

import { useLanguageModelSetting } from "@cocalc/frontend/account/useLanguageModelSetting";
import {
  CSS,
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
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import { LanguageModelVendorAvatar } from "@cocalc/frontend/components/language-model-icon";
import ProgressEstimate from "@cocalc/frontend/components/progress-estimate";
import SelectKernel from "@cocalc/frontend/components/run-button/select-kernel";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import type { JupyterEditorActions } from "@cocalc/frontend/frame-editors/jupyter-editor/actions";
import { NotebookFrameActions } from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/actions";
import ModelSwitch, {
  modelToName,
} from "@cocalc/frontend/frame-editors/llm/model-switch";
import { splitCells } from "@cocalc/frontend/jupyter/chatgpt/split-cells";
import getKernelSpec from "@cocalc/frontend/jupyter/kernelspecs";
import { StartButton } from "@cocalc/frontend/project/start-button";
import track from "@cocalc/frontend/user-tracking";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { JupyterActions } from "@cocalc/jupyter/redux/actions";
import type { KernelSpec } from "@cocalc/jupyter/types";
import { once } from "@cocalc/util/async-utils";
import {
  getVendorStatusCheckMD,
  model2vendor,
} from "@cocalc/util/db-schema/llm";
import { field_cmp, to_iso_path } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { ensure_project_running } from "../../project-start-warning";
import { Block } from "./block";

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

export default function AIGenerateJupyterNotebook({
  onSuccess,
  project_id,
}: Props) {
  const [model, setModel] = useLanguageModelSetting();
  const [kernelSpecs, setKernelSpecs] = useState<KernelSpec[] | null | string>(
    null,
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
          "Unable to load Jupyter kernels.  Make sure the project is running and Jupyter is installed.",
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

      const llmStream = webapp_client.openai_client.languageModelStream({
        input,
        project_id,
        path: current_path, // mainly for analytics / metadata -- can't put the actual notebook path since the model outputs that.
        tag: TAG,
        model,
      });

      await updateNotebook(llmStream);
    } catch (err) {
      setError(`${err}\n\n${getVendorStatusCheckMD(model2vendor(model))}.`);
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

    if (
      !(await ensure_project_running(
        project_id,
        `create the jupyter notebook '${path}'`,
      ))
    ) {
      throw new Error(`Unable to create Jupyter Notebook for ${path}`);
    }

    // we don't check if the file exists, because the prompt+timestamp should be unique enough
    await webapp_client.project_client.write_text_file({
      project_id,
      path,
      content: JSON.stringify(nb, null, 2),
    });
    return path;
  }

  async function getJupyterFrameActions(
    path,
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
        path,
      ) as JupyterEditorActions;
      if (jupyterFrameActions != null) {
        return jupyterFrameActions;
      } else {
        await delay(500);
      }
    }
    return null;
  }

  async function updateNotebook(llmStream: ChatStream): Promise<void> {
    // local state, modified when more data comes in
    let init = false;
    let answer = "";
    let ja: JupyterActions | undefined = undefined;
    let jfa: NotebookFrameActions | undefined = undefined;
    let curCell: string = "";
    let numCells: number = 0;

    async function initNotebook(filenameGPT: string) {
      let path = await createNotebook(filenameGPT);
      // Start it running, so user doesn't have to wait... but actions
      // might not be immediately available...
      const jea: JupyterEditorActions | null = await getJupyterFrameActions(
        path,
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

      // first cell
      const fistCell = jfa.insert_cell(1);

      const promptIndented =
        prompt
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n") + "\n";

      jfa.set_cell_input(
        fistCell,
        `# ${modelToName(
          model,
        )} generated notebook\n\nThis notebook was generated in [CoCalc](https://cocalc.com) by [${modelToName(
          model,
        )}](https://chat.openai.com/) using the prompt:\n\n${promptIndented}`,
      );
      ja.set_cell_type(fistCell, "markdown");

      // and below we insert an empty cell, ready to be updated in updateCells
      curCell = jfa.insert_cell(1); // insert empty cell below
      numCells += 1;

      // This closes the modal, since we have a notebook now, and it's open, and has some content
      setQuerying(false);
      onSuccess?.();
    }

    // every update interval, we extract all the answer text into cells
    // ATTN: do not call this concurrently, see throttle below
    function updateCells(answer) {
      const allCells = splitCells(answer, (line) =>
        line.startsWith("filename:"),
      );
      if (jfa == null) {
        console.warn(
          "unable to update cells since jupyter frame actions are not defined",
        );
        return;
      }
      if (ja == null) {
        console.warn(
          "unable to update cells since jupyter actions are not defined",
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
    }

    // NOTE: as of writing this, PaLM returns everything at once. Hence this must be robust for
    // the case of one token callback with everything and then "null" to indicate it is done.
    // OTOH, ChatGPT will stream a lot of tokens at a high frequency.
    const processTokens = throttle(
      async function (answer: string, finalize: boolean) {
        const fn = getFilename(answer, prompt);
        if (!init && fn != null) {
          init = true;
          // this kicks off creating the notebook and opening it
          initNotebook(fn);
        }

        // This finalize step is important for PaLM (which isn't streamining), because
        // only here the entire text of the notbeook is processed once at the very end.
        if (finalize) {
          if (!init) {
            // we never got a filename, so we create one based on the prompt and create the notebook
            const fn: string = sanitizeFilename(prompt.split("\n").join("_"));
            await initNotebook(fn);
          }

          // we wait for up to 1 minute to create the notebook
          let t0 = Date.now();
          while (true) {
            if (ja != null && jfa != null) break;
            await delay(100);
            if (Date.now() - t0 > 60 * 1000) {
              throw new Error(
                "Unable to create Jupyter Notebook.  Please try again.",
              );
            }
          }

          // we check if the notebook is ready – and await its ready state
          if (ja.syncdb.get_state() !== "ready") {
            await once(ja.syncdb, "ready");
          }

          // now, we're sure the notebook is ready → final push to update the entire notebook
          updateCells(answer);

          // and after we're done, cleanup and run all cells
          ja.delete_all_blank_code_cells();
          ja.run_all_cells();
        } else {
          // we have a partial answer. update the notebook in real-time, if it exists
          // if those are != null, initNotebook started to crate it, and we check if it is ready for us to update
          if (ja != null && jfa != null) {
            if (ja.syncdb.get_state() === "ready") {
              updateCells(answer);
            }
          }
        }
      },
      1000,
      {
        leading: false,
        trailing: true,
      },
    );

    llmStream.on("token", async (token: string | null) => {
      // important: processTokens must not be called in parallel and also once at the very end
      if (token != null) {
        answer += token;
        processTokens(answer, false);
      } else {
        // token == null signals the end of the stream
        processTokens(answer, true);
      }
    });

    llmStream.on("error", (err) => {
      setError(`${err}`);
      setQuerying(false);
      const error = `# Error generating code cell\n\n\`\`\`\n${err}\n\`\`\`\n\n${getVendorStatusCheckMD(
        model2vendor(model),
      )}.`;
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
    llmStream.emit("start");
  }

  if (!redux.getStore("projects").hasLanguageModelEnabled(project_id)) {
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
        <LanguageModelVendorAvatar model={model} /> Create Notebook Using{" "}
        <ModelSwitch
          project_id={project_id}
          model={model}
          setModel={setModel}
          style={{ marginTop: "-7.5px" }}
        />
        {info()}
      </Title>
      {typeof kernelSpecs == "string" && (
        <Alert
          description={kernelSpecs == "start" ? <StartButton /> : kernelSpecs}
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

export function AIGenerateNotebookButton({
  project_id,
  style,
}: {
  project_id: string;
  style?: CSS;
}) {
  const [show, setShow] = useState<boolean>(false);

  if (!redux.getStore("projects").hasLanguageModelEnabled(project_id)) {
    return null;
  }

  const btnStyle: CSS = {
    width: "100%",
    overflowX: "hidden",
    whiteSpace: "nowrap",
    ...style,
  } as const;

  return (
    <>
      <Button onClick={() => setShow(true)} style={btnStyle}>
        <AIAvatar size={14} style={{ position: "unset", marginRight: "5px" }} />{" "}
        Assistant
      </Button>
      <Modal
        title="Create Jupyter Notebook using AI"
        width={600}
        open={show}
        onCancel={() => setShow(false)}
        footer={null}
      >
        <AIGenerateJupyterNotebook
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

function getFilename(text: string | null, prompt: string): string | null {
  // we give up if there are more than 5 lines
  if (text == null || text.split("\n").length > 3) {
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
