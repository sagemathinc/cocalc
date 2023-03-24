/*
Use ChatGPT to explain an error message and help the user fix it.
*/

import { Button } from "antd";
import OpenAIAvatar from "@cocalc/frontend/components/openai-avatar";

interface Props {
  actions;
  id: string;
}

export default function ChatGPTError({}: Props) {
  return (
    <Button>
      <OpenAIAvatar /> Help
    </Button>
  );
}
