/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Divider between cells, which allows inserting a new cell.

NOTE: the hover logic is in CSS (_jupyter.sass).
Event based onMouseOver/Out leaves too often
buttons in the hover state (even when tacking mouse moves!),
which is confusing.
*/

// cSpell:ignore aicell

import { Button, Space, Tooltip } from "antd";
import { ReactNode, useState } from "react";

import { redux } from "@cocalc/frontend/app-framework";
import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import { Icon } from "@cocalc/frontend/components/icon";
import useNotebookFrameActions from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/hook";
import { openAssistantWithPrefill } from "@cocalc/frontend/frame-editors/llm/assistant-seed";
import { LLMTools } from "@cocalc/jupyter/types";
import { unreachable } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { JupyterActions } from "../browser-actions";
import { AIGenerateCodeCell } from "./ai-cell-generator";
import { Position } from "./types";
import { insertCell, pasteCell } from "./util";

type TinyButtonType = "code" | "markdown" | "paste" | "aicell";

const BTN_HEIGHT = 22;

export interface InsertCellProps {
  actions: JupyterActions;
  project_id?: string;
  id: string;
  llmTools?: LLMTools;
  hide?: boolean;
  position: "above" | "below";
  showAICellGen: Position;
  setShowAICellGen: (show: Position) => void;
  alwaysShow?: boolean;
}

export interface InsertCellState {
  hover: boolean;
}

export function InsertCell({
  project_id,
  position,
  llmTools,
  actions,
  id,
  hide,
  showAICellGen,
  setShowAICellGen,
  alwaysShow,
}: InsertCellProps) {
  const frameActions = useNotebookFrameActions();
  const [showControls, setShowControls] = useState<boolean>(!!alwaysShow);

  const showGenerateCell = redux
    .getStore("projects")
    .hasLanguageModelEnabled(project_id, "generate-cell");

  const oldAssistantMode = !!redux
    .getStore("account")
    .getIn(["other_settings", "old_assistant_mode"]);

  function handleBarClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const type =
      e.shiftKey || e.ctrlKey || e.altKey || e.metaKey ? "markdown" : "code";
    insertCell({ frameActions, actions, type, id, position });
  }

  function openAgentWithGeneratePrompt() {
    if (!project_id) return;
    const path = actions.path;
    // Focus the cell at this insertion point so the agent picks it up
    // as the context cell.
    const fa = frameActions.current;
    if (fa) {
      fa.set_cur_id(id);
    }
    const posLabel = position === "above" ? "above" : "below";
    // Compute 1-based cell number for context.
    const cellList = actions.store.get("cell_list");
    const cellIds = cellList?.toJS() as string[] | undefined;
    const cellIndex = cellIds ? cellIds.indexOf(id) : -1;
    const cellRef =
      cellIndex >= 0 ? `cell #${cellIndex + 1}` : "the current cell";
    openAssistantWithPrefill({
      redux,
      project_id,
      path,
      prompt: `Insert a new cell ${posLabel} ${cellRef}, that does: `,
    }).catch((err) => console.warn("openAssistantWithPrefill failed:", err));
  }

  function handleButtonClick(e, type: TinyButtonType) {
    e.preventDefault();
    e.stopPropagation();
    switch (type) {
      case "code":
      case "markdown":
        insertCell({ frameActions, actions, type, id, position });
        break;
      case "paste":
        pasteCell({ frameActions, actions, id, position });
        break;
      case "aicell":
        if (!oldAssistantMode) {
          openAgentWithGeneratePrompt();
        } else {
          setShowAICellGen(position);
        }
        break;
      default:
        unreachable(type);
    }
  }

  const classNames = ["cocalc-jupyter-insert-cell"];
  if (alwaysShow) {
    classNames.push("cocalc-jupyter-insert-cell-below");
  }

  const isActiveAIGenerator =
    oldAssistantMode &&
    !hide &&
    (showAICellGen === position ||
      (position === "below" && showAICellGen === "replace"));
  const controlsVisible = showControls || !!showAICellGen || !!alwaysShow;

  function renderControls() {
    return (
      <div
        className="cocalc-jupyter-insert-cell-controls"
        style={
          controlsVisible
            ? {
                visibility: "visible",
                opacity: 1,
              }
            : undefined
        }
      >
        <Space size="large">
          <TinyButton
            type="code"
            title="Insert code cell (click line)"
            handleButtonClick={handleButtonClick}
          >
            <Icon name="code" /> Code
          </TinyButton>
          <TinyButton
            type="markdown"
            title="Insert text cell (shift+click line)"
            handleButtonClick={handleButtonClick}
          >
            <Icon name="pen" /> Text
          </TinyButton>
          <TinyButton
            type="paste"
            title="Insert clipboard content as cell"
            handleButtonClick={handleButtonClick}
          >
            <Icon name="paste" /> Paste
          </TinyButton>
          {showGenerateCell && llmTools && (
            <TinyButton
              type="aicell"
              title="Create code based on your description (alt+click line)"
              handleButtonClick={handleButtonClick}
            >
              <Space>
                <AIAvatar
                  backgroundColor={"transparent"}
                  size={14}
                  innerStyle={{ color: "default", top: "-2px" }}
                />
                Generate...
              </Space>
            </TinyButton>
          )}
        </Space>
      </div>
    );
  }

  // the AIGenerateCodeCell is only rendered if active – otherwise that dialog is rendered for each cell insertion line
  return (
    <div
      className={classNames.join(" ")}
      style={{
        ...(alwaysShow ? ({ marginBottom: `${BTN_HEIGHT}px` } as const) : {}),
        ...(showAICellGen ? { backgroundColor: COLORS.FG_BLUE } : {}),
      }}
      onClick={showAICellGen ? undefined : handleBarClick}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => {
        if (!showAICellGen && !alwaysShow) {
          setShowControls(false);
        }
      }}
      onFocus={() => setShowControls(true)}
      onBlur={(e) => {
        if (
          !showAICellGen &&
          !alwaysShow &&
          !e.currentTarget.contains(e.relatedTarget as Node | null)
        ) {
          setShowControls(false);
        }
      }}
    >
      {isActiveAIGenerator ? (
        <AIGenerateCodeCell
          setShowAICellGen={setShowAICellGen}
          showAICellGen={showAICellGen}
          actions={actions}
          frameActions={frameActions}
          id={id}
          llmTools={llmTools}
        >
          {renderControls()}
        </AIGenerateCodeCell>
      ) : controlsVisible ? (
        renderControls()
      ) : null}
    </div>
  );
}

function TinyButton({
  type,
  children,
  title,
  handleButtonClick,
}: {
  type: TinyButtonType;
  children?: ReactNode;
  title: string;
  handleButtonClick: (e, type: TinyButtonType) => void;
}) {
  return (
    <Tooltip title={title} mouseEnterDelay={1.1}>
      <Button size={"small"} onClick={(e) => handleButtonClick(e, type)}>
        {children}
      </Button>
    </Tooltip>
  );
}
