/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Divider between cells, which allows inserting a new cell.

NOTE: the hover logic is in CSS (_jupyter.sass).
Event based onMouseOver/Out leaves too often
buttons in the hover state (even when tacking mouse moves!),
which is confusing.
*/

import { Button, Space, Tooltip } from "antd";
import { useState, ReactNode } from "react";

import { redux, useFrameContext } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";
import OpenAIAvatar from "@cocalc/frontend/components/openai-avatar";
import { IS_TOUCH } from "@cocalc/frontend/feature";
import useNotebookFrameActions from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/hook";
import { unreachable } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { JupyterActions } from "../browser-actions";
import { insertCell, pasteCell } from "./util";
import ChatGPTPopover from "./chatgpt";

type TinyButtonType = "code" | "markdown" | "paste" | "chatgpt";

const BTN_HEIGHT = 22;

export interface InsertCellProps {
  actions: JupyterActions;
  id: string;
  position: "above" | "below";
  chatgpt?;
}

export interface InsertCellState {
  hover: boolean;
}

export function InsertCell({
  position,
  chatgpt,
  actions,
  id,
}: InsertCellProps) {
  const { project_id } = useFrameContext();
  const haveChatGTP =
    chatgpt &&
    redux.getStore("projects").hasOpenAI(project_id, "generate-cell");
  const frameActions = useNotebookFrameActions();
  const [showChatGPT, setShowChatGPT] = useState<boolean>(false);

  if (IS_TOUCH && position === "above") {
    // TODO: Inserting cells via hover and click does not make sense
    // for a touch device, since no notion of hover, and is just confusing and results
    // in many false inserts.
    // Exception: last bottom insert bar, because it is always visible; it appears
    // because for it position == 'below'.
    return <div style={{ height: "6px" }}></div>;
  }

  function handleBarClick(e) {
    e.preventDefault();
    e.stopPropagation();
    if (haveChatGTP && (e.altKey || e.metaKey)) {
      setShowChatGPT(true);
      return;
    }
    const type =
      e.shiftKey || e.ctrlKey || e.altKey || e.metaKey ? "markdown" : "code";
    insertCell({ frameActions, actions, type, id, position });
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
      case "chatgpt":
        setShowChatGPT(true);
        break;
      default:
        unreachable(type);
    }
  }

  const classNames = ["cocalc-jupyter-insert-cell"];
  if (position === "below") {
    classNames.push("cocalc-jupyter-insert-cell-below");
  }

  return (
    <div
      className={classNames.join(" ")}
      style={{
        ...(position === "below"
          ? ({ marginBottom: `${BTN_HEIGHT}px` } as const)
          : {}),
        ...(showChatGPT ? { backgroundColor: COLORS.FG_BLUE } : {}),
      }}
      onClick={handleBarClick}
    >
      <ChatGPTPopover
        setShowChatGPT={setShowChatGPT}
        showChatGPT={showChatGPT}
        actions={actions}
        frameActions={frameActions}
        id={id}
        position={position}
      >
        <div
          className="cocalc-jupyter-insert-cell-controls"
          style={
            showChatGPT || position === "below"
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
            {haveChatGTP && (
              <TinyButton
                type="chatgpt"
                title="Create code based on your description (alt+click line)"
                handleButtonClick={handleButtonClick}
              >
                <OpenAIAvatar
                  backgroundColor={"transparent"}
                  size={12}
                  style={{ marginRight: "5px" }}
                  innerStyle={{ color: "default", top: "-2.5px" }}
                />{" "}
                ChatGPT...
              </TinyButton>
            )}
          </Space>
        </div>
      </ChatGPTPopover>
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
  title;
  handleButtonClick;
}) {
  return (
    <Tooltip title={title} mouseEnterDelay={1.1}>
      <Button size={"small"} onClick={(e) => handleButtonClick(e, type)}>
        {children}
      </Button>
    </Tooltip>
  );
}
