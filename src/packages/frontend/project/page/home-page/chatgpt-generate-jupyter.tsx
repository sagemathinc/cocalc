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
import { CSSProperties, useEffect, useState } from "react";

import {
  redux,
  useActions,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
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
import getKernelSpec from "@cocalc/frontend/jupyter/kernelspecs";
import type { KernelSpec } from "@cocalc/frontend/jupyter/types";
import { StartButton } from "@cocalc/frontend/project/start-button";
import track from "@cocalc/frontend/user-tracking";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { field_cmp, to_iso_path } from "@cocalc/util/misc";
import { Block } from "./block";

const tag = "generate-jupyter";

const PLACEHOLDER = "Describe your notebook in detail...";

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

    const langExtra = LANG_EXTRA[spec.language] ?? DEFAULT_LANG_EXTRA;

    const input = `Explain directly and to the point, how to compute the following task in the programming language "${spec.display_name}", which I will be using in a Jupyter notebook. ${langExtra} Break down all blocks of code into small snippets and wrap each one in triple backticks. Explain each snippet with a concise description, but do not tell me what the output will be. Skip formalities. Do not add a summary. Do not put it all together. Suggest a filename for code.\n\n${prompt}`;

    try {
      setQuerying(true);
      const raw = await webapp_client.openai_client.chatgpt({
        input,
        project_id,
        path: current_path, // mainly for analytics / metadata -- can't put the actual notebook path since the model outputs that.
        tag,
      });
      await writeNotebook(raw);
      onSuccess?.();
    } catch (err) {
      setError(
        `${err}\n\nOpenAI [status](https://status.openai.com) and [downdetector](https://downdetector.com/status/openai).`
      );
    } finally {
      setQuerying(false);
    }
  }

  /**
   * The text string contains markdown text with code blocks. This split this into cells of type markdown and code.
   */
  function splitCells(
    text: string
  ): { cell_type: "markdown" | "code"; source: string[] }[] {
    const ret: { cell_type: "markdown" | "code"; source: string[] }[] = [
      {
        cell_type: "markdown",
        source: [
          `# ChatGPT generated notebook\n\n`,
          `This notebook was generated in [CoCalc](https://cocalc.com) by [ChatGPT](https://chat.openai.com/) using the prompt:\n\n`,
          prompt
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n") + "\n",
        ],
      },
    ];

    let lines = text.split("\n");
    let cell_type: "markdown" | "code" = "markdown";
    let source: string[] = [];
    for (const line of lines) {
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

  function getTitle(
    prompt: string,
    text: string
  ): { title: string; text: string } {
    const i = text.toLowerCase().indexOf("filename:");
    if (i == -1) {
      return {
        title: prompt
          .split("\n")
          .join("_")
          .replace(/[^a-zA-Z0-9 ]/g, "")
          .replace(/\s+/g, "_")
          .trim()
          .slice(0, 60),
        text,
      };
    }
    const j = text.indexOf("\n", i + "filename:".length);
    let title = text
      .slice(i + "filename:".length, j)
      .trim()
      .replace(/`/g, "");
    const k = title.indexOf(".");
    if (k != -1) {
      title = title.slice(0, k).trim();
    }
    return {
      title,
      text: text.slice(0, i) + text.slice(j + 1),
    };
  }

  function getTimestamp(): string {
    return to_iso_path(new Date());
  }

  async function writeNotebook(text: string): Promise<void> {
    // constructs a proto jupyter notebook with the given kernel
    let title;
    ({ title, text } = getTitle(prompt, text));
    const prefix = current_path ? `${current_path}/` : "";
    const timestamp = getTimestamp();
    const path = `${prefix}${title}-${timestamp}.ipynb`;
    const nb = {
      cells: splitCells(text),
      metadata: { kernelspec: spec },
    };
    track("chatgpt", { project_id, path, tag, type: "generate" });

    // we don't check if the file exists, because the prompt+timestamp should be unique enough
    await webapp_client.project_client.write_text_file({
      project_id,
      path,
      content: JSON.stringify(nb, null, 2),
    });
    await projectActions?.open_file({
      path,
      foreground: true,
    });
    // Start it running, so user doesn't have to wait... but actions
    // might not be immediately available...
    for (let i = 0; i < 20; i++) {
      const jupyterFrameActions = redux.getEditorActions(
        project_id,
        path
      ) as JupyterEditorActions;
      if (jupyterFrameActions != null) {
        jupyterFrameActions.jupyter_actions.run_all_cells();
        break;
      } else {
        await delay(500);
      }
    }
  }

  if (!redux.getStore("projects").hasOpenAI(project_id)) {
    return null;
  }

  function info() {
    return (
      <HelpIcon title="OpenAI GPT" style={{ float: "right" }}>
        <Paragraph style={{ minWidth: "300px" }}>
          This tool sends your message to{" "}
          <A href={"https://chat.openai.com/"}>ChatGPT</A> in order to get a
          well structured answer back. This reply will be post-processed and
          turned into a Jupyter Notebook. When it opens up, check the result and
          evaluate the cells. Not everything might work on first try, but it
          should give you some ideas towards your given task. If it does not
          work, try again with a better prompt!
        </Paragraph>
      </HelpIcon>
    );
  }

  return (
    <Block style={{ padding: "0 15px" }}>
      <Title level={2}>
        <OpenAIAvatar size={30} /> ChatGPT Jupyter Notebook Generator {info()}
      </Title>
      {typeof kernelSpecs == "string" && (
        <Alert
          description={
            kernelSpecs == "start" ? (
              <StartButton project_id={project_id} />
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
                generate, including as many relevant details as possible.
              </Paragraph>
              <Paragraph>
                <Input.TextArea
                  allowClear
                  autoSize={{ minRows: 2, maxRows: 6 }}
                  maxLength={2000}
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
                {example && (
                  <div style={{ color: "#444", marginTop: "15px" }}>
                    Example: <i>"{example}"</i>
                  </div>
                )}
              </Paragraph>
              <Paragraph style={{ textAlign: "center" }}>
                <Button
                  type="primary"
                  size="large"
                  onClick={generate}
                  disabled={querying || !prompt?.trim() || !spec}
                >
                  <Icon name="bolt" /> Generate Notebook (shift+enter)
                </Button>
              </Paragraph>
              {!error && querying && <ProgressEstimate seconds={30} />}
              {error && (
                <Paragraph>
                  <Markdown value={error} />
                </Paragraph>
              )}
            </>
          )}
        </>
      )}
    </Block>
  );
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
  const handleOk = () => {
    setShow(false);
  };

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
        open={show}
        onOk={handleOk}
        onCancel={handleCancel}
      >
        <ChatGPTGenerateJupyterNotebook
          project_id={project_id}
          onSuccess={() => setShow(false)}
        />
      </Modal>
    </>
  );
}
