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
  Icon,
  LLMNameLink,
  Loading,
  Markdown,
  Paragraph,
  RawPrompt,
  Text,
} from "@cocalc/frontend/components";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import ProgressEstimate from "@cocalc/frontend/components/progress-estimate";
import SelectKernel from "@cocalc/frontend/components/run-button/select-kernel";
import { Tip } from "@cocalc/frontend/components/tip";
import { file_options } from "@cocalc/frontend/editor-tmp";
import { Actions as CodeEditorActions } from "@cocalc/frontend/frame-editors/code-editor/actions";
import { JupyterEditorActions } from "@cocalc/frontend/frame-editors/jupyter-editor/actions";
import { Actions as LatexActions } from "@cocalc/frontend/frame-editors/latex-editor/actions";
import LLMSelector, {
  modelToName,
} from "@cocalc/frontend/frame-editors/llm/llm-selector";
import { Actions as RmdActions } from "@cocalc/frontend/frame-editors/rmd-editor/actions";
import getKernelSpec from "@cocalc/frontend/jupyter/kernelspecs";
import { splitCells } from "@cocalc/frontend/jupyter/llm/split-cells";
import NBViewer from "@cocalc/frontend/jupyter/nbviewer/nbviewer";
import { LLMCostEstimation } from "@cocalc/frontend/misc/llm-cost-estimation";
import { LLMEvent } from "@cocalc/frontend/project/history/types";
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
import { capitalize, field_cmp, getRandomColor } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { DELAY_SHOW_MS } from "../../new/consts";
import {
  DOCUMENT,
  EXAMPLES_COMMON,
  Example,
  Ext,
  JUPYTER,
  PAPERSIZE,
} from "./ai-generate-examples";
import { DEFAULT_LANG_EXTRA, LANG_EXTRA, PROMPT } from "./ai-generate-prompts";
import {
  commentBlock,
  getFilename,
  getTimestamp,
  sanitizeFilename,
} from "./ai-generate-utils";

const TAG = "generate-document";
const TAG_TMPL = `${TAG}-template`;
const PLACEHOLDER = "Describe the content...";

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

interface Props {
  project_id: string;
  onSuccess: () => void;
  ext: Ext;
  docName: string;
  show: boolean;
}

function AIGenerateDocument({
  onSuccess,
  show,
  project_id,
  ext,
  docName,
}: Props) {
  const projectActions = useActions({ project_id });
  const current_path = useTypedRedux({ project_id }, "current_path");

  const [model, setModel] = useLanguageModelSetting(project_id);
  const [tokens, setTokens] = useState<number>(0);
  const [paperSize, setPaperSize] = useState<string | null>(null);
  // User's description of document they want to generate.
  const [prompt, setPrompt] = useState<string>("");
  const [querying, setQuerying] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [preview, setPreview] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>("");
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
          "Unable to load Jupyter kernels. Make sure the project is running and Jupyter is installed.",
        );
      }
    })();
  }, [project_id, projectState]);

  const cancel = useRef<boolean>(false);
  // only used for ipynb
  const [ipynb, setIpynb] = useState<null | Ipynb>(null);

  useEffect(() => {
    const sizes = PAPERSIZE[ext];
    if (paperSize == null && sizes != null) {
      setPaperSize(sizes[0]);
    }
  }, [ext]);

  useEffect(() => {
    if (!preview && show) {
      promptRef.current?.focus();
    }
  }, [show, preview]);

  function fullTemplate({ extra, template, paperSizeStr }): string {
    const example = [
      `Example:`,
      `<OUTPUT>\nfilename: [filename.${ext}]`,
      ext === "ipynb"
        ? `${template}`
        : `\`\`\`\n${template}\`\`\`` + `\n</OUTPUT>`,
      `Description of the document:`,
      `${prompt}`,
    ];
    const langExtra = LANG_EXTRA[spec?.language ?? ""] ?? DEFAULT_LANG_EXTRA;
    const intro =
      ext === "ipynb"
        ? `Explain, how to do the following task in the programming language "${
            spec?.display_name ?? "Python"
          }". Your reply will be transformed into a Jupyter Notebook. ${langExtra} Break down all blocks of code into small snippets and wrap each one in triple backticks. Explain each snippet with a concise description, but do not tell me what the output will be. Do not open and read any files, since you cannot assume they exist. Instead, generate random data suitable for the example code. Make sure the entire notebook can run top to bottom. Skip formalities. Do not add a summary. Do not put it all together. Suggest a filename by starting with "filename: [filename.${ext}]"`
        : `Your task is to create a ${docName} document based on the provided description below. It will be used as a template to get started writing the document. ${paperSizeStr}Enclose the entire ${docName} document in tripe backticks. ${extra}Do not open and read any files, since you cannot assume they exist. Instead, generate random data suitable for the example code. Do not add any further instructions. Skip formalities. Do not add a summary. Your output must start with a suggested filename "filename: [filename.${ext}]".`;
    // ATTN: make sure to avoid introducing whitespace at the beginning of lines and keep two newlines between blocks
    return [intro, ...example].join("\n\n");
  }

  function createPrompt(): string {
    if (!prompt?.trim()) return "";
    const paperSizeStr = paperSize
      ? `The size of each page should be ${paperSize}. `
      : "";
    const { extra, template } = PROMPT[ext] ?? {
      extra: "",
      template: "Content of the template.",
    };
    return fullTemplate({ extra, template, paperSizeStr });
  }

  async function generate() {
    const input = createPrompt();

    try {
      cancel.current = false;
      setQuerying(true);

      const llmStream = webapp_client.openai_client.queryStream({
        input,
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

    if (
      !(await ensure_project_running(
        project_id,
        `create the ${docName} document '${path}'`,
      ))
    ) {
      throw new Error(`Unable to create ${docName} document for ${path}`);
    }

    // we don't check if the file exists, because the prompt+timestamp should be unique enough
    await webapp_client.project_client.write_text_file({
      project_id,
      path,
      content: ext === "ipynb" ? JSON.stringify(ipynb, null, 2) : preview,
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

  function extractContent(answer): string {
    const i = answer.indexOf("```");
    const j = answer.lastIndexOf("```");

    if (i !== -1 && j !== -1 && i !== j) {
      // extract the document
      return answer.substring(i + 3, j).trim();
    } else if (i >= 0) {
      // extract everything after i+3
      return answer.substring(i + 3).trim();
    } else {
      return answer;
    }
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
    const fn = sanitizeFilename(fnNext, ext);
    const timestamp = getTimestamp();
    setFilename(`${fn}-${timestamp}.${ext}`);
  }

  async function updateDocument(llmStream: ChatStream): Promise<void> {
    // local state, modified when more data comes in
    let init = false;
    let answer = "";

    // every update interval, we extract all the answer text into cells
    // ATTN: do not call this concurrently, see throttle below
    function updateContent(answer) {
      if (cancel.current) return;
      if (ext === "ipynb") {
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
        const fn = getFilename(answer, prompt, ext);
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
              ext,
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
        // singal "finalization"
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

  const input = createPrompt();

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
      2000,
      { leading: false, trailing: true },
    ),
    [input],
  );

  function renderExamples() {
    if (isEmpty(DOCUMENT[ext])) return;

    const ex = (function (): readonly Example[] {
      switch (ext) {
        case "ipynb":
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
    const sizes = PAPERSIZE[ext];
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
    if (ext !== "ipynb") return;
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
        {typeof kernelSpecs == "object" && kernelSpecs != null ? (
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
        ) : undefined}
      </>
    );
  }

  function renderDialog() {
    const empty = prompt.trim() == "";
    return (
      <>
        <Paragraph strong>
          Select language model:{" "}
          <LLMSelector
            project_id={project_id}
            model={model}
            setModel={setModel}
            style={{ marginTop: "-7.5px" }}
          />
        </Paragraph>
        {renderJupyterKernelSelector()}
        <Paragraph type={empty ? "danger" : undefined}>
          Provide a detailed description of the {docName} document you want to
          create:
        </Paragraph>
        <Paragraph>
          <Input.TextArea
            ref={promptRef}
            allowClear
            autoSize={{ minRows: 3, maxRows: 6 }}
            maxLength={3000}
            placeholder={PLACEHOLDER}
            value={prompt}
            disabled={querying}
            status={empty ? "error" : undefined}
            onChange={({ target: { value } }) => setPrompt(value)}
            onPressEnter={(e) => {
              if (e.shiftKey) {
                generate();
              }
            }}
          />
        </Paragraph>
        {!error ? renderExamples() : undefined}
        {!error ? renderPaperSize() : undefined}
        {input ? (
          <div>
            <Divider />
            <Paragraph type="secondary">
              A prompt to generate the document will be sent to the{" "}
              <LLMNameLink model={model} /> language model. You'll see a preview
              of the new content, which you'll then be able to save in a new
              file and start working on it. Overall, the newly created document
              should help you getting started accomplishing your goal.
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
                      input={input}
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
        ) : undefined}
        {
          <Paragraph style={{ textAlign: "center", marginTop: "15px" }}>
            <Button
              type="primary"
              size="large"
              onClick={generate}
              disabled={!input || !!error || querying || !prompt?.trim()}
            >
              <Icon name="paper-plane" /> Create {docName} content using{" "}
              {modelToName(model)}
            </Button>
          </Paragraph>
        }
        {input && tokens > 0 ? (
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
    return (
      <>
        <div>
          <Paragraph>
            This is a preview of the generated content.{" "}
            {querying ? (
              <Text strong>Please wait until it is fully generated...</Text>
            ) : saving ? (
              <Text strong>The file is saving...</Text>
            ) : (
              <>
                finished generating the content. You can now{" "}
                <Button
                  type="primary"
                  size="small"
                  onClick={save}
                  disabled={disabled}
                >
                  save the file
                </Button>{" "}
                with the given filename.
              </>
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
              <Icon name="arrow-left" /> Discard
            </Button>
            <Button
              type="primary"
              size="large"
              onClick={save}
              disabled={disabled || saving}
            >
              <Icon name="paper-plane" /> Save {docName}
            </Button>
          </Space>
        </Paragraph>
        {!disabled ? (
          <Paragraph type="secondary">
            Click save to store the preview of the content in a new file with
            the given filename. You can then edit and run the computational
            document as usual. Click "discard" to ignore the result and go back
            to the previous step.
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

export function AIGenerateDocumentButton({
  project_id,
  style,
  mode = "full",
  ext,
}: {
  project_id: string;
  style?: CSS;
  mode?: "full" | "flyout";
  ext: Props["ext"];
}) {
  const [show, setShow] = useState<boolean>(false);

  const docName = file_options(`x.${ext}`).name ?? `${capitalize(ext)}`;

  if (
    !redux
      .getStore("projects")
      .hasLanguageModelEnabled(project_id, `generate-document`)
  ) {
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
            <AIAvatar size={16} /> Generator
          </>
        }
        tip="Open the AI Generator to automatically create a document."
      >
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
          {mode === "full" ? ` Generator...` : ""}
        </Button>
      </Tip>
      <Modal
        title={
          <>
            <AIAvatar size={18} /> Generate a {docName} Document using AI
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
        />
      </Modal>
    </>
  );
}
