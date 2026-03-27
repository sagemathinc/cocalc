/*
 *  This file is part of CoCalc: Copyright © 2020 - 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
A generic button for helping a user fix problems using an LLM.
If LLM support is disabled or not available it renders as null.
Clicking a button opens a modal dialog (via showHelpMeFixDialog).
*/

import type { BaseButtonProps } from "antd/lib/button/button";
import { CSSProperties } from "react";
import { Space } from "antd";

import { useLanguageModelSetting } from "@cocalc/frontend/account/useLanguageModelSetting";
import { AIAvatar } from "@cocalc/frontend/components";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { hasEmbeddedAgent } from "@cocalc/frontend/frame-editors/generic/has-embedded-agent";
import type { NotebookFrameActions } from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/actions";
import type { ProjectsStore } from "@cocalc/frontend/projects/store";

import HelpMeFixButton from "./help-me-fix-button";
import { openAssistantWithSeed } from "./assistant-seed";
import { showHelpMeFixDialog } from "./help-me-fix-dialog";
import { createMessage } from "./help-me-fix-utils";

// Re-export getHelp for backward compatibility
export { getHelp } from "./help-me-fix-utils";

interface Props {
  error: string | (() => string); // the error it produced. This is viewed as code.
  line?: string | (() => string); // the line content where the error was produced, if available
  lineNumber?: number; // line number (1-based) where the error was produced, if available
  input?: string | (() => string); // the input, e.g., code you ran
  task?: string; // what you're doing, e.g., "ran a cell in a Jupyter notebook" or "ran a code formatter"
  tag?: string;
  language?: string;
  extraFileInfo?: string;
  extraContext?: string | (() => string);
  style?: CSSProperties;
  outerStyle?: CSSProperties;
  size?: BaseButtonProps["size"];
  prioritize?: "start" | "start-end" | "end"; // start: truncate right, start-end: truncate middle, end: truncate left.
  onReplace?: (opts: { code: string; run?: boolean }) => void;
  cellId?: string;
  notebookFrameActions?: NotebookFrameActions;
}

function get(f: undefined | string | (() => string)): string {
  if (f == null) return "";
  if (typeof f === "string") return f;
  return f();
}

export default function HelpMeFix({
  error,
  line,
  lineNumber,
  task,
  input,
  tag,
  language,
  extraFileInfo,
  extraContext,
  style,
  outerStyle,
  size,
  prioritize,
  onReplace,
  cellId,
  notebookFrameActions,
}: Props) {
  const { redux, project_id, path } = useFrameContext();
  const [model] = useLanguageModelSetting(project_id);
  const projectsStore: ProjectsStore = redux.getStore("projects");
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

  function handleClick(mode: "hint" | "solution") {
    const resolvedError = get(error);
    const resolvedLine = get(line);
    const resolvedInput = get(input);
    const resolvedExtraContext = get(extraContext);

    if (hasEmbeddedAgent(path)) {
      const prompt = createMessage({
        error: resolvedError,
        line: resolvedLine,
        input: resolvedInput,
        task,
        language,
        extraFileInfo,
        extraContext: resolvedExtraContext,
        model,
        prioritize,
        open: false,
        full: false,
        isHint: mode === "hint",
      });
      void openAssistantWithSeed({
        redux,
        project_id,
        path,
        prompt,
        mode: mode === "hint" ? "hint" : undefined,
      }).catch(() =>
        showHelpMeFixDialog({
          mode,
          project_id,
          path,
          error: resolvedError,
          line: resolvedLine,
          lineNumber,
          input: resolvedInput,
          task,
          tag,
          language,
          extraFileInfo,
          extraContext: resolvedExtraContext,
          prioritize,
          onReplace,
          cellId,
          notebookFrameActions,
        }),
      );
      return;
    }

    showHelpMeFixDialog({
      mode,
      project_id,
      path,
      error: resolvedError,
      line: resolvedLine,
      lineNumber,
      input: resolvedInput,
      task,
      tag,
      language,
      extraFileInfo,
      extraContext: resolvedExtraContext,
      prioritize,
      onReplace,
      cellId,
      notebookFrameActions,
    });
  }

  return (
    <div style={outerStyle}>
      <Space>
        <AIAvatar size={16} />
        {canGetHint && (
          <HelpMeFixButton
            mode="hint"
            size={size}
            style={style}
            onClick={() => handleClick("hint")}
          />
        )}
        {canGetSolution && (
          <HelpMeFixButton
            mode="solution"
            size={size}
            style={style}
            onClick={() => handleClick("solution")}
          />
        )}
      </Space>
    </div>
  );
}
