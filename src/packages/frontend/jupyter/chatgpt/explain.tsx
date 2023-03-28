/*
Use ChatGPT to explain what the code in a cell does.
*/

import { CSSProperties, useState } from "react";
import { Alert, Button, Tooltip } from "antd";
import OpenAIAvatar from "@cocalc/frontend/components/openai-avatar";
import type { JupyterActions } from "../browser-actions";
import getChatActions from "@cocalc/frontend/chat/get-actions";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";

interface Props {
  actions?;
  id: string;
  style?: CSSProperties;
}

export default function ChatGPTExplain({ actions, id, style }: Props) {
  const { project_id, path } = useFrameContext();
  const [gettingExplanation, setGettingExplanation] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  if (
    actions == null ||
    !actions.redux.getStore("projects").hasOpenAI(project_id)
  ) {
    return null;
  }
  return (
    <div style={style}>
      <Tooltip title="Ask ChatGPT to explain what this code does.">
        <Button
          style={{ color: "#666", fontSize: "11px" }}
          size="small"
          type="text"
          disabled={gettingExplanation}
          onClick={async () => {
            setGettingExplanation(true);
            try {
              await getExplanation({ id, actions, project_id, path });
            } catch (err) {
              setError(`${err}`);
            } finally {
              setGettingExplanation(false);
            }
          }}
        >
          <OpenAIAvatar
            size={12}
            style={{ marginRight: "5px" }}
            innerStyle={{ top: "2.5px" }}
          />
          Explain
        </Button>
      </Tooltip>
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

//import { delay } from "awaiting";

async function getExplanation({
  id,
  actions,
  project_id,
  path,
}: {
  id: string;
  actions: JupyterActions;
  project_id: string;
  path: string;
}) {
  const cell = actions.store.get("cells").get(id);
  if (!cell) {
    console.warn("getHelp -- no cell with id", id);
    return;
  }
  const kernel_info = actions.store.get("kernel_info");
  const chatActions = await getChatActions(actions.redux, project_id, path);
  const language = kernel_info.get("language");
  const message = `<span class="user-mention" account-id=chatgpt>@ChatGPT</span> Explain the following ${kernel_info.get(
    "display_name"
  )} code in a Jupyter notebook:
\`\`\`${language}
${cell.get("input")}
\`\`\`
`;
  // scroll to bottom *after* the message gets sent.
  setTimeout(() => chatActions.scrollToBottom(), 100);
  await chatActions.send_chat(message);
}
