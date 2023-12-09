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
import ModelSwitch, {
  modelToName,
} from "@cocalc/frontend/frame-editors/chatgpt/model-switch";
import { NotebookFrameActions } from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/actions";
import track from "@cocalc/frontend/user-tracking";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import {
  LanguageModel,
  getVendorStatusCheckMD,
  model2vendor,
} from "@cocalc/util/db-schema/openai";
import { unreachable } from "@cocalc/util/misc";
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
  const [model, setModel] = useLanguageModelSetting();
  const [querying, setQuerying] = useState<boolean>(false);
  const { project_id, path } = useFrameContext();
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

  return (
    <Popover
      placement="bottom"
      title={() => (
        <div style={{ fontSize: "18px" }}>
          <LanguageModelVendorAvatar model={model} size={24} /> Generate code
          cell using{" "}
          <ModelSwitch size="small" model={model} setModel={setModel} />
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
                  });
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
                  onClick={() => {
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
                    });
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

/**
 * extract the code between the first and second occurance of lines starting with backticks
 * TODO: cocalc has a markdown parser and is very good at parsing markdown (e.g., slate uses that),
 * and we should obviously using that instead of an adhoc parsing that will break on some inputs,
 * e.g., triple backticks is not ALWAYS the code delimiter (it can be spaces, it can be more than 3
 * backticks).
 */
function extractCode(raw: string): {
  content: string;
  type: "code" | "markdown";
} {
  const ret: string[] = [];
  let inside = false;
  let haveCode = false;
  for (const line of raw.split("\n")) {
    if (line.startsWith("```")) {
      inside = true;
      continue;
    }
    if (inside) {
      // ignore the remaining lines
      if (line.startsWith("```")) break;
      ret.push(line);
      haveCode = true;
    }
  }

  // if there is nothing in "ret", it probably returned a comment explaining it does not know what to do
  if (ret.length > 0) {
    return {
      content: ret.join("\n"),
      type: haveCode ? "code" : "markdown",
    };
  } else {
    return { content: raw, type: "markdown" };
  }
}

interface QueryLanguageModelProps {
  actions: JupyterActions;
  frameActions: React.MutableRefObject<NotebookFrameActions | undefined>;
  id: string;
  model: LanguageModel;
  path: string;
  position: "above" | "below";
  project_id: string;
  prompt: string;
  setQuerying: (querying: boolean) => void;
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
    setQuerying(true);
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
    const gptCellId = insertCell({
      frameActions,
      actions,
      type: "markdown",
      content: ":robot: thinking…",
      id: noteCellId,
      position: "below",
    });
    fa.set_mode("escape"); // while tokens come in ...
    if (gptCellId == null) return; // to make TS happy

    const reply = await webapp_client.openai_client.languageModelStream({
      input,
      project_id,
      path,
      system,
      tag,
      model,
    });

    const updateCell = throttle(
      function (answer) {
        const { content, type } = extractCode(answer);
        fa.set_cell_input(gptCellId, content);
        actions.set_cell_type(gptCellId, type);
      },
      750,
      { leading: true, trailing: true },
    );

    let answer = "";
    reply.on("token", (token) => {
      if (token != null) {
        answer += token;
        updateCell(answer);
      } else {
        fa.switch_code_cell_to_edit(gptCellId);
      }
    });
    reply.on("error", (err) => {
      fa.set_cell_input(
        gptCellId,
        `# Error generating code cell\n\n\`\`\`\n${err}\n\`\`\`\n\n${getVendorStatusCheckMD(
          model2vendor(model),
        )}.`,
      );
      actions.set_cell_type(gptCellId, "markdown");
      fa.set_mode("escape");
      return;
    });
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
  position: "above" | "below";
  prompt: string;
}

function getInput({
  actions,
  frameActions,
  id,
  model,
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
  const vendor = model2vendor(model);
  switch (vendor) {
    case "openai":
      const prevCodeContents = getPreviousNonemptyCodeCellContents(
        frameActions.current,
        id,
        position,
      );
      const prevCode = prevCodeContents
        ? `The previous code cell is\n\n\`\`\`${lang}\n${prevCodeContents}\n\`\`\``
        : "";

      return {
        input: `Create a new code cell for a Jupyter Notebook.\n\nKernel: "${kernel_name}".\n\nProgramming language: "${lang}".\n\nReturn the entire code cell in a single block. Enclose this block in triple backticks. Do not say what the output will be. Add comments as code comments. ${prevCode}\n\nThe new cell should do the following:\n\n${prompt}`,
        system: `Return a single code block in the language "${lang}". All text explanations must be code comments.`,
      };

    case "google":
      // 2023-12-08: when implementing this for PaLM2, the prompt above does not return anything. It fails with "content blocked" with reason "other".
      // My suspicion: 1. this is a bug triggered by the prompt/system and 2. it might not be always able to deal with newlines. I'm simplifying the input prompt to be on a single line and do not include the previous cell.
      return {
        input: `Write code for ${kernel_name} (${lang}). The code should do the following: ${prompt}`,
        system: `Any text must be code comments.`,
      };

    default:
      unreachable(vendor);
      throw new Error("bug");
  }
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
