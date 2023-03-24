/*
Use ChatGPT to explain an error message and help the user fix it.
*/

import { CSSProperties, useState } from "react";
import { Alert, Button } from "antd";
import OpenAIAvatar from "@cocalc/frontend/components/openai-avatar";
import type { JupyterActions } from "../browser-actions";
import type { ChatActions } from "@cocalc/frontend/chat/actions";
import { meta_file } from "@cocalc/util/misc";
import Anser from "anser";
import { delay } from "awaiting";

interface Props {
  actions?;
  id: string;
  style?: CSSProperties;
}

export default function ChatGPTError({ actions, id, style }: Props) {
  const [gettingHelp, setGettingHelp] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  if (
    actions == null ||
    !actions.redux?.getStore("customize").get("openai_enabled")
  ) {
    return null;
  }
  return (
    <div>
      <Button
        style={style}
        disabled={gettingHelp}
        onClick={async () => {
          setGettingHelp(true);
          try {
            await getHelp({ id, actions });
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
}: {
  id: string;
  actions: JupyterActions;
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
  const chatActions = await getChatActions(
    actions.redux,
    actions.project_id,
    actions.path
  );
  const language = kernel_info.get("language");
  const message = `<span class="user-mention" account-id=chatgpt>@ChatGPT</span> I ran the following ${kernel_info.get(
    "display_name"
  )} code:
\`\`\`${language}
${cell.get("input")}
\`\`\`
and it produced the following error message:
\`\`\`${language}
${traceback}
\`\`\`
Help me fix my code.
`;
  // scroll to bottom *after* the message gets sent.
  setTimeout(() => chatActions.scrollToBottom(), 100);
  await chatActions.send_chat(message);
}

async function getChatActions(
  redux,
  project_id: string,
  path: string,
  maxWaitSeconds: number = 10,
  width: number = 0.6
): Promise<ChatActions> {
  throw Error("test");
  const projectActions = redux.getProjectActions(project_id);
  projectActions.open_chat({ path: path, width });
  const start = Date.now();

  while (Date.now() - start <= 1000 * maxWaitSeconds) {
    const chatActions = redux.getEditorActions(
      project_id,
      meta_file(path, "chat")
    ) as ChatActions;
    if (chatActions?.syncdb?.get_state() == "ready") {
      return chatActions;
    }
    await delay(200);
  }
  throw Error("unable to open chatroom");
}
