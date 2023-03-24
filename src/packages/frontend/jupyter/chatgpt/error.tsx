/*
Use ChatGPT to explain an error message and help the user fix it.
*/

import { CSSProperties, useState } from "react";
import { Button } from "antd";
//import { Icon } from "@cocalc/frontend/components/icon";
//      <Icon name="robot" style={{ color: "rgb(16, 163, 127)" }} />

import OpenAIAvatar from "@cocalc/frontend/components/openai-avatar";
import type { JupyterActions } from "../browser-actions";
import type { ChatActions } from "@cocalc/frontend/chat/actions";
import { meta_file } from "@cocalc/util/misc";
import Anser from "anser";

interface Props {
  actions?;
  id: string;
  style?: CSSProperties;
}

export default function ChatGPTError({ actions, id, style }: Props) {
  const [gettingHelp, setGettingHelp] = useState<boolean>(false);
  if (
    actions == null ||
    !actions.redux?.getStore("customize").get("openai_enabled")
  ) {
    return null;
  }
  return (
    <Button
      style={style}
      disabled={gettingHelp}
      onClick={async () => {
        setGettingHelp(true);
        try {
          await getHelp({ id, actions });
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
      Help fix this...
    </Button>
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
  const projectActions = actions.redux.getProjectActions(actions.project_id);
  projectActions.open_chat({ path: actions.path, width: 0.6 });
  const language = kernel_info.get("language");
  const chatActions = actions.redux.getEditorActions(
    actions.project_id,
    meta_file(actions.path, "chat")
  ) as ChatActions;
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
  await chatActions.send_chat(message);
}
