import { Button, Input, Popover, Space } from "antd";
import { throttle } from "lodash";
import React, { useMemo, useState } from "react";

import { useLanguageModelSetting } from "@cocalc/frontend/account/useLanguageModelSetting";
import { alert_message } from "@cocalc/frontend/alerts";
import { useFrameContext } from "@cocalc/frontend/app-framework";
import { Paragraph } from "@cocalc/frontend/components";
import { Icon } from "@cocalc/frontend/components/icon";
import { LanguageModelVendorAvatar } from "@cocalc/frontend/components/language-model-icon";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { NotebookFrameActions } from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/actions";
import ModelSwitch, {
  modelToName,
} from "@cocalc/frontend/frame-editors/llm/model-switch";
import { splitCells } from "@cocalc/frontend/jupyter/chatgpt/split-cells";
import track from "@cocalc/frontend/user-tracking";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import {
  LanguageModel,
  getVendorStatusCheckMD,
  model2vendor,
} from "@cocalc/util/db-schema/llm";
import { COLORS } from "@cocalc/util/theme";
import { JupyterActions } from "../browser-actions";
import { insertCell } from "./util";

interface AIGenerateCodeCellProps {
  actions: JupyterActions;
  children: React.ReactNode;
  frameActions: React.MutableRefObject<NotebookFrameActions | undefined>;
  id: string;
  position: "above" | "below";
  setShowChatGPT: (show: boolean) => void;
  showChatGPT: boolean;
}

export default function AIGenerateCodeCell({
  actions,
  children,
  frameActions,
  id,
  position,
  setShowChatGPT,
  showChatGPT,
}: AIGenerateCodeCellProps) {
  const { project_id, path } = useFrameContext();

  const [model, setModel] = useLanguageModelSetting(project_id);
  const [prompt, setPrompt] = useState<string>("");
  const input = useMemo(() => {
    if (!showChatGPT) return "";
    const { input } = getInput({
      frameActions,
      prompt,
      actions,
      id,
      position,
      model,
    });
    return input;
  }, [showChatGPT, prompt, model]);

  const doQuery = () => {
    queryLanguageModel({
      frameActions,
      actions,
      id,
      position,
      model,
      project_id,
      path,
      prompt,
    });
    setShowChatGPT(false);
  };

  return (
    <Popover
      placement="bottom"
      title={() => (
        <div style={{ fontSize: "18px" }}>
          <LanguageModelVendorAvatar model={model} size={24} /> Generate code
          cell using{" "}
          <ModelSwitch
            project_id={project_id}
            model={model}
            setModel={setModel}
          />
          <Button
            onClick={() => {
              setShowChatGPT(false);
            }}
            type="text"
            style={{ float: "right", color: COLORS.GRAY_M }}
          >
            <Icon name="times" />
          </Button>
        </div>
      )}
      open={showChatGPT}
      content={() => (
        <div style={{ width: "500px", maxWidth: "90vw" }}>
          <>
            <Paragraph>Describe what the new cell should do.</Paragraph>
            <Paragraph>
              <Input.TextArea
                allowClear
                autoFocus
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                }}
                placeholder="Describe the new cell..."
                onPressEnter={(e) => {
                  if (!e.shiftKey) return;
                  doQuery();
                }}
                autoSize={{ minRows: 2, maxRows: 6 }}
              />
            </Paragraph>
            The following will be sent to {modelToName(model)}:
            <StaticMarkdown
              value={input}
              style={{
                border: "1px solid lightgrey",
                borderRadius: "5px",
                margin: "5px 0",
                padding: "10px",
                overflowY: "auto",
                maxHeight: "150px",
              }}
            />
            <Paragraph style={{ textAlign: "center", marginTop: "30px" }}>
              <Space size="large">
                <Button onClick={() => setShowChatGPT(false)}>Cancel</Button>
                <Button
                  type="primary"
                  onClick={doQuery}
                  disabled={!prompt.trim()}
                >
                  <Icon name={"paper-plane"} /> Generate Using{" "}
                  {modelToName(model)} (shift+enter)
                </Button>
              </Space>
            </Paragraph>
          </>
        </div>
      )}
      trigger={[]}
    >
      {children}
    </Popover>
  );
}

interface QueryLanguageModelProps {
  actions: JupyterActions;
  frameActions: React.MutableRefObject<NotebookFrameActions | undefined>;
  id: string;
  model: LanguageModel | string;
  path: string;
  position: "above" | "below";
  project_id: string;
  prompt: string;
}

async function queryLanguageModel({
  actions,
  frameActions,
  id,
  model,
  path,
  position,
  project_id,
  prompt,
}: QueryLanguageModelProps) {
  if (!prompt.trim()) return;
  const { input, system } = getInput({
    actions,
    frameActions,
    id,
    model,
    position,
    prompt,
  });
  if (!input) {
    return;
  }

  try {
    const fa = frameActions.current;
    if (fa == null) {
      throw Error("frame actions must be defined");
    }
    const tag = "generate-jupyter-cell";
    track("chatgpt", { project_id, path, tag, type: "generate", model });

    // This is here to make it clear this was generated by GPT.
    // It could also be a comment in the code cell but for that we would need to know how the
    // comment character is in the language.
    const noteCellId = insertCell({
      frameActions,
      actions,
      id,
      position,
      type: "markdown",
      content: `The code below was generated by ${modelToName(
        model,
      )} using this prompt:\n\n> ${prompt}\n\n `,
    });
    if (!noteCellId) {
      throw Error("unable to insert cell");
    }
    // this is the first cell
    const firstCellId = insertCell({
      frameActions,
      actions,
      type: "markdown",
      content: ":robot: Generating…",
      id: noteCellId,
      position: "below",
    });
    fa.set_mode("escape"); // while tokens come in ...
    if (firstCellId == null) return; // to make TS happy
    fa.set_md_cell_not_editing(noteCellId);
    fa.set_md_cell_not_editing(firstCellId);

    let curCellId = firstCellId;
    let curCellPos = 0;
    let numCells = 1;

    const reply = await webapp_client.openai_client.languageModelStream({
      input,
      project_id,
      path,
      system,
      tag,
      model,
    });

    const updateCells = throttle(
      function (answer) {
        const cells = splitCells(answer);
        if (cells.length === 0) return;

        // we always have to update the last cell, even if there are more cells ahead
        fa.set_cell_input(curCellId, cells[curCellPos].source.join(""));
        actions.set_cell_type(curCellId, cells[curCellPos].cell_type);

        if (cells.length > numCells) {
          for (let i = numCells; i < cells.length; i++) {
            const nextCellId = insertCell({
              frameActions,
              actions,
              id: curCellId,
              position: "below",
              type: cells[i].cell_type,
              content: cells[i].source.join(""),
            });
            // this shouldn't happen
            if (nextCellId == null) continue;
            curCellId = nextCellId;
            curCellPos = i; // for the next update, above before the if/for loop
            numCells += 1;
          }
        }
      },
      750,
      { leading: true, trailing: true },
    );

    let answer = "";
    reply.on("token", (text) => {
      // console.log("token", { text });
      if (text != null) {
        answer += text;
        updateCells(answer);
      } else {
        // reply emits undefined text when done, so done at this point.
        fa.switch_code_cell_to_edit(firstCellId);
      }
    });
    reply.on("error", (err) => {
      // console.log("ERROR", err);
      fa.set_cell_input(
        firstCellId,
        `# Error generating code cell\n\n\`\`\`\n${err}\n\`\`\`\n\n${getVendorStatusCheckMD(
          model2vendor(model),
        )}.`,
      );
      actions.set_cell_type(firstCellId, "markdown");
      fa.set_md_cell_not_editing(firstCellId);
      fa.set_mode("escape");
    });
  } catch (err) {
    alert_message({
      type: "error",
      title: "Problem generating code cell",
      message: `${err}`,
    });
  }
}

interface GetInputProps {
  actions: JupyterActions;
  frameActions: React.MutableRefObject<NotebookFrameActions | undefined>;
  id: string;
  model: LanguageModel | string;
  position: "above" | "below";
  prompt: string;
}

function getInput({
  actions,
  frameActions,
  id,
  position,
  prompt,
}: GetInputProps): {
  input: string;
  system: string;
} {
  if (!prompt?.trim()) {
    return { input: "", system: "" };
  }
  if (frameActions.current == null) {
    console.warn(
      "Unable to create cell due to frameActions not being defined.",
    );
    return { input: "", system: "" };
  }
  const kernel_info = actions.store.get("kernel_info");
  const lang = kernel_info?.get("language") ?? "python";
  const kernel_name = kernel_info?.get("display_name") ?? "Python 3";
  const prevCodeContents = getPreviousNonemptyCodeCellContents(
    frameActions.current,
    id,
    position,
  );
  const prevCode = prevCodeContents
    ? `The previous code cell is\n\n\`\`\`${lang}\n${prevCodeContents}\n\`\`\``
    : "";

  return {
    input: `Create a new code cell for a Jupyter Notebook.\n\nKernel: "${kernel_name}".\n\nProgramming language: "${lang}".\n\The entire code cell must be in a single code block. Enclose this block in triple backticks. Do not say what the output will be. Add comments as code comments. ${prevCode}\n\nThe new cell should do the following:\n\n${prompt}`,
    system: `Return a single code block in the language "${lang}".`,
  };
}

function getPreviousNonemptyCodeCellContents(actions, id, position): string {
  let delta = position == "below" ? 0 : -1;
  while (true) {
    const prevId = actions.getPreviousCodeCellID(id, delta);
    if (!prevId) return "";
    const code = actions.get_cell_input(prevId)?.trim();
    if (code) {
      return code;
    }
    delta -= 1;
  }
}
