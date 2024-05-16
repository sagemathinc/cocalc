/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */
/*
TODO:
- input description box could be Markdown wysiwyg editor
*/

import type { MenuProps } from "antd";
import { Alert, Button, Dropdown, Flex, Input, Modal, Space, Tag } from "antd";

import { delay } from "awaiting";
import { debounce, isEmpty, throttle } from "lodash";
import { useEffect, useState } from "react";

import { useLanguageModelSetting } from "@cocalc/frontend/account/useLanguageModelSetting";
import {
  CSS,
  redux,
  useActions,
  useAsyncEffect,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { ChatStream } from "@cocalc/frontend/client/llm";
import {
  A,
  Icon,
  Loading,
  Markdown,
  Paragraph,
} from "@cocalc/frontend/components";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import ProgressEstimate from "@cocalc/frontend/components/progress-estimate";
import SelectKernel from "@cocalc/frontend/components/run-button/select-kernel";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import type { JupyterEditorActions } from "@cocalc/frontend/frame-editors/jupyter-editor/actions";
import { NotebookFrameActions } from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/actions";
import LLMSelector, {
  modelToName,
} from "@cocalc/frontend/frame-editors/llm/llm-selector";
import getKernelSpec from "@cocalc/frontend/jupyter/kernelspecs";
import { splitCells } from "@cocalc/frontend/jupyter/llm/split-cells";
import { LLMCostEstimation } from "@cocalc/frontend/misc/llm-cost-estimation";
import { LLMEvent } from "@cocalc/frontend/project/history/types";
import { STYLE as NEW_FILE_STYLE } from "@cocalc/frontend/project/new/new-file-button";
import { ensure_project_running } from "@cocalc/frontend/project/project-start-warning";
import { StartButton } from "@cocalc/frontend/project/start-button";
import track from "@cocalc/frontend/user-tracking";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { JupyterActions } from "@cocalc/jupyter/redux/actions";
import type { KernelSpec } from "@cocalc/jupyter/types";
import { once } from "@cocalc/util/async-utils";
import {
  getLLMServiceStatusCheckMD,
  model2vendor,
} from "@cocalc/util/db-schema/llm-utils";
import { field_cmp, getRandomColor } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { Example, JUPYTER } from "./ai-generate-examples";
import {
  getFilename,
  getTimestamp,
  sanitizeFilename,
} from "./ai-generate-utils";

const TAG = "generate-jupyter";

const PLACEHOLDER = "Describe your notebook...";

const DEFAULT_LANG_EXTRA = "Prefer using the standard library.";

const LANG_EXTRA: { [language: string]: string } = {
  python:
    "Prefer using the standard library or the following packages: numpy, matplotlib, pandas, scikit-learn, sympy, scipy, sklearn, seaborn, statsmodels, nltk, tensorflow, pytorch, pymc3, dask, numba, bokeh.",
  r: "Prefer using the standard library or the following packages: tidyverse, tidyr, stringr, dplyr, data.table, ggplot2, car, mgcv, lme4, nlme, randomForest, survival, glmnet.",
  sagemath: "Use all functions in SageMath.",
  julia: "Use function from the standard library only.",
} as const;

interface Props {
  project_id: string;
  onSuccess?: () => void;
}

export default function AIGenerateJupyterNotebook({
  onSuccess,
  project_id,
}: Props) {
  const [model, setModel] = useLanguageModelSetting(project_id);
  const [tokens, setTokens] = useState<number>(0);

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
  const [examples, setExamples] = useState<Example[]>([]);

  useEffect(() => {
    if (spec == null) {
      setExamples([]);
      return;
    }
    setExamples(JUPYTER[spec.language?.toLowerCase()] ?? "");
  }, [spec]);

  async function generate() {
    if (spec == null) return;
    const input = createInput({ spec, prompt });

    try {
      setQuerying(true);

      const llmStream = webapp_client.openai_client.queryStream({
        input,
        project_id,
        path: current_path, // mainly for analytics / metadata -- can't put the actual notebook path since the model outputs that.
        tag: TAG,
        model,
      });

      await updateNotebook(llmStream);
    } catch (err) {
      setError(`${err}\n\n${getLLMServiceStatusCheckMD(model2vendor(model))}.`);
      setQuerying(false);
    }
  }

  async function createNotebook(filenameLLM: string): Promise<string> {
    const filename = sanitizeFilename(filenameLLM, "ipynb");
    // constructs a proto jupyter notebook with the given kernel
    const prefix = current_path ? `${current_path}/` : "";
    const timestamp = getTimestamp();
    const path = `${prefix}${filename}-${timestamp}.ipynb`;
    const nb = {
      cells: [],
      metadata: { kernelspec: spec },
    };

    track("chatgpt", { project_id, path, tag: TAG, type: "generate" });

    // log this in the project as well
    const event: LLMEvent = {
      event: "llm",
      usage: "jupyter-generate-notebook",
      model,
      path,
    };
    projectActions?.log(event);

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

    // NOTE: as of writing this, quick models return everything at once. Hence this must be robust for
    // the case of one token callback with everything and then "null" to indicate it is done.
    const processTokens = throttle(
      async function (answer: string, finalize: boolean) {
        const fn = getFilename(answer, prompt, 'ipynb');
        if (!init && fn != null) {
          init = true;
          // this kicks off creating the notebook and opening it
          await initNotebook(fn);
        }

        // This finalize step is important, especially in case we have not gotten a filename yet
        if (finalize) {
          if (!init) {
            // we never got a filename, so we create one based on the prompt and create the notebook
            const fn: string = sanitizeFilename(
              prompt.split("\n").join("_"),
              "ipynb",
            );
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
      const error = `# Error generating code cell\n\n\`\`\`\n${err}\n\`\`\`\n\n${getLLMServiceStatusCheckMD(
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

  const input = createInput({ spec, prompt });

  useEffect(() => {
    if (tokens > 0 && input == "") setTokens(0);
  }, [input]);

  useAsyncEffect(
    debounce(
      async () => {
        if (input == "") return;

        // do not import until needed -- it is HUGE!
        const { getMaxTokens, numTokensUpperBound } = await import(
          "@cocalc/frontend/misc/llm"
        );

        const tokens = numTokensUpperBound(prompt, getMaxTokens(model));

        setTokens(tokens);
      },
      3000,
      { leading: false, trailing: true },
    ),
    [input],
  );

  function renderExamples() {
    const items: MenuProps["items"] = examples.map((ex, idx) => {
      const label = (
        <Flex gap={"5px"} justify="space-between">
          <Flex>{ex[0]} </Flex>
          <Flex>
            {ex[2].map((tag) => (
              <Tag key={tag} color={getRandomColor(tag)}>
                {tag}
              </Tag>
            ))}
          </Flex>
        </Flex>
      );

      return {
        key: `${idx}`,
        label,
        onClick: () => setPrompt(ex[1]),
      };
    });
    return (
      <Paragraph>
        <Dropdown menu={{ items }} trigger={["click"]}>
          <Button style={{ width: "100%" }}>
            <Space>
              <Icon name="magic" />
              Pick an example
              <Icon name="caret-down" />
            </Space>
          </Button>
        </Dropdown>
      </Paragraph>
    );
  }

  return (
    <div style={{ padding: "0 15px" }}>
      <Paragraph strong>
        Select language model:{" "}
        <LLMSelector
          project_id={project_id}
          model={model}
          setModel={setModel}
          style={{ marginTop: "-7.5px" }}
        />
      </Paragraph>
      {typeof kernelSpecs === "string" ? (
        <Alert
          description={kernelSpecs == "start" ? <StartButton /> : kernelSpecs}
          type="info"
          showIcon
        />
      ) : undefined}
      {kernelSpecs == null && <Loading />}
      {typeof kernelSpecs == "object" && kernelSpecs != null ? (
        <>
          <Paragraph strong>
            Select a Jupyter kernel:{" "}
            <SelectKernel
              placeholder="Select a kernel..."
              size="middle"
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
              </Paragraph>
              {!error && !isEmpty(examples) ? renderExamples() : undefined}
              {input ? (
                <div>
                  <Paragraph type="secondary">
                    The following will be submitted to the{" "}
                    <A href={"https://chat.openai.com/"}>
                      {modelToName(model)}
                    </A>{" "}
                    language model. Its response will be converted into a
                    Jupyter Notebook on the fly. Not everything might now work
                    on the first try, but overall the newly created notebook
                    should help you accomplishing your goal.
                  </Paragraph>
                  <StaticMarkdown
                    value={input}
                    style={{
                      border: `1px solid ${COLORS.GRAY}`,
                      maxHeight: "10em",
                      overflow: "auto",
                      fontSize: "12px",
                      fontFamily: "monospace",
                      borderRadius: "5px",
                      margin: "5px 0",
                      padding: "5px",
                      color: COLORS.GRAY,
                    }}
                  />
                </div>
              ) : undefined}
              {!error ? (
                <Paragraph style={{ textAlign: "center", marginTop: "15px" }}>
                  <Button
                    type="primary"
                    size="large"
                    onClick={generate}
                    disabled={querying || !prompt?.trim() || !spec}
                  >
                    <Icon name="paper-plane" /> Create Notebook using{" "}
                    {modelToName(model)} (shift+enter)
                  </Button>
                  {input && tokens > 0 ? (
                    <LLMCostEstimation
                      tokens={tokens}
                      model={model}
                      paragraph
                      textAlign="center"
                      type="secondary"
                    />
                  ) : undefined}
                </Paragraph>
              ) : undefined}
              {!error && querying ? (
                <ProgressEstimate seconds={30} />
              ) : undefined}
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
            </>
          )}
        </>
      ) : undefined}
    </div>
  );
}

export function AIGenerateNotebookButton({
  project_id,
  style,
  mode = "full",
}: {
  project_id: string;
  style?: CSS;
  mode?: "full" | "flyout";
}) {
  const [show, setShow] = useState<boolean>(false);

  if (!redux.getStore("projects").hasLanguageModelEnabled(project_id)) {
    return null;
  }

  const btnStyle: CSS = {
    width: "100%",
    overflowX: "hidden",
    overflow: "hidden",
    whiteSpace: "nowrap",
    ...(mode === "flyout"
      ? { ...NEW_FILE_STYLE, marginRight: "0", marginBottom: "0" }
      : {}),
    ...style,
  } as const;

  return (
    <>
      <Button
        onClick={() => setShow(true)}
        style={btnStyle}
        size={mode === "flyout" ? "small" : undefined}
      >
        <AIAvatar
          size={mode === "flyout" ? 18 : 14}
          style={{
            ...(mode === "flyout"
              ? {}
              : { position: "unset", marginRight: "5px" }),
          }}
        />
        {mode === "full" ? " Notebook Generator" : ""}
      </Button>
      <Modal
        title={
          <>
            <AIAvatar size={18} /> Generate a Jupyter Notebook using AI
          </>
        }
        width={650}
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

function createInput({ spec, prompt }): string {
  if (spec == null || !prompt?.trim()) return "";
  const langExtra = LANG_EXTRA[spec.language] ?? DEFAULT_LANG_EXTRA;

  return `Explain directly and to the point, how to do the following task in the programming language "${spec.display_name}", which I will be using in a Jupyter Notebook. ${langExtra} Break down all blocks of code into small snippets and wrap each one in triple backticks. Explain each snippet with a concise description, but do not tell me what the output will be. Do not open any files, since you cannot assume they exist. Instead, generate random data suitable for the example code. Make sure the entire notebook can run. Skip formalities. Do not add a summary. Do not put it all together. Suggest a filename by starting with "filename: [name.ipynb]".\n\n${prompt}`;
}
