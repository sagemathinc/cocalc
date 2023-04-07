/*
Use ChatGPT to explain an error message and help the user fix it.
*/

import { CSSProperties, useState } from "react";
import { Alert, Button, Tooltip } from "antd";
import OpenAIAvatar from "@cocalc/frontend/components/openai-avatar";
import type { JupyterActions } from "../browser-actions";
import getChatActions from "@cocalc/frontend/chat/get-actions";
import Anser from "anser";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";

interface Props {
  actions?;
  id: string;
  style?: CSSProperties;
}

export default function ChatGPTError({ actions, id, style }: Props) {
  const { project_id, path } = useFrameContext();
  const [gettingHelp, setGettingHelp] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  if (
    actions == null ||
    !actions.redux.getStore("projects").hasOpenAI(project_id)
  ) {
    return null;
  }
  return (
    <div>
      <Tooltip title="Ask ChatGPT to help fix this error.">
        <Button
          style={style}
          disabled={gettingHelp}
          onClick={async () => {
            setGettingHelp(true);
            try {
              await getHelp({ id, actions, project_id, path });
            } catch (err) {
              setError(`${err}`);
            } finally {
              setGettingHelp(false);
            }
          }}
        >
          <OpenAIAvatar
            size={16}
            style={{ marginRight: "5px" }}
            innerStyle={{ top: "2.5px" }}
          />
          Help me fix this...
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

async function getHelp({
  id,
  actions,
  project_id,
  path,
}: {
  id: string;
  actions: JupyterActions;
  project_id: string;
  path: string; // can't use from actions, since e.g., for whiteboard that's for jupyter not the actual path.
}) {
  const cell = actions.store.get("cells").get(id);
  if (!cell) {
    console.warn("getHelp -- no cell with id", id);
    return;
  }
  let traceback = "";
  for (const [_n, mesg] of cell.get("output") ?? []) {
    if (mesg.has("traceback")) {
      traceback += mesg.get("traceback").join("\n") + "\n";
    }
  }
  traceback = traceback.trim();
  if (!traceback) {
    console.warn("getHelp -- no traceback");
    return;
  }
  traceback = Anser.ansiToText(traceback);
  const kernel_info = actions.store.get("kernel_info");
  const chatActions = await getChatActions(actions.redux, project_id, path);
  const language = kernel_info.get("language");
  const message = `<span class="user-mention" account-id=chatgpt>@ChatGPT</span>, help me fix my code.\n\n<details>\n\nI ran the following ${kernel_info.get(
    "display_name"
  )} code:\n\n
\`\`\`${language}
${cell.get("input")}
\`\`\`
and it produced the following error message:
\`\`\`${language}
${traceback}
\`\`\`
\n\n</details>
`;
  // scroll to bottom *after* the message gets sent.
  setTimeout(() => chatActions.scrollToBottom(), 100);
  await chatActions.send_chat(
    message,
    undefined,
    undefined,
    "jupyter-help-me-fix"
  );
}
