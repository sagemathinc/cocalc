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

import { CSS, React } from "@cocalc/frontend/app-framework";
import useNotebookFrameActions from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/hook";
import { COLORS } from "@cocalc/util/theme";
import { IS_TOUCH } from "../feature";
import { JupyterActions } from "./browser-actions";
import { unreachable } from "@cocalc/util/misc";

type TinyButtonType = "code" | "markdown" | "paste" | "chatgpt";

const BTN_HEIGHT = 12;

const TINY_BTN_STYLE: CSS = {
  margin: "0px",
  padding: "0px 10px",
  fontSize: `${BTN_HEIGHT - 2}px`,
  lineHeight: `${BTN_HEIGHT}px`,
  height: `${BTN_HEIGHT}px`,
  borderRadius: "2px",
  border: "none",
  backgroundColor: COLORS.FG_BLUE,
  color: "white",
} as const;

export interface InsertCellProps {
  actions: JupyterActions;
  id: string;
  position?: "above" | "below";
}

export interface InsertCellState {
  hover: boolean;
}

function should_memoize(prev, next) {
  return next.id == prev.id && next.position == prev.position;
}

export const InsertCell: React.FC<InsertCellProps> = React.memo(
  (props: InsertCellProps) => {
    const { position } = props;
    const frameActions = useNotebookFrameActions();

    if (IS_TOUCH) {
      // TODO: Inserting cells via hover and click does not make sense
      // for a touch device, since no notion of hover, and is just confusing and results
      // in many false inserts.
      return <div style={{ height: "6px" }}></div>;
    }

    function insertCell(type: "code" | "markdown", content?: string): void {
      const { actions, id } = props;
      if (frameActions.current == null) return;
      frameActions.current.set_cur_id(id);
      const new_id = frameActions.current.insert_cell(
        position === "below" ? 1 : -1
      );

      switch (type) {
        case "markdown":
          actions.set_cell_type(new_id, "markdown");
          frameActions.current.switch_md_cell_to_edit(new_id);
          break;
        case "code":
          frameActions.current.switch_code_cell_to_edit(new_id);
          if (content) {
            frameActions.current?.set_cell_input(new_id, content);
          }
          break;
      }
    }

    async function pasteCell(): Promise<void> {
      try {
        const text = await navigator.clipboard.readText();
        insertCell("code", text);
      } catch (err) {
        console.log("Failed to read clipboard contents: ", err);
      }
    }

    function barClick(e) {
      e.preventDefault();
      e.stopPropagation();
      const type =
        e.shiftKey || e.ctrlKey || e.altKey || e.metaKey ? "markdown" : "code";
      insertCell(type);
    }

    function btnClick(e, type: TinyButtonType) {
      e.preventDefault();
      e.stopPropagation();
      switch (type) {
        case "code":
        case "markdown":
          insertCell(type);
          break;
        case "paste":
          pasteCell();
          break;
        case "chatgpt":
          window.alert("gpt");
          break;
        default:
          unreachable(type);
      }
    }

    function TinyButton(props: {
      type: TinyButtonType;
      children?: React.ReactNode;
    }) {
      const { type, children } = props;
      return (
        <Button
          style={TINY_BTN_STYLE}
          size={"small"}
          onClick={(e) => btnClick(e, type)}
        >
          {children}
        </Button>
      );
    }

    function renderControls() {
      return (
        <div className="cocalc-jupyter-insert-cell-controls">
          <Space size="large">
            <TinyButton type="code">Code</TinyButton>
            <TinyButton type="markdown">Text</TinyButton>
            <TinyButton type="paste">Paste</TinyButton>
            <TinyButton type="chatgpt">ChatGPT</TinyButton>
          </Space>
        </div>
      );
    }

    const style: CSS =
      position === "below" ? { marginBottom: `${BTN_HEIGHT}px` } : {};

    return (
      <div
        className="cocalc-jupyter-insert-cell"
        style={style}
        onClick={barClick}
      >
        <Tooltip
          title="Insert a new (text) cell – you can also [shift]-click on the blue bar to insert a [text] cell"
          placement="bottom"
          mouseEnterDelay={2} // otherwise, it pops up all the time and gets really annoying
        >
          {renderControls()}
        </Tooltip>
      </div>
    );
  },
  should_memoize
);
