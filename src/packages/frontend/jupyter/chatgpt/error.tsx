/*
Use ChatGPT to explain an error message and help the user fix it.
*/

import { CSSProperties } from "react";
import { Button } from "antd";
import OpenAIAvatar from "@cocalc/frontend/components/openai-avatar";

interface Props {
  actions?;
  id: string;
  style?: CSSProperties;
}

export default function ChatGPTError({ actions, id, style }: Props) {
  if (!actions?.redux.getStore("customize").get("openai_enabled")) return null;
  return (
    <Button style={style}>
      <OpenAIAvatar
        size={16}
        style={{ marginRight: "5px" }}
        innerStyle={{ top: "2.5px" }}
      />{" "}
      Help me fix this error...
    </Button>
  );
}
