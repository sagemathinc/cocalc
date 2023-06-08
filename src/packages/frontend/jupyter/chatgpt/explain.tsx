/*
Use ChatGPT to explain what the code in a cell does.
*/

import { CSSProperties, useState } from "react";
import { Alert, Button } from "antd";
import OpenAIAvatar from "@cocalc/frontend/components/openai-avatar";
import type { JupyterActions } from "../browser-actions";
import getChatActions from "@cocalc/frontend/chat/get-actions";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import PopconfirmKeyboard from "@cocalc/frontend/components/popconfirm-keyboard";
import { Icon } from "@cocalc/frontend/components/icon";
import ModelSwitch, {
  modelToMention,
  modelToName,
  Model,
} from "@cocalc/frontend/frame-editors/chatgpt/model-switch";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";

interface Props {
  actions?;
  id: string;
  style?: CSSProperties;
}

export default function ChatGPTExplain({ actions, id, style }: Props) {
  const { project_id, path } = useFrameContext();
  const [gettingExplanation, setGettingExplanation] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [model, setModel] = useState<Model>("gpt-3.5-turbo");

  if (
    actions == null ||
    !actions.redux.getStore("projects").hasOpenAI(project_id, "explain")
  ) {
    return null;
  }
  return (
    <div style={style}>
      <PopconfirmKeyboard
        icon={<OpenAIAvatar size={20} />}
        title={
          <b>
            Get explanation of this code from{" "}
            <ModelSwitch size="small" model={model} setModel={setModel} />
          </b>
        }
        description={() => {
          const message = createMessage({
            id,
            actions,
            model,
            open: true,
          });
          return (
            <div
              style={{
                width: "450px",
                overflow: "auto",
                maxWidth: "90vw",
                maxHeight: "300px",
              }}
            >
              The following will be sent to {modelToName(model)}:
              <StaticMarkdown
                value={message}
                style={{
                  border: "1px solid lightgrey",
                  borderRadius: "5px",
                  margin: "5px 0",
                  padding: "5px",
                }}
              />
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
          style={{ color: "#666", fontSize: "11px" }}
          size="small"
          type="text"
          disabled={gettingExplanation}
        >
          <OpenAIAvatar
            size={12}
            style={{ marginRight: "5px" }}
            innerStyle={{ top: "2.5px" }}
          />
          Explain...
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
  model: Model;
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

function createMessage({ id, actions, model, open }): string {
  const cell = actions.store.get("cells").get(id);
  if (!cell) {
    return "";
  }
  const kernel_info = actions.store.get("kernel_info");
  const language = kernel_info.get("language");
  const message = `${modelToMention(
    model
  )} Explain the following ${kernel_info.get(
    "display_name"
  )} code that is in a Jupyter notebook:\n\n<details${
    open ? " open" : ""
  }>\n\n
\`\`\`${language}
${cell.get("input")}
\`\`\`
\n\n</details>`;
  return message;
}
