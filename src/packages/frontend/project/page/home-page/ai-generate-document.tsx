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
import { Actions as RmdActions } from "@cocalc/frontend/frame-editors/rmd-editor/actions";
import { Actions as LatexActions } from "@cocalc/frontend/frame-editors/latex-editor/actions";
import { ChatStream } from "@cocalc/frontend/client/llm";
import {
  A,
  Icon,
  Markdown,
  Paragraph,
  RawPrompt,
} from "@cocalc/frontend/components";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import ProgressEstimate from "@cocalc/frontend/components/progress-estimate";
import { file_options } from "@cocalc/frontend/editor-tmp";
import { Actions as CodeEditorActions } from "@cocalc/frontend/frame-editors/code-editor/actions";
import LLMSelector, {
  modelToName,
} from "@cocalc/frontend/frame-editors/llm/llm-selector";
import { LLMCostEstimation } from "@cocalc/frontend/misc/llm-cost-estimation";
import { LLMEvent } from "@cocalc/frontend/project/history/types";
import { STYLE as NEW_FILE_STYLE } from "@cocalc/frontend/project/new/new-file-button";
import { ensure_project_running } from "@cocalc/frontend/project/project-start-warning";
import track from "@cocalc/frontend/user-tracking";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import {
  getLLMServiceStatusCheckMD,
  model2vendor,
} from "@cocalc/util/db-schema/llm-utils";
import { capitalize, getRandomColor } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { DOCUMENT, Ext, PAPERSIZE } from "./ai-generate-examples";
import { PROMPT } from "./ai-generate-prompts";
import {
  commentBlock,
  getFilename,
  getTimestamp,
  sanitizeFilename,
} from "./ai-generate-utils";

const TAG = "generate-document";
const PLACEHOLDER = "Describe the content...";

interface Props {
  project_id: string;
  onSuccess: () => void;
  ext: Ext;
  docName: string;
}

function AIGenerateDocument({ onSuccess, project_id, ext, docName }: Props) {
  const projectActions = useActions({ project_id });
  const current_path = useTypedRedux({ project_id }, "current_path");

  const [model, setModel] = useLanguageModelSetting(project_id);
  const [tokens, setTokens] = useState<number>(0);
  const [paperSize, setPaperSize] = useState<string | null>(null);
  // User's description of document they want to generate.
  const [prompt, setPrompt] = useState<string>("");
  const [querying, setQuerying] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [preview, setPreview] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>("");

  function fullTemplate({ extra, template, paperSizeStr }): string {
    // ATTN: make sure to avoid introducing whitespace at the beginning of lines and keep two newlines between blocks
    return [
      `Your task is to create a ${docName} document based on the provided description below. It will be used as a template to get started writing the document. ${paperSizeStr}Your output must start with a suggested filename "filename: [filename.${ext}]". Enclose the entire ${docName} document in tripe backticks. ${extra}Do not add any further instructions.`,
      `Example:`,
      `<OUTPUT>\nfilename: [filename.${ext}]`,
      `\`\`\`\n${template}\`\`\`\n</OUTPUT>`,
      `Description of the document:`,
      `${prompt}`,
    ].join("\n\n");
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
      setError(`${err}\n\n${getLLMServiceStatusCheckMD(model2vendor(model))}.`);
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
      content: preview,
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

  function processAnswer(answer: string): string {
    const ts = new Date().toISOString().split(".")[0].replace("T", " ");
    const intro =
      ext === "tex"
        ? commentBlock(
            [
              `${docName} document was generated by ${modelToName(model)}`,
              `Created ${ts}`,
              "\n",
            ].join("\n"),
            ext,
          )
        : "";

    const content = (function () {
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
    })();

    return `${intro}${content}`;
  }

  async function save() {
    setQuerying(true);
    try {
      if (preview == null) {
        console.error("ai doc generator: no preview - should never happen");
      } else {
        const path = await createDocument(preview);
        // this will also open it in the foreground
        const la = await getEditorActions(path);
        // TODO: figure out why we have to wait (initial auto build?)
        await new Promise((resolve, _) => setTimeout(resolve, 2000));
        if (la != null) {
          switch (ext) {
            case "rmd":
              (la as RmdActions).build();
              break;
            case "tex":
              (la as LatexActions).build();
              break;
          }
        }
      }
      setPreview(null);
      setQuerying(false);
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
      setPreview(processAnswer(answer));
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
      3000,
      { leading: false, trailing: true },
    ),
    [input],
  );

  function renderExamples() {
    if (isEmpty(DOCUMENT[ext])) return;

    const items: MenuProps["items"] = DOCUMENT[ext].map((ex, idx) => {
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
            <Radio.Button
              key={size}
              value={size}
              type={size === paperSize ? "primary" : undefined}
            >
              {size}
            </Radio.Button>
          ))}
        </Radio.Group>
      </Paragraph>
    );
  }

  function renderDialog() {
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
        <Paragraph>
          Provide a detailed description of the {docName} document you want to
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
        {!error ? renderExamples() : undefined}
        {!error ? renderPaperSize() : undefined}
        {input ? (
          <div>
            <Paragraph type="secondary">
              The following will be submitted to the{" "}
              <A href={"https://chat.openai.com/"}>{modelToName(model)}</A>{" "}
              language model. Its response will be inserted into a new {docName}
              document the fly. Overall, the newly created document should help
              you getting started accomplishing your goal.
            </Paragraph>
            <RawPrompt
              input={input}
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
        {
          <Paragraph style={{ textAlign: "center", marginTop: "15px" }}>
            <Button
              type="primary"
              size="large"
              onClick={generate}
              disabled={!input || !!error || querying || !prompt?.trim()}
            >
              <Icon name="paper-plane" /> Create {docName} content using{" "}
              {modelToName(model)} (shift+enter)
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

  function renderPreview() {
    if (preview == null) return;
    return (
      <>
        <div>
          <Paragraph type="secondary">
            This is the preview of the generated content.
          </Paragraph>
          <Paragraph>
            <Flex vertical={false} gap={"10px"} align="center">
              <Flex flex={0}>Filename:</Flex>
              <Flex flex={"1 1 auto"}>
                <Input
                  style={{ width: "100%" }}
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  disabled={querying}
                />
              </Flex>
            </Flex>
          </Paragraph>
          <RawPrompt
            input={preview}
            scrollBottom={true}
            style={{
              border: `1px solid ${COLORS.GRAY}`,
              maxHeight: "20em",
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
        <Paragraph style={{ textAlign: "center", marginTop: "15px" }}>
          <Space size="middle">
            <Button
              size="large"
              onClick={() => {
                setQuerying(false);
                setPreview(null);
              }}
            >
              <Icon name="arrow-left" /> Back
            </Button>
            <Button
              type="primary"
              size="large"
              onClick={save}
              disabled={querying || !preview?.trim()}
            >
              <Icon name="paper-plane" /> Save {docName}
            </Button>
          </Space>
        </Paragraph>
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
        {mode === "full" ? ` Generator` : ""}
      </Button>
      <Modal
        title={
          <>
            <AIAvatar size={18} /> Generate a {docName} Document using AI
          </>
        }
        width={650}
        open={show}
        onCancel={() => setShow(false)}
        footer={null}
      >
        <AIGenerateDocument
          project_id={project_id}
          onSuccess={() => setShow(false)}
          ext={ext}
          docName={docName}
        />
      </Modal>
    </>
  );
}
