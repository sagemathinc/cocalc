/*
Use ChatGPT to explain what the code in a cell does.
*/

import { Alert, Button } from "antd";
import { CSSProperties, useState } from "react";

import getChatActions from "@cocalc/frontend/chat/get-actions";
import { Text } from "@cocalc/frontend/components";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import { Icon } from "@cocalc/frontend/components/icon";
import PopconfirmKeyboard from "@cocalc/frontend/components/popconfirm-keyboard";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import LLMSelector, {
  LanguageModel,
  modelToMention,
  modelToName,
} from "@cocalc/frontend/frame-editors/llm/llm-selector";
import { LLMTools } from "@cocalc/jupyter/types";
import { COLORS } from "@cocalc/util/theme";
import type { JupyterActions } from "../browser-actions";
import { RawPrompt } from "./raw-prompt";

interface Props {
  actions?;
  id: string;
  style?: CSSProperties;
  llmTools?: LLMTools;
}

export default function LLMExplainCell({
  actions,
  id,
  style,
  llmTools,
}: Props) {
  const { project_id, path } = useFrameContext();
  const [gettingExplanation, setGettingExplanation] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  if (actions == null || llmTools == null) {
    return null;
  }
  const { model, setModel } = llmTools;
  return (
    <div style={style}>
      <PopconfirmKeyboard
        icon={<AIAvatar size={20} />}
        title={
          <Text strong>
            Explain this cell using{" "}
            <LLMSelector
              model={model}
              setModel={setModel}
              project_id={project_id}
            />
          </Text>
        }
        description={() => {
          const message = createMessage({
            id,
            actions,
            model,
            open: true,
            full: false,
          });
          return (
            <div
              style={{
                width: "550px",
                overflow: "auto",
                maxWidth: "90vw",
                maxHeight: "300px",
              }}
            >
              The following will be sent to {modelToName(model)}:
              <RawPrompt input={message} />
            </div>
          );
        }}
        onConfirm={async () => {
          setGettingExplanation(true);
          try {
            await getExplanation({ id, actions, project_id, path, model });
          } catch (err) {
            setError(`${err}`);
          } finally {
            setGettingExplanation(false);
          }
        }}
        okText={
          <>
            <Icon name={"paper-plane"} /> Ask {modelToName(model)} (enter)
          </>
        }
      >
        <Button
          style={{ color: COLORS.GRAY_M, fontSize: "11px" }}
          size="small"
          type="text"
          disabled={gettingExplanation}
        >
          <AIAvatar
            size={12}
            style={{ marginRight: "5px" }}
            innerStyle={{ top: "2.5px" }}
          />
          Explain
        </Button>
      </PopconfirmKeyboard>
      {error && (
        <Alert
          style={{ maxWidth: "600px", margin: "15px 0" }}
          type="error"
          showIcon
          closable
          message={error}
          onClick={() => setError("")}
        />
      )}
    </div>
  );
}

async function getExplanation({
  id,
  actions,
  project_id,
  path,
  model,
}: {
  id: string;
  actions: JupyterActions;
  project_id: string;
  path: string;
  model: LanguageModel;
}) {
  const message = createMessage({ id, actions, model, open: false });
  if (!message) {
    console.warn("getHelp -- no cell with id", id);
    return;
  }
  // scroll to bottom *after* the message gets sent.
  const chatActions = await getChatActions(actions.redux, project_id, path);
  setTimeout(() => chatActions.scrollToBottom(), 100);
  await chatActions.send_chat({
    input: message,
    tag: "jupyter-explain",
    noNotification: true,
  });
}

function createMessage({ id, actions, model, open, full = true }): string {
  const cell = actions.store.get("cells").get(id);
  if (!cell) {
    return "";
  }
  const kernel_info = actions.store.get("kernel_info");
  const language = kernel_info.get("language");
  const message = createMessageText({
    language,
    cell,
    open,
    kernel_info,
    full,
  });
  const mention = modelToMention(model);
  return full ? `${mention} ${message}` : message;
}

function createMessageText({
  language,
  cell,
  open,
  kernel_info,
  full,
}): string {
  const message: string[] = [];
  message.push(
    `Explain the following ${kernel_info.get(
      "display_name",
    )} code that is in a Jupyter notebook:`,
  );

  if (full) message.push(`<details${open ? " open" : ""}>`);
  message.push(`\`\`\`${language}\n${cell.get("input")}\n\`\`\``);
  if (full) message.push(`</details>`);

  return message.join("\n\n");
}
