import { Button, Checkbox, Input, Popover, Space } from "antd";
import { throttle } from "lodash";
import React, { useMemo, useState } from "react";

import { useLanguageModelSetting } from "@cocalc/frontend/account/useLanguageModelSetting";
import { alert_message } from "@cocalc/frontend/alerts";
import { useFrameContext } from "@cocalc/frontend/app-framework";
import { Paragraph } from "@cocalc/frontend/components";
import { Icon } from "@cocalc/frontend/components/icon";
import { LanguageModelVendorAvatar } from "@cocalc/frontend/components/language-model-icon";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import ModelSwitch, {
  modelToName,
} from "@cocalc/frontend/frame-editors/chatgpt/model-switch";
import { NotebookFrameActions } from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/actions";
import { splitCells } from "@cocalc/frontend/jupyter/chatgpt/split-cells";
import track from "@cocalc/frontend/user-tracking";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import {
  LanguageModel,
  getVendorStatusCheckMD,
  model2vendor,
} from "@cocalc/util/db-schema/openai";
import { COLORS } from "@cocalc/util/theme";
import { JupyterActions } from "../browser-actions";
import { insertCell } from "./util";

interface AIGenerateCodeCellProps {
  actions: JupyterActions;
  children: React.ReactNode;
  frameActions: React.MutableRefObject<NotebookFrameActions | undefined>;
  id: string;
  position: "above" | "below" | "replace";
  setShowChatGPT: (show: boolean) => void;
  showChatGPT: boolean;
  closeWhenDone?: boolean;
}

export default function AIGenerateCodeCell({
  actions,
  children,
  frameActions,
  id,
  position,
  setShowChatGPT,
  showChatGPT,
  closeWhenDone,
}: AIGenerateCodeCellProps) {
  const [model, setModel] = useLanguageModelSetting();
  const [querying, setQuerying] = useState<boolean>(false);
  const { project_id, path } = useFrameContext();
  const [prompt, setPrompt] = useState<string>("");
  const [includePreviousCell, setIncludePreviousCell] = useState<boolean>(true);

  const prevCodeContents = getPreviousNonemptyCodeCellContents(
    frameActions.current,
    id,
    position,
  );

  const input = useMemo(() => {
    if (!showChatGPT) return "";
    const { input } = getInput({
      frameActions,
      prompt,
      actions,
      id,
      position,
      model,
      prevCodeContents: includePreviousCell ? prevCodeContents : "",
    });
    return input;
  }, [showChatGPT, prompt, model, includePreviousCell]);

  function doGenerate() {
    queryLanguageModel({
      frameActions,
      actions,
      id,
      position,
      setQuerying,
      model,
      project_id,
      path,
      prompt,
      whenDone: closeWhenDone ? () => setShowChatGPT(false) : undefined,
      prevCodeContents: includePreviousCell ? prevCodeContents : "",
    });
  }

  return (
    <Popover
      placement="bottom"
      title={() => (
        <div style={{ fontSize: "18px" }}>
          <LanguageModelVendorAvatar model={model} size={24} /> Generate code
          cell using{" "}
          <ModelSwitch
            project_id={project_id}
            size="small"
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
                disabled={querying}
                placeholder="Describe the new cell..."
                onPressEnter={(e) => {
                  if (!e.shiftKey) return;
                  doGenerate();
                }}
                autoSize={{ minRows: 2, maxRows: 6 }}
              />
            </Paragraph>
            {prevCodeContents ? (
              <Paragraph>
                <Space>
                  <Checkbox
                    checked={includePreviousCell}
                    onChange={(e) => setIncludePreviousCell(e.target.checked)}
                  >
                    Include previous code cell
                  </Checkbox>
                </Space>
              </Paragraph>
            ) : undefined}
            <Paragraph>
              The following will be sent to {modelToName(model)}:
            </Paragraph>
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
                  onClick={() => {
                    doGenerate();
                  }}
                  disabled={querying || !prompt.trim()}
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
  model: LanguageModel;
  path: string;
  position: "above" | "below" | "replace";
  project_id: string;
  prompt: string;
  setQuerying: (querying: boolean) => void;
  whenDone?: () => void;
  prevCodeContents: string;
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
  setQuerying,
  whenDone,
  prevCodeContents,
}: QueryLanguageModelProps) {
  if (!prompt.trim()) return;

  const { input, system } = getInput({
    actions,
    frameActions,
    id,
    model,
    position,
    prompt,
    prevCodeContents,
  });
  if (!input) {
    return;
  }

  try {
    setQuerying(true);
    const tag = "generate-jupyter-cell";
    track("chatgpt", { project_id, path, tag, type: "generate", model });

    // This is here to make it clear this was generated by a language model.
    // It could also be a comment in the code cell but for that we would need to know how the
    // comment character is in the language.
    const noteCellId = insertCell({
      frameActions,
      actions,
      id,
      position,
      type: "markdown",
      content: `The following cell was generated by ${modelToName(
        model,
      )} using this user prompt:\n\n> ${prompt}\n\n `,
    });
    if (!noteCellId) {
      throw Error("unable to insert cell");
    }
    const fa = frameActions.current;
    if (fa == null) {
      throw Error("frame actions must be defined");
    }
    // this is the first cell
    const firstCellId = insertCell({
      frameActions,
      actions,
      type: "markdown",
      content: ":robot: thinking…",
      id: noteCellId,
      position: "below",
    });
    if (firstCellId == null) {
      throw new Error("unable to insert cells");
    }
    fa.set_mode("escape"); // while tokens come in ...
    fa.set_md_cell_not_editing(firstCellId);

    let curCellId = firstCellId;
    let curCellPos = 0;
    let numCells = 1;

    const stream = await webapp_client.openai_client.languageModelStream({
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
    stream.on("token", (token) => {
      if (token != null) {
        answer += token;
        updateCells(answer);
      } else {
        // fa.switch_code_cell_to_edit(firstCellId);
        whenDone?.();
      }
    });

    stream.on("error", (err) => {
      fa.set_cell_input(
        firstCellId,
        `# Error generating code cell\n\n\`\`\`\n${err}\n\`\`\`\n\n${getVendorStatusCheckMD(
          model2vendor(model),
        )}.`,
      );
      actions.set_cell_type(firstCellId, "markdown");
      fa.set_mode("escape");
      return;
    });

    stream.emit("start");
  } catch (err) {
    alert_message({
      type: "error",
      title: "Problem generating code cell",
      message: `${err}`,
    });
  } finally {
    setQuerying(false);
  }
}

interface GetInputProps {
  actions: JupyterActions;
  frameActions: React.MutableRefObject<NotebookFrameActions | undefined>;
  id: string;
  model: LanguageModel;
  position: "above" | "below" | "replace";
  prompt: string;
  prevCodeContents: string;
}

function getInput({
  actions,
  frameActions,
  prevCodeContents,
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
  const prevCode = prevCodeContents
    ? `The previous code cell is\n\n\`\`\`${lang}\n${prevCodeContents}\n\`\`\``
    : "";

  return {
    input: `Create a new code cell for a Jupyter Notebook.\n\nKernel: "${kernel_name}".\n\nProgramming language: "${lang}".\n\The entire code cell must be in a single code block. Enclose this block in triple backticks. Do not say what the output will be. Add comments as code comments. ${prevCode}\n\nThe new cell should do the following:\n\n${prompt}`,
    system: `Return a single code block in the language "${lang}".`,
  };
}

function getPreviousNonemptyCodeCellContents(actions, id, position): string {
  let delta = position === "below" ? 0 : -1;
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
