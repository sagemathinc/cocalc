/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */
/*
TODO:
- input description box could be Markdown wysiwyg editor
*/

import type { MenuProps } from "antd";
import {
  Alert,
  Button,
  Dropdown,
  Flex,
  Input,
  Modal,
  Radio,
  Space,
  Tag,
} from "antd";

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
import { A, Icon, Markdown, Paragraph } from "@cocalc/frontend/components";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import ProgressEstimate from "@cocalc/frontend/components/progress-estimate";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { Actions as LaTeXActions } from "@cocalc/frontend/frame-editors/latex-editor/actions";
import LLMSelector, {
  modelToName,
} from "@cocalc/frontend/frame-editors/llm/llm-selector";
import { LLMCostEstimation } from "@cocalc/frontend/misc/llm-cost-estimation";
import { LLMEvent } from "@cocalc/frontend/project/history/types";
import { STYLE as NEW_FILE_STYLE } from "@cocalc/frontend/project/new/new-file-button";
import { ensure_project_running } from "@cocalc/frontend/project/project-start-warning";
import track from "@cocalc/frontend/user-tracking";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { once } from "@cocalc/util/async-utils";
import {
  getLLMServiceStatusCheckMD,
  model2vendor,
} from "@cocalc/util/db-schema/llm-utils";
import { getRandomColor, to_iso_path } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { LATEX } from "./ai-generate-examples";

const TAG = "generate-latex";

const PLACEHOLDER = "Describe your LaTeX document...";

interface Props {
  project_id: string;
  onSuccess?: () => void;
}

const SIZES = [
  "Letter (US)",
  "Legal (US)",
  "A4 (Europe)",
  "A5 (Europe)",
] as const;
type Size = (typeof SIZES)[number];

export default function AIGenerateLaTeX({ onSuccess, project_id }: Props) {
  const [model, setModel] = useLanguageModelSetting(project_id);
  const [tokens, setTokens] = useState<number>(0);
  const [paperSize, setPaperSize] = useState<Size>("Letter (US)");

  const projectActions = useActions({ project_id });
  const current_path = useTypedRedux({ project_id }, "current_path");

  // User's description of document they way to generate.
  const [prompt, setPrompt] = useState<string>("");

  const [querying, setQuerying] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  async function generate() {
    const input = createInput({ prompt, paperSize });

    try {
      setQuerying(true);

      const llmStream = webapp_client.openai_client.queryStream({
        input,
        project_id,
        path: current_path, // mainly for analytics / metadata -- can't put the actual document path since the model outputs that.
        tag: TAG,
        model,
      });

      await updateLaTeX(llmStream);
    } catch (err) {
      setError(`${err}\n\n${getLLMServiceStatusCheckMD(model2vendor(model))}.`);
      setQuerying(false);
    }
  }

  async function createLaTeX(filenameGPT: string): Promise<string> {
    const filename = sanitizeFilename(filenameGPT);
    const prefix = current_path ? `${current_path}/` : "";
    const timestamp = getTimestamp();
    const path = `${prefix}${filename}-${timestamp}.tex`;

    track("chatgpt", { project_id, path, tag: TAG, type: "generate-latex" });

    // log this in the project as well
    const event: LLMEvent = {
      event: "llm",
      usage: "generate-latex",
      model,
      path,
    };
    projectActions?.log(event);

    if (
      !(await ensure_project_running(
        project_id,
        `create the latex document '${path}'`,
      ))
    ) {
      throw new Error(`Unable to create LaTeX document for ${path}`);
    }

    const content = [
      `% Generated LaTeX Document`,
      `% by ${modelToName(model)} at ${timestamp}`,
      ``,
    ].join("\n");

    // we don't check if the file exists, because the prompt+timestamp should be unique enough
    await webapp_client.project_client.write_text_file({
      project_id,
      path,
      content,
    });
    return path;
  }

  async function getLaTeXActions(path): Promise<LaTeXActions | null> {
    // first we open the file
    await projectActions?.open_file({
      path,
      foreground: true,
    });
    // and then we try to "activate" it
    for (let i = 0; i < 20; i++) {
      const latexActions = redux.getEditorActions(
        project_id,
        path,
      ) as LaTeXActions;
      if (latexActions != null) {
        return latexActions;
      } else {
        await delay(500);
      }
    }
    return null;
  }

  function processAnswer(answer: string): string {
    const ts = new Date().toISOString().split(".")[0].replace("T", " ");
    const prefix = [
      `%% LaTeX Document was generated by ${modelToName(model)}`,
      `%% Created at ${ts}`,
    ].join("\n");

    const content = answer.includes("```")
      ? answer.split("```").slice(1, 2).pop()
      : answer;

    return `${prefix}\n\n${content}`;
  }

  async function updateLaTeX(llmStream: ChatStream): Promise<void> {
    // local state, modified when more data comes in
    let init = false;
    let answer = "";
    let la: LaTeXActions | null = null;

    async function initDocument(filenameGPT: string) {
      let path = await createLaTeX(filenameGPT);
      la = await getLaTeXActions(path);
      if (la == null) {
        throw new Error("unable to initialize document");
      }
      !(await la.wait_until_syncdoc_ready());

      // This closes the modal, since we have a document now, and it's open, and has some content
      setQuerying(false);
      onSuccess?.();
    }

    // every update interval, we extract all the answer text into cells
    // ATTN: do not call this concurrently, see throttle below
    function updateContent(answer) {
      la?.set_value(processAnswer(answer));
    }

    // NOTE: as of writing this, quick models return everything at once. Hence this must be robust for
    // the case of one token callback with everything and then "null" to indicate it is done.
    const processTokens = throttle(
      async function (answer: string, finalize: boolean) {
        const fn = getFilename(answer, prompt);
        if (!init && fn != null) {
          init = true;
          // this kicks off creating the document and opening it
          await initDocument(fn);
        }

        // it's important to make sure this is processed when finalized as well
        if (finalize) {
          if (!init) {
            // we never got a filename, so we create one based on the prompt and create the document
            const fn: string = sanitizeFilename(prompt.split("\n").join("_"));
            await initDocument(fn);
          }

          // we wait for up to 1 minute to create the document
          let t0 = Date.now();
          while (true) {
            if (la != null) break;
            await delay(100);
            if (Date.now() - t0 > 60 * 1000) {
              throw new Error(
                "Unable to create LaTeX document.  Please try again.",
              );
            }
          }

          // we check if the document is ready – and await its ready state
          if (la.not_ready()) {
            await once(la._syncstring, "ready");
          }

          // now, we're sure the document is ready → final push to update the entire document
          updateContent(answer);

          // and after we're done, build it
          la.build();
        } else {
          // we have a partial answer. update the document in real-time, if it exists
          // if those are != null, initDocument started to crate it, and we check if it is ready for us to update
          if (la != null) {
            if (!la.not_ready()) {
              updateContent(answer);
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
      const error = `% Error generating code cell\n\n\`\`\`\n${err}\n\`\`\`\n\n${getLLMServiceStatusCheckMD(
        model2vendor(model),
      )}.`;
      if (la == null) {
        // have to make error message without markdown since error isn't markdown.
        // This case happens if we turn on the chatgpt UI, but do not put an openai key in.
        setError(error);
        return;
      }
      return;
    });

    // after setting up listeners, we start the stream
    llmStream.emit("start");
  }

  if (!redux.getStore("projects").hasLanguageModelEnabled(project_id)) {
    return null;
  }

  const input = createInput({ prompt, paperSize });

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
    const items: MenuProps["items"] = LATEX.map((ex, idx) => {
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

  function renderPaperSize() {
    return (
      <Paragraph>
        Page size:{" "}
        <Radio.Group
          value={paperSize}
          size="small"
          onChange={(e) => setPaperSize(e.target.value)}
        >
          {SIZES.map((size) => (
            <Radio.Button key={size} value={size}>
              {size}
            </Radio.Button>
          ))}
        </Radio.Group>
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

      <Paragraph>
        Provide a detailed description of the LaTeX file you want to create:
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
      {!error && !isEmpty(LATEX) ? renderExamples() : undefined}
      {!error ? renderPaperSize() : undefined}
      {input ? (
        <div>
          <Paragraph type="secondary">
            The following will be submitted to the{" "}
            <A href={"https://chat.openai.com/"}>{modelToName(model)}</A>{" "}
            language model. Its response will be inserted into a new LaTeX
            document the fly. Overall, the newly created document should help
            you getting started accomplishing your goal.
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
            disabled={querying || !prompt?.trim()}
          >
            <Icon name="paper-plane" /> Create LaTeX Document using{" "}
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
      {!error && querying ? <ProgressEstimate seconds={30} /> : undefined}
      {error ? (
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
      ) : undefined}
    </div>
  );
}

export function AIGenerateLaTeXButton({
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
        {mode === "full" ? " LaTeX Generator" : ""}
      </Button>
      <Modal
        title={
          <>
            <AIAvatar size={18} /> Generate a LaTeX Document using AI
          </>
        }
        width={650}
        open={show}
        onCancel={() => setShow(false)}
        footer={null}
      >
        <AIGenerateLaTeX
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
  text = text.replace(/\.tex/, "");

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
  if (text == null) {
    return sanitizeFilename(prompt.split("\n").join("_"));
  }
  // use regex to search for '"filename: [filename]"'
  const match = text.match(/"filename: \[(.*?)\]"/);
  if (match == null) return null;
  return sanitizeFilename(match[1]);
}

function createInput({
  prompt,
  paperSize,
}: {
  prompt: string;
  paperSize: Size;
}): string {
  if (!prompt?.trim()) return "";
  return `Your task is to create a LaTeX document based on the provided description below. It will be used as a template to get started writing the document. The size of each page should be ${paperSize}. Your output must start with a suggested filename "filename: [filename.tex]". Below, enclose the entire LaTeX document in tripe backticks. Feel free to change the documentclass or add more packages as needed. Make sure the generated document can be compiled with PDFLaTeX, XeLaTeX, and LuaTeX. Do not add any further instructions.

Example:

<OUTPUT>
filename: [filename.tex]

\`\`\`
\\documentclass{article}
% set font encoding for PDFLaTeX, XeLaTeX, or LuaTeX
\\usepackage{ifxetex,ifluatex}
\\if\\ifxetex T\\else\\ifluatex T\\else F\\fi\\fi T%
  \\usepackage{fontspec}
\\else
  \\usepackage[T1]{fontenc}
  \\usepackage[utf8]{inputenc}
  \\usepackage{lmodern}
\\fi

\\usepackage{hyperref}
\\usepackage{amsmath}

\\title{Title of Document}
\\author{Name of Author}

\\begin{document}
\\end{document}
\`\`\`
</OUTPUT>

Description of the document:

${prompt}`;
}
