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

import { Button, Input, Popover, Space, Tooltip } from "antd";

import { alert_message } from "@cocalc/frontend/alerts";
import {
  CSS,
  React,
  useFrameContext,
  useState,
} from "@cocalc/frontend/app-framework";
import { Icon, Paragraph } from "@cocalc/frontend/components";
import OpenAIAvatar from "@cocalc/frontend/components/openai-avatar";
import ProgressEstimate from "@cocalc/frontend/components/progress-estimate";
import { IS_TOUCH } from "@cocalc/frontend/feature";
import useNotebookFrameActions from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/hook";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { unreachable } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { JupyterActions } from "./browser-actions";

type TinyButtonType = "code" | "markdown" | "paste" | "chatgpt";

const BTN_HEIGHT = 16;

const TINY_BTN_STYLE: CSS = {
  margin: "0px",
  padding: "0px 10px",
  fontSize: `${BTN_HEIGHT - 2}px`,
  lineHeight: `${BTN_HEIGHT}px`,
  height: `${BTN_HEIGHT}px`,
  borderRadius: "4px",
  border: "none",
  color: "white",
} as const;

export interface InsertCellProps {
  actions: JupyterActions;
  id: string;
  position?: "above" | "below";
  chatgpt?;
}

export interface InsertCellState {
  hover: boolean;
}

function should_memoize(prev, next) {
  return next.id == prev.id && next.position == prev.position;
}

export const InsertCell: React.FC<InsertCellProps> = React.memo(
  (props: InsertCellProps) => {
    const { position, chatgpt, actions, id } = props;
    const haveChatGTP = chatgpt != null;
    const { project_id, path } = useFrameContext();
    const frameActions = useNotebookFrameActions();
    const [showChatGPT, setShowChatGPT] = useState<boolean>(false);
    const [querying, setQuerying] = useState<boolean>(false);
    const inputRef = React.useRef<any>(null);

    if (IS_TOUCH) {
      // TODO: Inserting cells via hover and click does not make sense
      // for a touch device, since no notion of hover, and is just confusing and results
      // in many false inserts.
      return <div style={{ height: "6px" }}></div>;
    }

    function insertCell(type: "code" | "markdown", content?: string): void {
      if (frameActions.current == null) return;
      frameActions.current.set_cur_id(id);
      const new_id = frameActions.current.insert_cell(
        position === "below" ? 1 : -1
      );

      if (content) {
        frameActions.current?.set_cell_input(new_id, content);
      }

      switch (type) {
        case "markdown":
          actions.set_cell_type(new_id, "markdown");
          if (!content) {
            frameActions.current.switch_md_cell_to_edit(new_id);
          }
          break;
        case "code":
          frameActions.current.switch_code_cell_to_edit(new_id);
          break;
      }
    }

    async function pasteCell(): Promise<void> {
      try {
        // First time around (in Chrome at least), this will require a confirmation by the user
        // It fails with a "permission denied"
        const text = await navigator.clipboard.readText();
        insertCell("code", text);
      } catch (err) {
        alert_message({
          type: "error",
          title: "Permission denied",
          message: `You have to enable clipboard access to make pasting from the clipboard work.\n${err}`,
        });
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
          setShowChatGPT(true);
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
          className="cocalc-jupyter-insert-cell-btn"
          size={"small"}
          onClick={(e) => btnClick(e, type)}
        >
          {children}
        </Button>
      );
    }

    function renderControls() {
      return (
        <div
          className="cocalc-jupyter-insert-cell-controls"
          style={showChatGPT ? { display: "block" } : {}}
        >
          <Space size="large">
            <TinyButton type="code">
              <Icon name="code" /> Code
            </TinyButton>
            <TinyButton type="markdown">
              <Icon name="pen" /> Text
            </TinyButton>
            <TinyButton type="paste">
              <Icon name="paste" /> Paste
            </TinyButton>
            {haveChatGTP ? (
              <TinyButton type="chatgpt">
                <OpenAIAvatar
                  backgroundColor={"transparent"}
                  size={12}
                  style={{ marginRight: "5px" }}
                  innerStyle={{ top: "0px" }}
                />{" "}
                ChatGPT
              </TinyButton>
            ) : undefined}
          </Space>
        </div>
      );
    }

    /**
     * extract the code between the first and second occurance of lines starting with backticks
     */
    function extractCode(raw: string): {
      content: string;
      type: "code" | "markdown";
    } {
      const ret: string[] = [];
      let inside = false;
      for (const line of raw.split("\n")) {
        if (line.startsWith("```")) {
          inside = true;
          continue;
        }
        if (inside) {
          // ignore the remaining lines
          if (line.startsWith("```")) break;
          ret.push(line);
        }
      }

      // if there is nothing in "ret", it probably returned a comment explaining it does not know what to do
      if (ret.length > 0) {
        return { content: ret.join("\n"), type: "code" };
      } else {
        return { content: raw, type: "markdown" };
      }
    }

    async function queryChatGPT(e) {
      e.preventDefault();
      e.stopPropagation();

      const prompt = inputRef.current?.input?.value;
      if (frameActions.current == null || prompt == null) return;
      const kernel_info = actions.store.get("kernel_info");
      const lang = kernel_info?.get("language") ?? "python";
      const kernel_name = kernel_info?.get("display_name") ?? "Python 3";
      const fa = frameActions.current;
      // default delta=-1 is fine, because the insert bar is usually *above* the current cell
      const prevCellID = fa.getPreviousCodeCellID(
        id,
        position === "below" ? 0 : -1
      );
      const prevCode =
        prevCellID != null
          ? `The previous code cell is\n\n\`\`\`\n${fa.get_cell_input(
              prevCellID
            )}\n\`\`\``
          : "";

      const input = `Create a new code cell for a Jupyter Notebook. Kernel: "${kernel_name}". Programming language: "${lang}". Return the entire code in a single block, enclosed in triple backticks, and comments as code comments. ${prevCode}\n\nThe new cell should do this:\n\n${prompt}`;

      //console.log("input:\n", input);

      try {
        setQuerying(true);
        const raw = await webapp_client.openai_client.chatgpt({
          input,
          project_id,
          path,
          system: `Return only the code in the language "${lang}" enclosed in triple backticks.`,
          tag: "generate-jupyter-cell",
        });
        //console.log("raw\n", raw);
        const { content, type } = extractCode(raw);
        insertCell(type, content);
      } catch (err) {
        alert_message({
          type: "error",
          title: "Problem generating code cell",
          message: `${err}`,
        });
      } finally {
        setQuerying(false);
      }
    }

    function chatGPTDialogContent(): JSX.Element {
      if (querying) {
        return <ProgressEstimate seconds={30} />;
      } else {
        return (
          <>
            <Paragraph>
              Describe what the next cell should do. The nearest code cell from
              above will be sent along the query to provide context.
            </Paragraph>
            <Paragraph>
              <Input
                ref={inputRef}
                autoFocus
                disabled={querying}
                placeholder="Describe the code..."
                onChange={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onPressEnter={queryChatGPT}
              />
            </Paragraph>
            <Paragraph style={{ textAlign: "center" }}>
              <Space size="large">
                <Button
                  type="primary"
                  onClick={queryChatGPT}
                  disabled={querying}
                >
                  Generate
                </Button>
                <Button onClick={() => setShowChatGPT(false)}>Close</Button>
              </Space>
            </Paragraph>
          </>
        );
      }
    }

    function tooltipTitle() {
      // don't show this tooltip if we're showing the chatgpt dialog
      if (showChatGPT) return;
      return `Insert a new (text) cell – you can also [shift]-click on the blue bar to insert a [text] cell. Paste inserts the clipboard content into a new code cell.${
        haveChatGTP
          ? " ChatGPT generates a code cell based on your description."
          : ""
      }`;
    }

    const style: CSS =
      position === "below" ? { marginBottom: `${BTN_HEIGHT}px` } : {};

    return (
      <div
        className="cocalc-jupyter-insert-cell"
        style={{
          ...style,
          ...(showChatGPT ? { backgroundColor: COLORS.FG_BLUE } : {}),
        }}
        onClick={barClick}
      >
        <Popover
          placement="bottom"
          title={
            <div
              style={{ fontSize: "18px" }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <OpenAIAvatar size={24} /> ChatGPT: Generate code cell
              <Button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowChatGPT(false);
                }}
                type="text"
                style={{ float: "right", color: COLORS.GRAY_M }}
              >
                <Icon name="times" />
              </Button>
            </div>
          }
          open={showChatGPT}
          content={
            <div
              style={{ width: "400px" }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              {chatGPTDialogContent()}
            </div>
          }
          trigger={[]}
        >
          <Tooltip
            title={tooltipTitle()}
            placement="bottom"
            mouseEnterDelay={2} // otherwise, it pops up all the time and gets really annoying
          >
            {renderControls()}
          </Tooltip>
        </Popover>
      </div>
    );
  },
  should_memoize
);
