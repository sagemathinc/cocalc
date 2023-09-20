/*
Use ChatGPT to explain an error message and help the user fix it.
*/

import { CSSProperties } from "react";
import HelpMeFix from "@cocalc/frontend/frame-editors/chatgpt/help-me-fix";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";

interface Props {
  style?: CSSProperties;
  input: string;
  traceback: string;
}

export default function ChatGPTError({ style, traceback, input }: Props) {
  const { actions: frameActions } = useFrameContext();
  if (frameActions == null) return null;
  return (
    <HelpMeFix
      style={style}
      task="ran a cell in a Jupyter notebook"
      error={traceback}
      input={input}
      tag="jupyter-notebook-cell-eval"
      extraFileInfo={frameActions.chatgptExtraFileInfo()}
      language={frameActions.chatgptGetLanguage()}
    />
  );
}
