/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */
/*
TODO:
- input description box could be Markdown wysiwyg editor
*/

import type { MenuProps } from "antd";
import {
  Alert,
  Button,
  Collapse,
  Divider,
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
import { useEffect, useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { useLanguageModelSetting } from "@cocalc/frontend/account/useLanguageModelSetting";
import {
  CSS,
  redux,
  useActions,
  useAsyncEffect,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { ChatStream } from "@cocalc/frontend/client/llm";
import type { Message } from "@cocalc/frontend/client/types";
import {
  Icon,
  LLMNameLink,
  Loading,
  Markdown,
  Paragraph,
  RawPrompt,
} from "@cocalc/frontend/components";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import ProgressEstimate from "@cocalc/frontend/components/progress-estimate";
import SelectKernel from "@cocalc/frontend/components/run-button/select-kernel";
import { Tip } from "@cocalc/frontend/components/tip";
import { file_options } from "@cocalc/frontend/editor-tmp";
import { Actions as CodeEditorActions } from "@cocalc/frontend/frame-editors/code-editor/actions";
import { JupyterEditorActions } from "@cocalc/frontend/frame-editors/jupyter-editor/actions";
import { Actions as LatexActions } from "@cocalc/frontend/frame-editors/latex-editor/actions";
import { LLMHistorySelector } from "@cocalc/frontend/frame-editors/llm/llm-history-selector";
import { LLMQueryDropdownButton } from "@cocalc/frontend/frame-editors/llm/llm-query-dropdown";
import LLMSelector, {
  modelToName,
} from "@cocalc/frontend/frame-editors/llm/llm-selector";
import { useLLMHistory } from "@cocalc/frontend/frame-editors/llm/use-llm-history";
import { Actions as RmdActions } from "@cocalc/frontend/frame-editors/rmd-editor/actions";
import { dialogs, labels } from "@cocalc/frontend/i18n";
import getKernelSpec from "@cocalc/frontend/jupyter/kernelspecs";
import { splitCells } from "@cocalc/frontend/jupyter/llm/split-cells";
import NBViewer from "@cocalc/frontend/jupyter/nbviewer/nbviewer";
import { LLMCostEstimation } from "@cocalc/frontend/misc/llm-cost-estimation";
import { LLMEvent } from "@cocalc/frontend/project/history/types";
import { DELAY_SHOW_MS } from "@cocalc/frontend/project/new/consts";
import { STYLE as NEW_FILE_STYLE } from "@cocalc/frontend/project/new/new-file-button";
import { ensure_project_running } from "@cocalc/frontend/project/project-start-warning";
import { StartButton } from "@cocalc/frontend/project/start-button";
import track from "@cocalc/frontend/user-tracking";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { JupyterActions } from "@cocalc/jupyter/redux/actions";
import type { KernelSpec } from "@cocalc/jupyter/types";
import {
  getLLMServiceStatusCheckMD,
  model2vendor,
} from "@cocalc/util/db-schema/llm-utils";
import { capitalize, cmp, getRandomColor } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import {
  DOCUMENT,
  EXAMPLES_COMMON,
  Example,
  Ext,
  JUPYTER,
  PAPER_SIZE,
} from "./ai-generate-examples";
import {
  DEFAULT_LANG_EXTRA,
  HistoryExample,
  LANG_EXTRA,
  PROMPT,
} from "./ai-generate-prompts";
import {
  AI_GENERATE_DOC_TAG,
  commentBlock,
  getFilename,
  getTimestamp,
  sanitizeFilename,
} from "./ai-generate-utils";

const TAG = AI_GENERATE_DOC_TAG;
const TAG_TMPL = `${TAG}-template`;

export const PREVIEW_BOX: CSS = {
  border: `1px solid ${COLORS.GRAY}`,
  maxHeight: "60vh",
  overflowX: "hidden",
  overflowY: "auto",
  fontSize: "12px",
  borderRadius: "5px",
  margin: "5px 0",
  padding: "5px",
} as const;

type Ipynb = {
  cells: { cell_type: "markdown" | "code"; source: string[] }[];
  metadata: { kernelspec: KernelSpec };
};

function normalizeExt(ext: Ext): Omit<Ext, "ipynb-sagemath"> {
  return ext === "ipynb-sagemath" ? "ipynb" : ext;
}

function ensureExtension(filename: string, ext: Ext) {
  if (!filename) return filename;
  const ext2 = normalizeExt(ext);
  if (!filename.endsWith("." + ext2)) {
    return filename + "." + ext2;
  }
  return filename;
}

interface Props {
  project_id: string;
  onSuccess: () => void;
  ext: Ext;
  docName: string;
  show: boolean;
  filename?: string;
}

function AIGenerateDocument({
  onSuccess,
  show,
  project_id,
  ext,
  docName,
  filename: filename0,
}: Props) {
  const intl = useIntl();
  const projectActions = useActions({ project_id });
  const current_path = useTypedRedux({ project_id }, "current_path");

  const [model, setModel] = useLanguageModelSetting(project_id);
  const [tokens, setTokens] = useState<number>(0);
  const [paperSize, setPaperSize] = useState<string | null>(null);
  // User's description of document they want to generate.
  const [prompt, setPrompt] = useState<string>("");
  const { prompts: historyPrompts, addPrompt } = useLLMHistory("generate");
  const [querying, setQuerying] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [preview, setPreview] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>(
    ensureExtension(filename0 ?? "", ext),
  );

  useEffect(() => {
    setFilename(ensureExtension(filename0 ?? "", ext));
  }, [filename0]);

  const promptRef = useRef<HTMLElement>(null);

  const [kernelSpecs, setKernelSpecs] = useState<KernelSpec[] | null | string>(
    null,
  );

  // The name of the selected kernel. This determines the language, display name and everything else.
  const [spec, setSpec] = useState<KernelSpec | null>(null);

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
        let X = await getKernelSpec({ project_id });
        if (ext === "ipynb-sagemath") {
          // only SageMath KernelSpecs
          X = X.filter((x) => x.language === "sagemath");
        }

        // sort by descending priority and ascending display name
        X.sort((a, b) => {
          const an = a.display_name;
          const bn = b.display_name;
          const ap = a?.metadata?.cocalc?.priority ?? 0;
          const bp = b?.metadata?.cocalc?.priority ?? 0;
          return -cmp(ap, bp) || an.localeCompare(bn);
        });

        setKernelSpecs(X);

        if (spec == null && ext !== "ipynb-sagemath") {
          const name = redux
            .getStore("account")
            .getIn(["editor_settings", "jupyter", "kernel"]);
          if (name != null) {
            for (const a of X) {
              if (a.name == name) {
                setSpec(a);
                return;
              }
            }
          }
        }

        // not found? either we pick the top priority sagemath or just the first one
        if (spec == null) {
          if (X.length > 0) {
            setSpec(X[0]);
          } else {
            setSpec(null);
          }
        }
      } catch (err) {
        console.log(err);
        setKernelSpecs(
          intl.formatMessage({
            id: "ai-generate-document.loading_kernels.error_message",
            defaultMessage:
              "Unable to load Jupyter kernels. Make sure the project is running and Jupyter is installed.",
          }),
        );
      }
    })();
  }, [project_id, projectState]);

  const cancel = useRef<boolean>(false);
  // only used for ipynb
  const [ipynb, setIpynb] = useState<null | Ipynb>(null);

  useEffect(() => {
    const sizes = PAPER_SIZE[ext];
    if (paperSize == null && sizes != null) {
      setPaperSize(sizes[0]);
    }
  }, [ext]);

  useEffect(() => {
    if (!preview && show) {
      promptRef.current?.focus();
    }
  }, [show, preview]);

  function getInputPrompt(prompt: string) {
    const what = ext === "ipynb" ? "task" : "document";
    return `Description of the ${what}: ${prompt}`;
  }

  function fullTemplate({
    extra,
    template,
    paperSizeStr,
  }: {
    extra: string;
    template: Readonly<HistoryExample>;
    paperSizeStr: string;
  }): {
    input: string;
    history: Message[];
    system: string;
  } {
    // ATTN: make sure to avoid introducing whitespace at the beginning of lines and keep two newlines between blocks
    const history: Message[] = [
      { role: "user", content: getInputPrompt(template.prompt) },
      {
        role: "assistant",
        content: `filename: [${template.filename}.${ext}]\n\n${template.content}\n`,
      },
    ];
    // lang extra is only for ipynb
    const langExtra = LANG_EXTRA[spec?.language ?? ""] ?? DEFAULT_LANG_EXTRA;
    const filename = `Your output must start with a suggested filename: "filename: [filename.${ext}]".`;
    const nonTex =
      ext !== "tex"
        ? "Instead, generate random data suitable for the example code. "
        : "";
    const common = `Do not add any further instructions. Skip formalities. Do not open and read any files, since you cannot assume they exist. ${nonTex}Do not add a summary. Do not put it all together. ${filename}`;
    const system =
      ext === "ipynb"
        ? `Explain, how to do a task in the programming language "${
            spec?.display_name ?? "Python"
          }". The task is described below. Your reply will be transformed into a Jupyter Notebook. ${langExtra} Wrap formulas written in Markdown in $ or $$ characters. Break down all blocks of code into small snippets and wrap each one in triple backticks. Explain each snippet with a concise description, but do not tell me what the output will be. Make sure the entire notebook can run top to bottom. ${common}`
        : `Your task is to create a ${docName} document based on the provided description. It will be used as a template to get started writing the document. ${paperSizeStr}${extra} ${common}`;

    return { input: getInputPrompt(prompt), history, system };
  }

  function createPrompt(): {
    input: string;
    history: Message[];
    system: string;
  } | null {
    if (!prompt?.trim()) return null;
    const paperSizeStr = paperSize
      ? `The size of each page should be ${paperSize}. `
      : "";
    const { extra, template } = PROMPT[ext];
    return fullTemplate({ extra, template, paperSizeStr });
  }

  async function generate() {
    const fullPrompt = createPrompt();
    if (fullPrompt == null) return;

    const { input, history, system } = fullPrompt;

    // Add prompt to history
    addPrompt(prompt);

    try {
      cancel.current = false;
      setQuerying(true);

      const llmStream = webapp_client.openai_client.queryStream({
        input,
        history,
        system,
        project_id,
        path: current_path, // mainly for analytics / metadata -- can't put the actual document path since the model outputs that.
        tag: TAG,
        model,
      });

      await updateDocument(llmStream);
    } catch (err) {
      setError(
        `${err}\n\n${getLLMServiceStatusCheckMD(model2vendor(model).name)}.`,
      );
      setQuerying(false);
    }
  }

  async function createDocument(preview: string): Promise<string> {
    const prefix = current_path ? `${current_path}/` : "";
    const path = `${prefix}${filename}`;

    track(TAG, { project_id, path, ext });

    // log this in the project as well
    const event: LLMEvent = {
      event: "llm",
      usage: TAG,
      ext,
      model,
      path,
    };
    projectActions?.log(event);

    const what = intl.formatMessage(
      {
        id: "project.page.ai-generate-document.create_document.what",
        defaultMessage: `create the {docName} document "{path}"`,
      },
      {
        docName,
        path,
      },
    );

    if (!(await ensure_project_running(project_id, what))) {
      throw new Error(`Unable to create ${docName} document for ${path}`);
    }

    // we don't check if the file exists, because the prompt+timestamp should be unique enough
    await webapp_client.project_client.write_text_file({
      project_id,
      path,
      content:
        ext === "ipynb" || ext === "ipynb-sagemath"
          ? JSON.stringify(ipynb, null, 2)
          : preview,
    });
    return path;
  }

  async function getEditorActions(path): Promise<CodeEditorActions | null> {
    // first we open the file
    await projectActions?.open_file({
      path,
      foreground: true,
    });
    // and then we try to "activate" it
    for (let i = 0; i < 20; i++) {
      const editorActions = redux.getEditorActions(
        project_id,
        path,
      ) as CodeEditorActions;
      if (editorActions != null) {
        return editorActions;
      } else {
        await delay(500);
      }
    }
    return null;
  }

  function processAnswerIpynb(answer: string): Ipynb {
    if (spec == null) {
      throw new Error("processAnswerIpynb: spec is null");
    }
    const cells = splitCells(answer, (line) => line.startsWith("filename:"));
    return { cells, metadata: { kernelspec: spec } };
  }

  // Although it shouldn't happen, tex output is still sometimes wrapped in ```...```
  function extractBackticks(full: string): string {
    full = full.trim();
    const lb1 = full.indexOf("\n");
    const lb2 = full.lastIndexOf("\n");
    if (lb1 != -1 && lb2 != -1 && lb1 !== lb2) {
      // do first and last line have backticks?
      const line1 = full.substring(0, lb1);
      const line2 = full.substring(lb2);
      const i = line1.indexOf("```");
      const j = line2.lastIndexOf("```");
      if (i !== -1 && j !== -1 && i !== j) {
        const j2 = full.lastIndexOf("```");
        return full.substring(i + 3, j2).trim();
      }
    }

    return full;
  }

  function extractContent(answer: string): string {
    const lb1 = answer.indexOf("\n");
    if (lb1 !== -1) {
      const firstLine = answer.substring(0, lb1);
      const i = firstLine.indexOf("filename:");
      if (i !== -1) {
        const content = answer.substring(lb1 + 1).trim();
        if (ext === "tex") {
          return extractBackticks(content);
        } else {
          return content;
        }
      }
    }
    return answer;
  }

  function processAnswer(answer: string): string {
    const ts = new Date().toISOString().split(".")[0].replace("T", " ");
    const intro =
      ext === "tex"
        ? commentBlock(
            [
              `${docName} document was generated by ${modelToName(model)}`,
              `Created ${ts}`,
            ].join("\n"),
            ext,
          ) + "\n\n"
        : "";

    const content = extractContent(answer);

    return `${intro}${content}`;
  }

  async function save() {
    setSaving(true);
    try {
      if (preview == null) {
        console.error("ai doc generator: no preview - should never happen");
      } else {
        const path = await createDocument(preview);
        // this will also open it in the foreground
        const ea = await getEditorActions(path);
        // TODO: figure out why we have to wait (initial auto build?)
        await new Promise((resolve, _) => setTimeout(resolve, 2000));
        if (ea != null) {
          switch (ext) {
            case "rmd":
              (ea as RmdActions).build();
              break;
            case "tex":
              (ea as LatexActions).build();
              break;
            case "ipynb":
            case "ipynb-sagemath":
              const jea = ea as JupyterEditorActions;
              const ja: JupyterActions = jea.jupyter_actions;
              // and after we're done, cleanup and run all cells
              ja.delete_all_blank_code_cells();
              ja.run_all_cells();
              break;
          }
        }
      }
      setPreview(null);
      setSaving(false);
      onSuccess();
    } catch (err) {
      setError(`${err}`);
    }
  }

  function updateFilename(fnNext: string) {
    if (filename) {
      return;
    }
    const ext2 = normalizeExt(ext);
    const fn = sanitizeFilename(fnNext, ext2 as string);
    const timestamp = getTimestamp();
    setFilename(`${fn}-${timestamp}.${ext2}`);
  }

  async function updateDocument(llmStream: ChatStream): Promise<void> {
    // local state, modified when more data comes in
    let init = false;
    let answer = "";

    // every update interval, we extract all the answer text into cells
    // ATTN: do not call this concurrently, see throttle below
    function updateContent(answer) {
      if (cancel.current) return;
      if (ext === "ipynb" || ext === "ipynb-sagemath") {
        setPreview("Jupyter Notebook");
        setIpynb(processAnswerIpynb(answer));
      } else {
        setPreview(processAnswer(answer));
      }
    }

    // NOTE: as of writing this, quick models return everything at once. Hence this must be robust for
    // the case of one token callback with everything and then "null" to indicate it is done.
    const processTokens = throttle(
      async function (answer: string, finalize: boolean) {
        const fn = getFilename(answer, prompt, normalizeExt(ext) as string);
        if (!init && fn != null) {
          init = true;
          updateFilename(fn);
        }

        // it's important to make sure this is processed when finalized as well
        if (finalize) {
          if (!init) {
            // we never got a filename, so we create one based on the prompt and create the document
            const fn: string = sanitizeFilename(
              prompt.split("\n").join("_"),
              normalizeExt(ext) as string,
            );
            updateFilename(fn);
          }

          // now, we're sure the document is ready → final push to update the entire document
          updateContent(answer);
          setQuerying(false);
        } else {
          // we have a partial answer. update the preview in real-time
          updateContent(answer);
        }
      },
      1000,
      {
        leading: false,
        trailing: true,
      },
    );

    llmStream.on("token", async (token: string | null) => {
      if (cancel.current) {
        // we abort this
        llmStream.removeAllListeners();
        // signal "finalization"
        processTokens(answer, true);
        return;
      }
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
    });

    // after setting up listeners, we start the stream
    llmStream.emit("start");
  }

  if (!redux.getStore("projects").hasLanguageModelEnabled(project_id)) {
    return null;
  }

  const fullPrompt = createPrompt();

  useEffect(() => {
    if (tokens > 0 && fullPrompt == null) setTokens(0);
  }, [fullPrompt]);

  useAsyncEffect(
    debounce(
      async () => {
        if (fullPrompt == null) return;
        const { input, history, system } = fullPrompt;

        // do not import until needed -- it is HUGE!
        const { getMaxTokens, numTokensUpperBound } = await import(
          "@cocalc/frontend/misc/llm"
        );

        const all = [
          input,
          history.map(({ content }) => content).join(" "),
          system,
        ].join(" ");
        const tokens = numTokensUpperBound(all, getMaxTokens(model));

        setTokens(tokens);
      },
      2000,
      { leading: false, trailing: true },
    ),
    [fullPrompt],
  );

  function renderExamples() {
    if (isEmpty(DOCUMENT[ext])) return;

    const ex = (function (): readonly Example[] {
      switch (ext) {
        case "ipynb":
        case "ipynb-sagemath":
          return spec != null
            ? JUPYTER[spec.language?.toLowerCase()] ?? []
            : [];
        default:
          return DOCUMENT[ext];
      }
    })();
    if (!ex || isEmpty(ex)) return;
    const all = [...EXAMPLES_COMMON, ...ex];

    const items: MenuProps["items"] = all.map((ex, idx) => {
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
        onClick: () => {
          setPrompt(ex[1]);
          track(TAG_TMPL, { project_id, ext, template: ex[0] });
        },
      };
    });

    return (
      <Paragraph>
        <Dropdown
          menu={{ items, style: { maxHeight: "50vh", overflow: "auto" } }}
          trigger={["click"]}
        >
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
    const sizes = PAPER_SIZE[ext];
    if (!sizes) return;

    return (
      <Paragraph>
        Page size:{" "}
        <Radio.Group
          value={paperSize}
          size="small"
          onChange={(e) => setPaperSize(e.target.value)}
        >
          {sizes.map((size) => (
            <Radio.Button key={size} value={size}>
              {size}
            </Radio.Button>
          ))}
        </Radio.Group>
      </Paragraph>
    );
  }

  function renderJupyterKernelSelector() {
    if (ext !== "ipynb" && ext !== "ipynb-sagemath") return;
    return (
      <>
        {typeof kernelSpecs === "string" ? (
          <Alert
            description={kernelSpecs == "start" ? <StartButton /> : kernelSpecs}
            type="info"
            showIcon
          />
        ) : undefined}
        {kernelSpecs == null && <Loading />}
        {typeof kernelSpecs === "object" && kernelSpecs != null ? (
          <Paragraph strong>
            {intl.formatMessage(labels.select_a_kernel)}
            {": "}
            <SelectKernel
              placeholder={`${intl.formatMessage(labels.select_a_kernel)}...`}
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
        ) : undefined}
      </>
    );
  }

  function renderPromptPreview() {
    if (!fullPrompt) return;

    const { input, history, system } = fullPrompt;
    const ex = history.map(({ content }) => content).join("\n\n");
    const raw = [input, "Example:", ex, "System:", system].join("\n\n");

    return (
      <div>
        <Divider />
        <Paragraph type="secondary">
          <FormattedMessage
            id="project.page.ai-generate-document.preview.info"
            defaultMessage={`A prompt to generate the document will be sent to the {llm} language model.
            You'll see a preview of the new content,
            which you'll then be able to save in a new file and start working on it.
            Overall, the newly created document should help you getting started accomplishing your goal.`}
            values={{ llm: <LLMNameLink model={model} /> }}
          />
        </Paragraph>
        <Collapse
          items={[
            {
              key: "1",
              label: (
                <>Click to see what will be sent to {modelToName(model)}.</>
              ),
              children: (
                <RawPrompt
                  input={raw}
                  style={{
                    border: "none",
                    padding: "0",
                    margin: "0",
                    maxHeight: "10em",
                    overflow: "auto",
                    fontSize: "12px",
                    fontFamily: "monospace",
                    borderRadius: "5px",
                    color: COLORS.GRAY,
                  }}
                />
              ),
            },
          ]}
        />
      </div>
    );
  }

  function renderDialog() {
    const placeholder = intl.formatMessage({
      id: "project.page.ai-generate-document.content.placeholder",
      defaultMessage: "Describe the content...",
    });
    return (
      <>
        <Paragraph strong>
          {intl.formatMessage(dialogs.select_llm)}:{" "}
          <LLMSelector
            project_id={project_id}
            model={model}
            setModel={setModel}
            style={{ marginTop: "-7.5px" }}
          />
        </Paragraph>
        {renderJupyterKernelSelector()}
        <Paragraph>
          <FormattedMessage
            id="project.page.ai-generate-document.content.label"
            defaultMessage={
              "Provide a detailed description of the {docName} document you want to create:"
            }
            values={{ docName }}
          />
        </Paragraph>
        <Paragraph>
          <Space.Compact style={{ width: "100%" }}>
            <Input.TextArea
              ref={promptRef}
              allowClear
              autoSize={{ minRows: 3, maxRows: 6 }}
              maxLength={3000}
              placeholder={placeholder}
              value={prompt}
              disabled={querying}
              onChange={({ target: { value } }) => setPrompt(value)}
              onPressEnter={(e) => {
                if (e.shiftKey) {
                  generate();
                }
              }}
            />
            <LLMHistorySelector
              prompts={historyPrompts}
              onSelect={setPrompt}
              disabled={querying}
            />
          </Space.Compact>
        </Paragraph>
        {!error ? renderExamples() : undefined}
        {!error ? renderPaperSize() : undefined}
        {renderPromptPreview()}
        {
          <Paragraph style={{ textAlign: "center", marginTop: "15px" }}>
            <Space>
              <LLMQueryDropdownButton
                disabled={!fullPrompt || !!error || querying || !prompt?.trim()}
                loading={querying}
                onClick={generate}
                llmTools={{ model, setModel }}
                task={intl.formatMessage(
                  {
                    id: "project.page.ai-generate-document.create.label",
                    defaultMessage: `Create {docName} using`,
                  },
                  { docName },
                )}
              />
            </Space>
          </Paragraph>
        }
        {fullPrompt && tokens > 0 ? (
          <LLMCostEstimation
            tokens={tokens}
            model={model}
            paragraph
            textAlign="center"
            type="secondary"
          />
        ) : undefined}
      </>
    );
  }

  function renderPreviewContent({ preview, ipynb }) {
    switch (ext) {
      case "ipynb":
      case "ipynb-sagemath":
        if (ipynb == null || spec == null) return <Loading />;
        // TODO: figure out how to replace this by the "CellList" component (which requires a bunch of special objects)
        return (
          <NBViewer
            content={JSON.stringify(ipynb, null, 2)}
            fontSize={undefined}
            style={PREVIEW_BOX}
            cellListStyle={{
              transform: "scale(0.9)",
              transformOrigin: "top left",
              width: "110%",
            }}
            scrollBottom={true}
          />
        );
      default:
        return (
          <RawPrompt
            input={preview}
            scrollBottom={true}
            style={{
              ...PREVIEW_BOX,
              fontFamily: "monospace",
              color: COLORS.GRAY,
            }}
          />
        );
    }
  }

  function renderPreview() {
    if (preview == null) return;
    const disabled = querying || saving || !preview?.trim();
    const message = intl.formatMessage(
      {
        id: "project.page.ai-generate-document.preview.saving",
        defaultMessage: `{saving, select,
        true {The file is saving...}
        other {Please wait until fully generated...}}`,
      },
      { saving },
    );
    return (
      <>
        <div>
          <Paragraph>
            <FormattedMessage
              id="project.page.ai-generate-document.preview.header"
              defaultMessage={`This is a preview of the generated content.`}
            />
          </Paragraph>
          <Paragraph>
            {querying || saving ? (
              <Alert
                banner
                type={saving ? "info" : "warning"}
                style={{ fontWeight: "bold" }}
                message={message}
              />
            ) : (
              <FormattedMessage
                id="project.page.ai-generate-document.preview.save_message"
                defaultMessage={`It finished generating the content.
                You can either <B>save the file</B> with the given filename,
                or discard the preview and go back to the previous step.`}
                values={{
                  B: (c) => (
                    <Button
                      type="primary"
                      size="small"
                      onClick={save}
                      disabled={disabled}
                    >
                      {c}
                    </Button>
                  ),
                }}
              />
            )}
          </Paragraph>
          <Paragraph>
            <Flex vertical={false} gap={"10px"} align="center">
              <Flex flex={0}>Filename:</Flex>
              <Flex flex={"1 1 auto"}>
                <Input
                  style={{ width: "100%" }}
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  disabled={querying || saving}
                />
              </Flex>
            </Flex>
          </Paragraph>
          {renderPreviewContent({ preview, ipynb })}
        </div>
        <Paragraph style={{ textAlign: "center", marginTop: "15px" }}>
          <Space size="middle">
            <Button
              size="large"
              onClick={() => {
                cancel.current = true;
                setQuerying(false);
                setSaving(false);
                setPreview(null);
              }}
            >
              {intl.formatMessage(labels.cancel)}
            </Button>
            <Button
              type="primary"
              size="large"
              onClick={save}
              disabled={disabled || saving}
            >
              <Icon name="paper-plane" /> {intl.formatMessage(labels.save)}{" "}
              {docName}
            </Button>
          </Space>
        </Paragraph>
        {!disabled ? (
          <Paragraph type="secondary">
            <FormattedMessage
              id="project.page.ai-generate-document.preview.footer"
              defaultMessage={`Click "save" to store the preview of the content in a new file with the given filename.
              You can then edit and run the computational document as usual.
              Click "discard" to ignore the result and go back to the previous step.`}
            />
          </Paragraph>
        ) : undefined}
      </>
    );
  }

  function renderContent() {
    if (preview == null) {
      return renderDialog();
    } else {
      return renderPreview();
    }
  }

  return (
    <div style={{ padding: "0 15px" }}>
      {renderContent()}
      {!error && (querying || saving) ? (
        <ProgressEstimate seconds={saving ? 5 : 30} />
      ) : undefined}
      {error ? (
        <Alert
          closable
          banner
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

export function AIGenerateDocumentModal({
  show,
  setShow,
  project_id,
  ext,
  filename,
}: {
  show: boolean;
  setShow: (val: boolean) => void;
  project_id: string;
  style?: CSS;
  ext: Props["ext"];
  filename?: string;
}) {
  const ext2 = normalizeExt(ext) as string;
  const docName = file_options(`x.${ext2}`).name ?? `${capitalize(ext2)}`;

  return (
    <Modal
      title={
        <>
          <AIAvatar size={18} />{" "}
          <FormattedMessage
            id="ai-generate-document.modal.title"
            defaultMessage="Generate a {docName} Document using AI"
            values={{ docName }}
          />
        </>
      }
      width={750}
      open={show}
      onCancel={() => setShow(false)}
      footer={null}
    >
      <AIGenerateDocument
        project_id={project_id}
        show={show}
        onSuccess={() => setShow(false)}
        ext={ext}
        docName={docName}
        filename={filename}
      />
    </Modal>
  );
}

export function AIGenerateDocumentButton({
  project_id,
  style,
  mode = "full",
  ext,
  filename,
}: {
  project_id: string;
  style?: CSS;
  mode?: "full" | "flyout";
  ext: Props["ext"];
  filename?: string;
}) {
  const intl = useIntl();
  const [show, setShow] = useState<boolean>(false);

  if (!redux.getStore("projects").hasLanguageModelEnabled(project_id, TAG)) {
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
      <Tip
        delayShow={DELAY_SHOW_MS}
        title={
          <>
            <AIAvatar size={16} />{" "}
            <FormattedMessage
              id="project.page.ai-generate-document.info.title"
              defaultMessage={"Generator"}
              description={
                "Title of a dialog for generating documents automatically"
              }
            />
          </>
        }
        tip={intl.formatMessage({
          id: "project.page.ai-generate-document.info.tooltip",
          defaultMessage:
            "Open the AI Generator to automatically create a document.",
        })}
      >
        <Button
          onClick={() => setShow(true)}
          style={btnStyle}
          size={mode === "flyout" ? "small" : undefined}
        >
          <Space>
            <AIAvatar size={15} />
            {mode === "full"
              ? ` ${intl.formatMessage(labels.ai_generate_label)}`
              : ""}
          </Space>
        </Button>
      </Tip>
      <AIGenerateDocumentModal
        ext={ext}
        show={show}
        setShow={setShow}
        project_id={project_id}
        filename={filename}
      />
    </>
  );
}
