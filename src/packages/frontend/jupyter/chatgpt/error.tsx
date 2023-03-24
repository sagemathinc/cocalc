/*
Use ChatGPT to explain an error message and help the user fix it.
*/

import { CSSProperties, useState } from "react";
import { Button } from "antd";
//import { Icon } from "@cocalc/frontend/components/icon";
//      <Icon name="robot" style={{ color: "rgb(16, 163, 127)" }} />

import OpenAIAvatar from "@cocalc/frontend/components/openai-avatar";
import type { JupyterActions } from "../browser-actions";

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
      @ChatGPT, help me fix this error...
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
  console.log("getting help...", id, actions);
}
