/*
A generic button for helping a user fix problems using chatgpt.
If chatgpt is disabled or not available it renders as null.
*/

import { Alert, Space } from "antd";
import type { BaseButtonProps } from "antd/lib/button/button";
import { CSSProperties, useState } from "react";
import useAsyncEffect from "use-async-effect";

import { useLanguageModelSetting } from "@cocalc/frontend/account/useLanguageModelSetting";
import getChatActions from "@cocalc/frontend/chat/get-actions";
import { AIAvatar } from "@cocalc/frontend/components";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import type { ProjectsStore } from "@cocalc/frontend/projects/store";
import HelpMeFixButton from "./help-me-fix-button";
import { createMessage } from "./help-me-fix-utils";

// Re-export getHelp for backward compatibility
export { getHelp } from "./help-me-fix-utils";

interface Props {
  error: string | (() => string); // the error it produced. This is viewed as code.
  input?: string | (() => string); // the input, e.g., code you ran
  task?: string; // what you're doing, e.g., "ran a cell in a Jupyter notebook" or "ran a code formatter"
  tag?: string;
  language?: string;
  extraFileInfo?: string;
  style?: CSSProperties;
  outerStyle?: CSSProperties;
  size?: BaseButtonProps["size"];
  prioritize?: "start" | "start-end" | "end"; // start: truncate right, start-end: truncate middle, end: truncate left.
}

function get(f: undefined | string | (() => string)): string {
  if (f == null) return "";
  if (typeof f == "string") return f;
  return f();
}

export default function HelpMeFix({
  error,
  task,
  input,
  tag,
  language,
  extraFileInfo,
  style,
  outerStyle,
  size,
  prioritize,
}: Props) {
  const { redux, project_id, path } = useFrameContext();
  const [gettingHelp, setGettingHelp] = useState<boolean>(false);
  const [errorGettingHelp, setErrorGettingHelp] = useState<string>("");
  const projectsStore: ProjectsStore = redux.getStore("projects");
  const [model, setModel] = useLanguageModelSetting(project_id);
  const [solutionTokens, setSolutionTokens] = useState<number>(0);
  const [hintTokens, setHintTokens] = useState<number>(0);

  // Check permissions for both hint and complete solution
  const canGetHint = projectsStore.hasLanguageModelEnabled(
    project_id,
    "help-me-fix-hint",
  );
  const canGetSolution = projectsStore.hasLanguageModelEnabled(
    project_id,
    "help-me-fix-solution",
  );

  if (redux == null || (!canGetHint && !canGetSolution)) {
    return null;
  }

  function createMessageMode(
    mode: "solution" | "hint",
    full: boolean = false,
  ): string {
    return createMessage({
      error: get(error),
      task,
      input: get(input),
      language,
      extraFileInfo,
      model,
      prioritize,
      open: true,
      full,
      isHint: mode === "hint",
    });
  }

  const solutionText = createMessageMode("solution");
  const hintText = createMessageMode("hint");

  useAsyncEffect(async () => {
    // compute the number of tokens (this MUST be a lazy import):
    const { getMaxTokens, numTokensUpperBound } = await import(
      "@cocalc/frontend/misc/llm"
    );

    setSolutionTokens(numTokensUpperBound(solutionText, getMaxTokens(model)));
    setHintTokens(numTokensUpperBound(hintText, getMaxTokens(model)));
  }, [model, solutionText, hintText]);

  async function onConfirm(mode: "solution" | "hint") {
    setGettingHelp(true);
    setErrorGettingHelp("");
    try {
      // scroll to bottom *after* the message gets sent.
      const actions = await getChatActions(redux, project_id, path);
      setTimeout(() => actions.scrollToBottom(), 100);
      const inputText = createMessageMode(mode, true);
      const tagSuffix = mode === "hint" ? "hint" : "solution";
      await actions.sendChat({
        input: inputText,
        tag: `help-me-fix-${tagSuffix}${tag ? `:${tag}` : ""}`,
        noNotification: true,
      });
    } catch (err) {
      setErrorGettingHelp(`${err}`);
    } finally {
      setGettingHelp(false);
    }
  }

  return (
    <div style={outerStyle}>
      <Space>
        <AIAvatar size={16} />
        {canGetHint && (
          <HelpMeFixButton
            mode="hint"
            model={model}
            setModel={setModel}
            project_id={project_id}
            inputText={hintText}
            tokens={hintTokens}
            size={size}
            style={style}
            gettingHelp={gettingHelp}
            onConfirm={() => onConfirm("hint")}
          />
        )}
        {canGetSolution && (
          <HelpMeFixButton
            mode="solution"
            model={model}
            setModel={setModel}
            project_id={project_id}
            inputText={solutionText}
            tokens={solutionTokens}
            size={size}
            style={style}
            gettingHelp={gettingHelp}
            onConfirm={() => onConfirm("solution")}
          />
        )}
      </Space>
      {errorGettingHelp && (
        <Alert
          style={{ maxWidth: "600px", margin: "15px 0" }}
          type="error"
          showIcon
          closable
          message={errorGettingHelp}
          onClick={() => setErrorGettingHelp("")}
        />
      )}
    </div>
  );
}
