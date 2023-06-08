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
  redux,
  useFrameContext,
  useState,
} from "@cocalc/frontend/app-framework";
import { Icon, Paragraph } from "@cocalc/frontend/components";
import OpenAIAvatar from "@cocalc/frontend/components/openai-avatar";
import { IS_TOUCH } from "@cocalc/frontend/feature";
import useNotebookFrameActions from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/hook";
import track from "@cocalc/frontend/user-tracking";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { unreachable } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { throttle } from "lodash";
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
    const { project_id, path } = useFrameContext();
    const haveChatGTP =
      chatgpt &&
      redux.getStore("projects").hasOpenAI(project_id, "generate-cell");
    const frameActions = useNotebookFrameActions();
    const [showChatGPT, setShowChatGPT] = useState<boolean>(false);
    const [querying, setQuerying] = useState<boolean>(false);
    const inputRef = React.useRef<any>(null);

    if (IS_TOUCH && position === "above") {
      // TODO: Inserting cells via hover and click does not make sense
      // for a touch device, since no notion of hover, and is just confusing and results
      // in many false inserts.
      // Exception: last "bottom" insert bar, because it is always visible
      return <div style={{ height: "6px" }}></div>;
    }

    function insertCell(
      type: "code" | "markdown",
      content?: string,
      where?: string,
      insertCellArg?: 1 | -1
    ): string | undefined {
      if (frameActions.current == null) return;
      frameActions.current.set_cur_id(where ?? id);
      const new_id = frameActions.current.insert_cell(
        insertCellArg ?? (position === "below" ? 1 : -1)
      );
      frameActions.current.set_cur_id(new_id);

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

      return new_id;
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
      const className =
        position === "below"
          ? "cocalc-jupyter-insert-cell-btn-below"
          : "cocalc-jupyter-insert-cell-btn";
      return (
        <Button
          style={TINY_BTN_STYLE}
          className={className}
          size={"small"}
          onClick={(e) => btnClick(e, type)}
        >
          {children}
        </Button>
      );
    }

    function renderControls() {
      const style: CSS =
        showChatGPT || position === "below"
          ? {
              visibility: "visible",
              opacity: 1,
            }
          : {};

      return (
        <div className="cocalc-jupyter-insert-cell-controls" style={style}>
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
     * TODO: cocalc has a markdown parser and is very good at parsing markdown (e.g., slate uses that),
     * and we should obviously using that instead of an adhoc parsing that will break on some inputs,
     * e.g., triple backticks is not ALWAYS the code delimiter (it can be spaces, it can be more than 3
     * backticks).
     */
    function extractCode(raw: string): {
      content: string;
      type: "code" | "markdown";
    } {
      const ret: string[] = [];
      let inside = false;
      let haveCode = false;
      for (const line of raw.split("\n")) {
        if (line.startsWith("```")) {
          inside = true;
          continue;
        }
        if (inside) {
          // ignore the remaining lines
          if (line.startsWith("```")) break;
          ret.push(line);
          haveCode = true;
        }
      }

      // if there is nothing in "ret", it probably returned a comment explaining it does not know what to do
      if (ret.length > 0) {
        return {
          content: ret.join("\n"),
          type: haveCode ? "code" : "markdown",
        };
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
      const prevCellID = fa.getPreviousCodeCellID(
        id,
        position === "below" ? 0 : -1
      );
      const prevCode =
        prevCellID != null
          ? `The previous code cell is\n\n\`\`\`${lang}\n${fa.get_cell_input(
              prevCellID
            )}\n\`\`\``
          : "";

      const input = `Create a new code cell for a Jupyter Notebook. Kernel: "${kernel_name}". Programming language: "${lang}". Return the entire code in a single block. Enclosed this block in triple backticks. Do not tell what the output will be. Add comments as code comments. ${prevCode}\n\nThe new cell should do this:\n\n${prompt}`;

      //console.log("input:\n", input);

      try {
        setQuerying(true);
        const tag = "generate-jupyter-cell";
        track("chatgpt", { project_id, path, tag, type: "generate" });

        // This is here to make it clear this was generated by GPT.
        // It could also be a comment in the code cell but for that we would need to know how the
        // comment character is in the language.
        const noteCellId = insertCell(
          "markdown",
          `The following cell was generated by ChatGPT using the prompt:\n\n> ${prompt}\n\n `
        );

        const gptCellId = insertCell(
          "markdown",
          ":robot: thinking…",
          noteCellId,
          1 // the "1" makes sure to always insert "below" the referenced "$where" cell
        );
        fa.set_mode("escape"); // while tokens come in ...
        if (gptCellId == null) return; // to make TS happy

        const reply = await webapp_client.openai_client.chatgptStream({
          input,
          project_id,
          path,
          system: `Return a single code block in the language "${lang}".`,
          tag,
          model: "gpt-3.5-turbo",
        });

        const updateCell = throttle(
          function (answer) {
            const { content, type } = extractCode(answer);
            fa.set_cell_input(gptCellId, content);
            actions.set_cell_type(gptCellId, type);
          },
          750,
          { leading: true, trailing: true }
        );

        let answer = "";
        reply.on("token", (token) => {
          if (token != null) {
            answer += token;
            updateCell(answer);
          } else {
            fa.switch_code_cell_to_edit(gptCellId);
          }
        });
        reply.on("error", (err) => {
          fa.set_cell_input(
            gptCellId,
            `# Error generating code cell\n\n\`\`\`\n${err}\n\`\`\`\n\nOpenAI [status](https://status.openai.com) and [downdetector](https://downdetector.com/status/openai).`
          );
          actions.set_cell_type(gptCellId, "markdown");
          fa.set_mode("escape");
          return;
        });
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
      return (
        <>
          <Paragraph>
            Describe what the next cell should do. The nearest code cell from
            above will be sent along the query to provide context.
          </Paragraph>
          <Paragraph>
            <Input
              allowClear
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
              <Button type="primary" onClick={queryChatGPT} disabled={querying}>
                Generate
              </Button>
              <Button onClick={() => setShowChatGPT(false)}>Cancel</Button>
            </Space>
          </Paragraph>
        </>
      );
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

    const classNames = ["cocalc-jupyter-insert-cell"];
    if (position === "below") {
      classNames.push("cocalc-jupyter-insert-cell-below");
    }

    return (
      <div
        className={classNames.join(" ")}
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
              style={{ width: "400px", maxWidth: "90vw" }}
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
