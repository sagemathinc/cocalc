/*
Use ChatGPT to explain an error message and help the user fix it.
*/

import { CSSProperties } from "react";

import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import HelpMeFix from "@cocalc/frontend/frame-editors/llm/help-me-fix";

interface Props {
  style?: CSSProperties;
  input: string;
  traceback: string;
}

export default function LLMError({ style, traceback, input }: Props) {
  const { actions: frameActions } = useFrameContext();
  if (frameActions == null) return null;
  return (
    <HelpMeFix
      style={style}
      task="ran a cell in a Jupyter notebook"
      error={traceback}
      input={input}
      tag="jupyter-notebook-cell-eval"
      extraFileInfo={frameActions.languageModelExtraFileInfo()}
      language={frameActions.languageModelGetLanguage()}
    />
  );
}
