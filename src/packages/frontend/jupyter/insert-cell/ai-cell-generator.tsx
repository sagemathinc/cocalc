import type { MenuProps } from "antd";
import {
  Alert,
  Button,
  Collapse,
  Divider,
  Dropdown,
  Flex,
  Input,
  Popover,
  Space,
  Switch,
  Tag,
} from "antd";
import { debounce, throttle } from "lodash";
import React, { useEffect, useRef, useState } from "react";
import { useIntl } from "react-intl";

import { useLanguageModelSetting } from "@cocalc/frontend/account/useLanguageModelSetting";
import { alert_message } from "@cocalc/frontend/alerts";
import {
  useAsyncEffect,
  useFrameContext,
} from "@cocalc/frontend/app-framework";
import type { Message } from "@cocalc/frontend/client/types";
import {
  LLMNameLink,
  Paragraph,
  RawPrompt,
  Text,
} from "@cocalc/frontend/components";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import { Icon } from "@cocalc/frontend/components/icon";
import { NotebookFrameActions } from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/actions";
import { LLMQueryDropdownButton } from "@cocalc/frontend/frame-editors/llm/llm-query-dropdown";
import LLMSelector, {
  modelToName,
} from "@cocalc/frontend/frame-editors/llm/llm-selector";
import { labels } from "@cocalc/frontend/i18n";
import { JupyterActions } from "@cocalc/frontend/jupyter/browser-actions";
import { LLMCellContextSelector } from "@cocalc/frontend/jupyter/llm/cell-context-selector";
import { splitCells } from "@cocalc/frontend/jupyter/llm/split-cells";
import { LLMCostEstimation } from "@cocalc/frontend/misc/llm-cost-estimation";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { LLMEvent } from "@cocalc/frontend/project/history/types";
import { PREVIEW_BOX } from "@cocalc/frontend/project/page/home-page/ai-generate-document";
import track from "@cocalc/frontend/user-tracking";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { LLMTools } from "@cocalc/jupyter/types";
import {
  LanguageModel,
  getLLMServiceStatusCheckMD,
  model2vendor,
} from "@cocalc/util/db-schema/llm-utils";
import {
  capitalize,
  getRandomColor,
  plural,
  smallIntegerToEnglishWord,
} from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import NBViewer from "../nbviewer/nbviewer";
import {
  CellContextContent,
  getNonemptyCellContents,
} from "../util/cell-content";
import { Position } from "./types";
import { insertCell } from "./util";

type Cell = { cell_type: "markdown" | "code"; source: string[] };
type Cells = Cell[];

const EXAMPLES: readonly (readonly [string, readonly string[]])[] = [
  ["Visualize the data.", ["visualize"]],
  ["Run the last function to see it in action.", ["run"]],
  [
    "Combine the code in one large cell and wrap it into a function.",
    ["merge"],
  ],
  [
    "Write a summary in a markdown cell explaining the purpose of the code.",
    ["documentation"],
  ],
  [
    "Summarize the key findings of this analysis in a clear and concise paragraph.",
    ["summary"],
  ],
  [
    "Generate a summary statistics table for the entire dataset",
    ["statistics"],
  ],
  ["Perform a principal component analysis (PCA) on the dataset.", ["PCA"]],
  [
    "Conduct a time series analysis on the dataset and extrapolate.",
    ["time series"],
  ],
  ["Create an interactive slider for the function.", ["interactive"]],
  [
    "Expand this analysis to include additional statistical tests or visualizations.",
    ["statistics"],
  ],
] as const;

interface AIGenerateCodeCellProps {
  actions: JupyterActions;
  children: React.ReactNode;
  frameActions: React.MutableRefObject<NotebookFrameActions | undefined>;
  id: string;
  setShowAICellGen: (show: Position) => void;
  showAICellGen: Position;
  llmTools?: LLMTools;
}

export function AIGenerateCodeCell({
  actions,
  children,
  frameActions,
  id,
  setShowAICellGen,
  showAICellGen,
  llmTools,
}: AIGenerateCodeCellProps) {
  const intl = useIntl();
  const { actions: project_actions } = useProjectContext();
  const { project_id, path } = useFrameContext();
  const cancel = useRef<boolean>(false);
  const [querying, setQuerying] = useState<boolean>(false);
  const [model, setModel] = useLanguageModelSetting(project_id);
  const [prompt, setPrompt] = useState<string>("");
  const [cellTypes, setCellTypes] = useState<"code" | "all">("code");
  // Context for the new selector component - default to 2 previous cells, 0 after
  const [contextRange, setContextRange] = useState<[number, number]>([-2, 0]);
  const [error, setError] = useState<string>();
  const [preview, setPreview] = useState<Cells | null>(null);
  const [attribute, setAttribute] = useState<boolean>(false);
  const promptRef = useRef<HTMLElement>(null);
  const [tokens, setTokens] = useState<number>(0);

  const kernel_info = actions.store.get("kernel_info");
  const lang = kernel_info?.get("language") ?? "python";
  const kernel_name = kernel_info?.get("display_name") ?? "Python 3";

  const open = showAICellGen != null;

  const contextContent = getContextContents();

  const inputPrompt = getInput({
    frameActions,
    prompt,
    lang,
    kernel_name,
    position: showAICellGen,
    model,
    contextContent,
    contextRange,
  });

  const { input } = inputPrompt;

  useEffect(() => {
    if (tokens > 0 && inputPrompt.input == "") setTokens(0);
  }, [input]);

  useAsyncEffect(
    debounce(
      async () => {
        if (input == "") return;

        // do not import until needed -- it is HUGE!
        const { getMaxTokens, numTokensUpperBound } = await import(
          "@cocalc/frontend/misc/llm"
        );

        const { history, system } = inputPrompt;

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
    [input],
  );

  useEffect(() => {
    if (!preview && open) {
      promptRef.current?.focus();
    }
  }, [preview, open]);

  function getContextContents(): CellContextContent {
    const prevCount = -contextRange[0]; // contextRange[0] is negative, so -(-2) = 2
    const nextCount = contextRange[1]; // contextRange[1] is positive for cells after

    if (prevCount === 0 && nextCount === 0) return {};

    return getNonemptyCellContents({
      actions: frameActions.current,
      id,
      direction: "around",
      cellCount: "all", // Use "all" for around direction
      cellTypes,
      lang,
      aboveCount: prevCount,
      belowCount: nextCount,
    });
  }

  function insertCells() {
    if (preview == null) {
      console.error("jupyter cell generator: no preview - should never happen");
      return;
    }

    const fa = frameActions.current;
    if (fa == null) {
      throw Error("frame actions must be defined");
    }

    let curCellId = id;

    // only insert the "attribution" cell, if the user wants.
    // What's recorded in any case is an entry in the project's log.
    if (attribute) {
      // This is here to make it clear this was generated by a language model.
      // It could also be a comment in the code cell but for that we would need to know how the
      // comment character of the language.
      const n = preview.length;
      const cellStr = `${smallIntegerToEnglishWord(n)} ${plural(n, "cell")}`;
      const firstCellId = insertCell({
        frameActions,
        actions,
        id,
        position: showAICellGen,
        type: "markdown",
        content: `The following ${cellStr} was generated by [${modelToName(
          model,
        )}](${
          model2vendor(model).url
        }) in response to the prompt:\n\n> ${prompt}\n\n `,
      });

      if (!firstCellId) {
        throw new Error("unable to insert cell");
      }

      fa.set_mode("escape");
      fa.set_md_cell_not_editing(firstCellId);

      curCellId = firstCellId;
    }

    for (let i = 0; i < preview.length; i++) {
      const cell = preview[i];
      const nextCellId = insertCell({
        frameActions,
        actions,
        id: curCellId,
        position: "below",
        type: cell.cell_type,
        content: cell.source.join(""),
      });

      // this shouldn't happen
      if (nextCellId == null) continue;

      fa.set_mode("escape");
      if (cell.cell_type === "markdown") {
        fa.set_md_cell_not_editing(nextCellId);
      }

      curCellId = nextCellId;
    }
  }

  async function queryLanguageModel({
    contextContent,
  }: {
    contextContent: CellContextContent;
  }) {
    if (!prompt.trim()) return;

    const { input, history, system } = getInput({
      lang,
      kernel_name,
      frameActions,
      model,
      position: showAICellGen,
      prompt,
      contextContent,
      contextRange,
    });

    if (!input) {
      return;
    }

    try {
      const tag = `generate-jupyter-cell`;
      track("chatgpt", {
        project_id,
        path,
        tag,
        type: "generate",
        model,
        contextRange,
      });

      const stream = await webapp_client.openai_client.queryStream({
        input,
        history,
        system,
        project_id,
        path,
        tag,
        model,
      });

      const updateCells = throttle(
        function (answer) {
          if (cancel.current) return;
          const cells = splitCells(answer);
          setPreview(cells);
        },
        500,
        { leading: true, trailing: true },
      );

      let answer = "";

      stream.on("token", async (token) => {
        if (cancel.current) {
          // we abort this
          stream.removeAllListeners();
          // single "finalization"
          updateCells(answer);
          return;
        }

        if (token != null) {
          answer += token;
          updateCells(answer);
        } else {
          // reply emits undefined text *once* when done, so done at this point.
          updateCells(answer);
          setQuerying(false);
        }
      });

      stream.on("error", (err) => {
        setError(
          `Error generating code cell: ${err}\n\n${getLLMServiceStatusCheckMD(
            model2vendor(model).name,
          )}.`,
        );
        setQuerying(false);
      });

      stream.emit("start");
    } catch (err) {
      setPreview(null);
      alert_message({
        type: "error",
        title: "Problem generating code cell",
        message: `${err}`,
      });
    }
  }

  function doQuery(contextContent: CellContextContent) {
    cancel.current = false;
    setError("");
    setQuerying(true);

    if (showAICellGen == null) return;

    queryLanguageModel({
      contextContent,
    });

    // we also log this
    const event: LLMEvent = {
      event: "llm",
      usage: "jupyter-generate-cell",
      model,
      path,
    };
    project_actions?.log(event);
  }

  function renderExamples() {
    const items: MenuProps["items"] = EXAMPLES.map(([ex, tags], idx) => {
      const label = (
        <Flex gap={"5px"} justify="space-between">
          <Flex>{ex} </Flex>
          <Flex>
            {tags.map((tag) => (
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
          setPrompt(ex);
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

  function renderContext() {
    return (
      <>
        <Divider orientation="left">
          <Text>Context</Text>
        </Divider>
        <LLMCellContextSelector
          contextRange={contextRange}
          onContextRangeChange={setContextRange}
          cellTypes={cellTypes}
          onCellTypesChange={setCellTypes}
          currentCellId={id}
          frameActions={frameActions.current}
          mode="insert-position"
        />
      </>
    );
  }

  function insert() {
    insertCells();
    setPreview(null);
    setShowAICellGen(null);
  }

  function renderContentPreview() {
    const cellStr = plural(preview?.length ?? 0, "cell");
    return (
      <>
        <Paragraph>
          This is a preview of the generated content.{" "}
          {querying ? (
            <Text strong>Please wait until it is fully generated...</Text>
          ) : (
            <Text strong>
              You can now{" "}
              <Button
                size="small"
                onClick={insert}
                type="primary"
                disabled={querying}
              >
                <Icon name="plus" /> insert the {cellStr}
              </Button>
              .
            </Text>
          )}
        </Paragraph>
        <Paragraph>
          <NBViewer
            content={JSON.stringify(
              { metadata: { kernelspec: kernel_info }, cells: preview },
              null,
              2,
            )}
            fontSize={undefined}
            style={PREVIEW_BOX}
            cellListStyle={{
              transform: "scale(0.9)",
              transformOrigin: "top left",
              width: "110%",
            }}
            scrollBottom={true}
          />
        </Paragraph>
        <Paragraph>
          <Flex align="center" gap="10px">
            <Flex flex={0}>
              <Switch
                value={attribute}
                onChange={(val) => setAttribute(val)}
                unCheckedChildren={"Only cells"}
                checkedChildren={"With attribution"}
              />
            </Flex>
            <Flex flex={1}>
              <Text type="secondary">
                Include cell describing the language model and prompt.
              </Text>
            </Flex>
          </Flex>
        </Paragraph>
        <Paragraph style={{ textAlign: "center", marginTop: "15px" }}>
          <Space size="middle">
            <Button
              size="large"
              onClick={() => {
                cancel.current = true;
                setPreview(null);
                setQuerying(false);
              }}
            >
              {intl.formatMessage(labels.cancel)}
            </Button>
            <Button
              size="large"
              onClick={insert}
              type="primary"
              disabled={querying}
            >
              <Icon name="plus" /> Insert {capitalize(cellStr)}
            </Button>
          </Space>
        </Paragraph>
        {error ? <Alert type="error" message={error} /> : undefined}
      </>
    );
  }

  function renderPromptPreview() {
    if (!input?.trim()) return;

    const { history, system } = inputPrompt;
    const ex = history.map(({ content }) => content).join("\n\n");
    const raw = [input, "Example:", ex, "System:", system].join("\n\n");

    return (
      <>
        <Divider />
        <Paragraph type="secondary">
          A prompt to generate one or more cells based on your description and
          context will be sent to the <LLMNameLink model={model} /> language
          model.
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
                  style={{ border: "none", padding: "0", margin: "0" }}
                />
              ),
            },
          ]}
        />
      </>
    );
  }

  function renderContentDialog() {
    const empty = prompt.trim() == "";
    return (
      <>
        <Paragraph>What do you want the new cell to do?</Paragraph>
        <Paragraph>
          <Input.TextArea
            ref={promptRef}
            allowClear
            autoFocus
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
            }}
            placeholder="Describe the new cell..."
            onPressEnter={(e) => {
              if (!e.shiftKey) return;
              e.preventDefault(); // prevent the default action
              e.stopPropagation(); // stop event propagation
              doQuery(contextContent);
            }}
            autoSize={{ minRows: 2, maxRows: 6 }}
          />
        </Paragraph>
        {renderExamples()}
        {empty ? undefined : renderContext()}
        {renderPromptPreview()}
        <Paragraph style={{ textAlign: "center", marginTop: "30px" }}>
          <Space size="large">
            <Button onClick={() => setShowAICellGen(null)}>Cancel</Button>
            <LLMQueryDropdownButton
              disabled={!prompt.trim()}
              loading={querying}
              onClick={() => doQuery(contextContent)}
              llmTools={llmTools}
              task="Generate using"
            />
          </Space>
        </Paragraph>
        {input && tokens > 0 ? (
          <LLMCostEstimation
            tokens={tokens}
            model={model}
            paragraph
            textAlign="center"
            type="secondary"
          />
        ) : undefined}
        {error ? <Alert type="error" message={error} /> : undefined}
      </>
    );
  }

  // called, when actually displayed
  function renderContent() {
    return (
      <div style={{ maxWidth: "min(650px, 90vw)" }}>
        {preview ? renderContentPreview() : renderContentDialog()}
      </div>
    );
  }

  return (
    <Popover
      placement="bottom"
      title={() => (
        <div style={{ fontSize: "18px" }}>
          <AIAvatar size={22} /> Generate code cell using{" "}
          <LLMSelector
            project_id={project_id}
            model={model}
            setModel={(model) => {
              setError("");
              setModel(model);
            }}
          />
          <Button
            onClick={() => setShowAICellGen(null)}
            type="text"
            style={{ float: "right", color: COLORS.GRAY_M }}
          >
            <Icon name="times" />
          </Button>
        </div>
      )}
      open={open}
      content={renderContent}
      trigger={[]}
      destroyOnHidden
    >
      {children}
    </Popover>
  );
}

interface GetInputProps {
  frameActions: React.MutableRefObject<NotebookFrameActions | undefined>;
  model: LanguageModel;
  position: Position;
  prompt: string;
  contextContent: CellContextContent;
  lang: string;
  kernel_name: string;
  contextRange: [number, number];
}

function getInputPrompt(prompt: string): string {
  return `The new cell should do the following:\n\n${prompt}`;
}

function getInput({
  frameActions,
  prompt,
  contextContent,
  lang,
  kernel_name,
  contextRange,
}: GetInputProps): {
  input: string;
  system: string;
  history: Message[];
} {
  if (!prompt?.trim()) {
    return { input: "", system: "", history: [] };
  }
  if (frameActions.current == null) {
    console.warn(
      "Unable to create cell due to frameActions not being defined.",
    );
    return { input: "", system: "", history: [] };
  }

  const prevCount = -contextRange[0]; // cells before insertion point
  const afterCount = contextRange[1]; // cells after insertion point

  let contextInfo = "";

  if (contextContent.before || contextContent.after) {
    const beforeCells =
      prevCount > 0 ? `${prevCount} cells before` : "no cells before";
    const afterCells =
      afterCount > 0 ? `${afterCount} cells after` : "no cells after";
    contextInfo = `Context: The new cell will be inserted with ${beforeCells} and ${afterCells} the insertion point.\n\n`;

    if (contextContent.before) {
      contextInfo += `Cells BEFORE insertion point:\n<before>\n${contextContent.before}\n</before>\n\n`;
    }

    if (contextContent.after) {
      contextInfo += `Cells AFTER insertion point:\n<after>\n${contextContent.after}\n</after>\n\n`;
    }
  } else {
    contextInfo =
      "Context: The new cell will be inserted at the beginning or end of the notebook.\n\n";
  }

  const history: Message[] = [
    { role: "user", content: getInputPrompt("Show the value of foo.") },
    {
      role: "assistant",
      content: `This is the value of foo:\n\n\`\`\`${lang}\nprint(foo)\n\`\`\``,
    },
  ];

  return {
    input: `${contextInfo}${getInputPrompt(prompt)}`,
    history,
    system: `Create one or more code cells in a Jupyter Notebook.\n\nKernel: "${kernel_name}".\n\nProgramming language: "${lang}".\n\nThe new cell(s) will be inserted at a specific position in the notebook. Pay attention to the context provided - cells marked as BEFORE come before the insertion point, cells marked as AFTER come after the insertion point.\n\nEach code cell must be wrapped in triple backticks. Do not say what the output will be. Be brief.`,
  };
}
