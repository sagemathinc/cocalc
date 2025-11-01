/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
React component that describes the input of a cell
*/

import { Map } from "immutable";
import { useCallback, useEffect, useRef } from "react";

import { React, Rendered, redux } from "@cocalc/frontend/app-framework";
import { HiddenXS } from "@cocalc/frontend/components/hidden-visible";
import MarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import MostlyStaticMarkdown from "@cocalc/frontend/editors/slate/mostly-static-markdown";
import { SAVE_DEBOUNCE_MS } from "@cocalc/frontend/frame-editors/code-editor/const";
import useNotebookFrameActions from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/hook";
import { FileContext, useFileContext } from "@cocalc/frontend/lib/file-context";
import { LLMTools } from "@cocalc/jupyter/types";
import { CellType } from "@cocalc/util/jupyter/types";
import { filename_extension, startswith } from "@cocalc/util/misc";
import { JupyterActions } from "./browser-actions";
import { CellButtonBar } from "./cell-buttonbar";
import { CellHiddenPart } from "./cell-hidden-part";
import { CellToolbar } from "./cell-toolbar";
import { CodeMirror } from "./codemirror-component";
import { Position } from "./insert-cell/types";
import { InputPrompt } from "./prompt/input";

function attachmentTransform(
  cell: Map<string, any>,
  href?: string,
): string | undefined {
  if (!href || !startswith(href, "attachment:")) {
    return;
  }
  const name = href.slice("attachment:".length);
  const data = cell.getIn(["attachments", name]) as any;
  let ext = filename_extension(name);
  switch (data?.get("type")) {
    case "base64":
      if (ext === "jpg") {
        ext = "jpeg";
      }
      return `data:image/${ext};base64,${data.get("value")}`;
    default:
      return "";
  }
}

export interface CellInputProps {
  actions?: JupyterActions; // if not defined, then everything read only
  cm_options: Map<string, any>;
  cell: Map<string, any>;
  is_markdown_edit: boolean;
  is_focused: boolean;
  is_current: boolean;
  font_size: number;
  project_id?: string;
  directory?: string;
  complete?: Map<string, any>;
  cell_toolbar?: string;
  trust?: boolean;
  is_readonly: boolean;
  input_is_readonly: boolean;
  is_scrolling?: boolean;
  id: string;
  index: number;
  llmTools?: LLMTools;
  computeServerId?: number;
  setShowAICellGen?: (show: Position) => void;
  dragHandle?: React.JSX.Element;
}

export const CellInput: React.FC<CellInputProps> = React.memo(
  (props) => {
    const frameActions = useNotebookFrameActions();

    // NOTE: These two flags are primarily used to enable/disable tools in course projects
    const projectsStore = redux.getStore("projects");
    const haveAIGenerateCell: boolean =
      props.llmTools != null &&
      projectsStore.hasLanguageModelEnabled(props.project_id, "generate-cell");
    const haveLLMCellTools: boolean =
      props.llmTools != null &&
      projectsStore.hasLanguageModelEnabled(
        props.project_id,
        "jupyter-cell-llm",
      );

    function render_input_prompt(type: string): Rendered {
      return (
        <HiddenXS>
          <InputPrompt
            type={type}
            state={props.cell.get("state")}
            exec_count={props.cell.get("exec_count")}
            kernel={props.cell.get("kernel")}
            start={props.cell.get("start")}
            end={props.cell.get("end")}
            actions={props.actions}
            id={props.id}
            dragHandle={props.dragHandle}
            read_only={props.input_is_readonly}
          />
        </HiddenXS>
      );
    }

    function handle_md_double_click(): void {
      if (props.input_is_readonly) {
        return;
      }
      frameActions.current?.switch_md_cell_to_edit(props.cell.get("id"));
    }

    function options(type: CellType): Map<string, any> {
      let opt: Map<string, any>;
      switch (type) {
        case "code":
          opt = props.cm_options.get("options");
          break;
        case "markdown":
          opt = props.cm_options.get("markdown");
          break;
        case "raw":
        default: // no use with no mode
          opt = props.cm_options.get("options");
          opt = opt.set("mode", {});
          opt = opt.set("foldGutter", false);
          break;
      }
      if (props.input_is_readonly) {
        opt = opt.set("readOnly", true);
      }
      if (props.cell.get("line_numbers") != null) {
        opt = opt.set("lineNumbers", props.cell.get("line_numbers"));
      }
      return opt;
    }

    function render_codemirror(type: CellType): Rendered {
      let value = props.cell.get("input");
      if (typeof value != "string") {
        // E.g., if it is null or a weird object.  This shouldn't happen, but typescript doesn't
        // guarantee it. I have hit this in production: https://sagemathcloud.zendesk.com/agent/tickets/8963
        // and anyways, a user could edit the underlying db file and mess things up.
        value = "";
      }
      return (
        <CodeMirror
          actions={
            props.is_readonly || props.input_is_readonly
              ? undefined
              : props.actions
            /* Do NOT pass in actions when read only, since having any actions *defines*
            not read only for the codemirror editor; also, it will get created with
            potentially the same id as a normal cell, hence get linked to it, and
            then changing it, changes the original cell... causing timetravel
            to "instantly revert". */
          }
          complete={props.complete}
          getValueRef={getValueRef}
          value={value}
          options={options(type)}
          id={props.cell.get("id")}
          is_focused={props.is_focused}
          is_current={props.is_current}
          font_size={props.font_size}
          cursors={props.cell.get("cursors")}
          is_scrolling={props.is_scrolling}
          registerEditor={(editor) => {
            frameActions.current?.register_input_editor(
              props.cell.get("id"),
              editor,
            );
          }}
          unregisterEditor={() => {
            frameActions.current?.unregister_input_editor(props.cell.get("id"));
          }}
          setShowAICellGen={
            haveAIGenerateCell ? props.setShowAICellGen : undefined
          }
        />
      );
    }

    const fileContext = useFileContext();

    const urlTransform = useCallback(
      (url, tag?) => {
        const url1 = attachmentTransform(props.cell, url);
        if (url1 != null && url1 != url) {
          return url1;
        }
        return fileContext.urlTransform?.(url, tag);
      },
      [props.cell.get("attachments")],
    );

    function render_markdown(): Rendered {
      let value = props.cell.get("input");
      if (typeof value != "string") {
        // E.g., if it is null.  This shouldn't happen, but typescript doesn't
        // guarantee it. I might have hit this in production...
        value = "";
      }
      value = value.trim();
      if (props.actions?.processRenderedMarkdown != null) {
        value = props.actions.processRenderedMarkdown({ value, id: props.id });
      }
      return (
        <div
          onDoubleClick={handle_md_double_click}
          style={{ width: "100%", wordWrap: "break-word", overflow: "auto" }}
          className="cocalc-jupyter-rendered cocalc-jupyter-rendered-md"
        >
          <MostlyStaticMarkdown
            value={value}
            onChange={(value) => {
              if (props.input_is_readonly) {
                return;
              }
              // user checked a checkbox.
              props.actions?.set_cell_input(props.id, value, true);
            }}
          />
        </div>
      );
    }

    function render_unsupported(type: string): Rendered {
      return <div>Unsupported cell type {type}</div>;
    }

    const getValueRef = useRef<any>(null);

    const beforeChange = useCallback(() => {
      if (getValueRef.current == null || props.actions == null) return;
      props.actions.set_cell_input(props.id, getValueRef.current(), true);
    }, [props.id]);

    useEffect(() => {
      if (props.actions == null) return;
      if (props.is_focused) {
        props.actions.syncdb?.on("before-change", beforeChange);
      } else {
        // On loss of focus, we call it once just to be sure that any
        // changes are saved.  Not doing this would definitely result
        // in lost work, if user made a change, then immediately switched
        // cells right when upstream changes are coming in.
        beforeChange();
        props.actions.syncdb?.removeListener("before-change", beforeChange);
      }
      return () => {
        props.actions?.syncdb?.removeListener("before-change", beforeChange);
      };
    }, [props.is_focused]);

    function renderMarkdownEdit() {
      const cmOptions = options("markdown").toJS();
      if (cmOptions?.readOnly) {
        // see https://github.com/sagemathinc/cocalc/issues/7777
        return render_markdown();
      }
      return (
        <MarkdownInput
          fontSize={props.font_size}
          enableMentions={true}
          cacheId={`${props.id}${frameActions.current?.frame_id}`}
          value={props.cell.get("input") ?? ""}
          height="auto"
          onChange={(value) => {
            props.actions?.set_cell_input(props.id, value, true);
          }}
          getValueRef={getValueRef}
          onShiftEnter={(value) => {
            props.actions?.set_cell_input(props.id, value, true);
            frameActions.current?.set_md_cell_not_editing(props.id);
          }}
          saveDebounceMs={SAVE_DEBOUNCE_MS}
          cmOptions={cmOptions}
          autoFocus={props.is_focused || props.is_current}
          onUndo={
            props.actions == null
              ? undefined
              : () => {
                  props.actions?.undo();
                }
          }
          onRedo={
            props.actions == null
              ? undefined
              : () => {
                  props.actions?.redo();
                }
          }
          onSave={
            props.actions == null
              ? undefined
              : () => {
                  props.actions?.save();
                }
          }
          onCursors={
            props.actions == null
              ? undefined
              : (cursors) => {
                  const id = props.cell.get("id");
                  const cur = cursors.map((z) => {
                    return { ...z, id };
                  });
                  props.actions?.set_cursor_locs(cur);
                }
          }
          cursors={props.cell.get("cursors")?.toJS()}
          onCursorTop={() => {
            frameActions.current?.adjacentCell(-1, -1);
          }}
          onCursorBottom={() => {
            frameActions.current?.adjacentCell(0, 1);
          }}
          isFocused={props.is_focused}
          onFocus={() => {
            const actions = frameActions.current;
            if (actions != null) {
              actions.unselect_all_cells();
              actions.set_cur_id(props.id);
              actions.set_mode("edit");
            }
          }}
          registerEditor={(editor) => {
            frameActions.current?.register_input_editor(props.cell.get("id"), {
              set_cursor: editor.set_cursor,
              get_cursor: () => {
                const cur = editor.get_cursor();
                if (cur == null) return cur;
                return { line: cur.y, ch: cur.x };
              },
            });
          }}
          unregisterEditor={() => {
            frameActions.current?.unregister_input_editor(props.cell.get("id"));
          }}
          modeSwitchStyle={{ marginRight: "32px" }}
          editBarStyle={{
            paddingRight:
              "160px" /* ugly hack for now; bigger than default due to mode switch shift to accommodate cell number. */,
          }}
        />
      );
    }

    function render_input_value(type: string): Rendered {
      switch (type) {
        case "code":
          return render_codemirror(type);
        case "raw":
          return render_codemirror(type);
        case "markdown":
          if (props.is_markdown_edit) {
            return renderMarkdownEdit();
          } else {
            return render_markdown();
          }
        default:
          return render_unsupported(type);
      }
    }

    function render_cell_toolbar(): Rendered {
      if (props.cell_toolbar && props.actions) {
        return (
          <CellToolbar
            actions={props.actions}
            cell_toolbar={props.cell_toolbar}
            cell={props.cell}
          />
        );
      }
    }

    function render_hidden(): React.JSX.Element {
      return (
        <CellHiddenPart
          title={
            "Input is hidden; show via Edit --> Toggle hide input in the menu."
          }
        />
      );
    }

    const cell_type = props.cell.get("cell_type") || "code";

    function render_cell_buttonbar() {
      if (fileContext.disableExtraButtons) {
        return;
      }
      return (
        <CellButtonBar
          id={props.id}
          cell_type={cell_type}
          index={props.index}
          actions={props.actions}
          cell={props.cell}
          is_current={props.is_current}
          is_readonly={props.is_readonly}
          input_is_readonly={props.input_is_readonly}
          computeServerId={props.computeServerId}
          llmTools={props.llmTools}
          haveLLMCellTools={haveLLMCellTools}
        />
      );
    }

    if (props.cell.getIn(["metadata", "jupyter", "source_hidden"])) {
      return render_hidden();
    }

    return (
      <FileContext.Provider
        value={{
          ...fileContext,
          urlTransform,
        }}
      >
        <div>
          {render_cell_buttonbar()}
          {render_cell_toolbar()}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "stretch",
            }}
            cocalc-test="cell-input"
          >
            {render_input_prompt(cell_type)}
            {render_input_value(cell_type)}
          </div>
        </div>
      </FileContext.Provider>
    );
  },
  (
    cur,
    next /* this has got ugly; the not is from converting from component */,
  ) =>
    !(
      next.cell.get("input") !== cur.cell.get("input") ||
      next.cell.get("metadata") !== cur.cell.get("metadata") ||
      next.cell.get("exec_count") !== cur.cell.get("exec_count") ||
      next.cell.get("cell_type") !== cur.cell.get("cell_type") ||
      next.cell.get("state") !== cur.cell.get("state") ||
      next.cell.get("start") !== cur.cell.get("start") ||
      next.cell.get("end") !== cur.cell.get("end") ||
      next.cell.get("tags") !== cur.cell.get("tags") ||
      next.cell.get("cursors") !== cur.cell.get("cursors") ||
      next.cell.get("line_numbers") !== cur.cell.get("line_numbers") ||
      next.cm_options !== cur.cm_options ||
      next.trust !== cur.trust ||
      (next.is_markdown_edit !== cur.is_markdown_edit &&
        next.cell.get("cell_type") === "markdown") ||
      next.is_focused !== cur.is_focused ||
      next.is_current !== cur.is_current ||
      next.font_size !== cur.font_size ||
      next.complete !== cur.complete ||
      next.is_readonly !== cur.is_readonly ||
      next.input_is_readonly !== cur.input_is_readonly ||
      next.is_scrolling !== cur.is_scrolling ||
      next.cell_toolbar !== cur.cell_toolbar ||
      (next.llmTools?.model ?? "") !== (cur.llmTools?.model ?? "") ||
      next.index !== cur.index ||
      next.computeServerId != cur.computeServerId ||
      next.dragHandle !== cur.dragHandle ||
      (next.cell_toolbar === "slideshow" &&
        next.cell.get("slide") !== cur.cell.get("slide"))
    ),
);
