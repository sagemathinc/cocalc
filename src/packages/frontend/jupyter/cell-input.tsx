/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
React component that describes the input of a cell
*/

declare const $: any;

import { React, Rendered } from "../app-framework";
import { Map, fromJS } from "immutable";
import { Button, ButtonGroup } from "react-bootstrap";
import { startswith, filename_extension } from "@cocalc/util/misc";
import { Icon, Markdown } from "../components";
import { CodeMirror } from "./codemirror-component";
import { InputPrompt } from "./prompt/input";
import { Complete } from "./complete";
import { CellToolbar } from "./cell-toolbar";
import { CellTiming } from "./cell-output-time";
import { get_blob_url } from "./server-urls";
import { CellHiddenPart } from "./cell-hidden-part";
import useNotebookFrameActions from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/hook";
import { JupyterActions } from "./browser-actions";
import MarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import { SAVE_DEBOUNCE_MS } from "@cocalc/frontend/frame-editors/code-editor/const";

function href_transform(
  project_id: string | undefined,
  cell: Map<string, any>
): (string) => string {
  return (href: string) => {
    if (!startswith(href, "attachment:")) {
      return href;
    }
    const name = href.slice("attachment:".length);
    const data = cell.getIn(["attachments", name]);
    let ext = filename_extension(name);
    switch (data?.get("type")) {
      case "sha1":
        const sha1 = data.get("value");
        if (project_id == null) {
          return href; // can't do anything.
        }
        return get_blob_url(project_id, ext, sha1);
      case "base64":
        if (ext === "jpg") {
          ext = "jpeg";
        }
        return `data:image/${ext};base64,${data.get("value")}`;
      default:
        return "";
    }
  };
}

function markdown_post_hook(elt) {
  return elt.find(":header").each((_, h) => {
    h = $(h);
    const hash = h.text().trim().replace(/\s/g, "-");
    h.attr("id", hash).addClass("cocalc-jupyter-header");
    h.append(
      $("<a/>")
        .addClass("cocalc-jupyter-anchor-link")
        .attr("href", `#${hash}`)
        .text("¶")
    );
  });
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
  is_scrolling?: boolean;
  id: string;
  index: number;
}

export const CellInput: React.FC<CellInputProps> = React.memo(
  (props) => {
    const frameActions = useNotebookFrameActions();
    function render_input_prompt(type: string): Rendered {
      return (
        <InputPrompt
          type={type}
          state={props.cell.get("state")}
          exec_count={props.cell.get("exec_count")}
          kernel={props.cell.get("kernel")}
          start={props.cell.get("start")}
          end={props.cell.get("end")}
          actions={props.actions}
          id={props.id}
        />
      );
    }

    function handle_upload_click(): void {
      if (props.actions == null) {
        return;
      }
      props.actions.insert_image(props.id);
    }

    function handle_md_double_click(): void {
      if (props.cell.getIn(["metadata", "editable"]) === false) {
        // TODO: NEVER ever silently fail!
        return;
      }
      const id = props.cell.get("id");
      frameActions.current?.set_md_cell_editing(id);
      frameActions.current?.set_cur_id(id);
      frameActions.current?.set_mode("edit");
    }

    function options(type: "code" | "markdown" | "raw"): Map<string, any> {
      let opt: Map<string, any>;
      switch (type) {
        case "code":
          opt = props.cm_options.get("options");
          break;
        case "markdown":
          opt = props.cm_options.get("markdown");
          break;
        case "raw":
        default:
          opt = props.cm_options.get("options");
          opt = opt.set("mode", {});
          opt = opt.set("foldGutter", false); // no use with no mode
          break;
      }
      if (props.is_readonly) {
        opt = opt.set("readOnly", true);
      }
      if (props.cell.get("line_numbers") != null) {
        opt = opt.set("lineNumbers", props.cell.get("line_numbers"));
      }
      return opt;
    }

    function render_codemirror(type: "code" | "markdown" | "raw"): Rendered {
      let value = props.cell.get("input");
      if (typeof value != "string") {
        // E.g., if it is null or a weird object.  This shouldn't happen, but typescript doesn't
        // guarantee it. I have hit this in production: https://sagemathcloud.zendesk.com/agent/tickets/8963
        // and anyways, a user could edit the underlying db file and mess things up.
        value = "";
      }
      return (
        <CodeMirror
          value={value}
          options={options(type)}
          actions={props.actions}
          id={props.cell.get("id")}
          is_focused={props.is_focused}
          font_size={props.font_size}
          cursors={props.cell.get("cursors")}
          is_scrolling={props.is_scrolling}
          registerEditor={(editor) => {
            frameActions.current?.register_input_editor(
              props.cell.get("id"),
              editor
            );
          }}
          unregisterEditor={() => {
            frameActions.current?.unregister_input_editor(props.cell.get("id"));
          }}
        />
      );
    }

    function render_markdown_edit_button(): Rendered {
      if (
        !props.is_current ||
        props.actions == null ||
        props.cell.getIn(["metadata", "editable"]) === false
      ) {
        return;
      }
      return (
        <ButtonGroup style={{ float: "right" }}>
          <Button onClick={handle_md_double_click}>
            <Icon name="edit" /> Edit
          </Button>
          <Button onClick={handle_upload_click}>
            <Icon name="image" />
          </Button>
        </ButtonGroup>
      );
    }

    function render_markdown(): Rendered {
      let value = props.cell.get("input");
      if (typeof value != "string") {
        // E.g., if it is null.  This shouldn't happen, but typescript doesn't
        // guarantee it. I might have hit this in production...
        value = "";
      }
      value = value.trim();
      if (value === "" && props.actions) {
        value = "Type *Markdown* and LaTeX: $\\alpha^2$";
      }
      return (
        <div
          onDoubleClick={handle_md_double_click}
          style={{ width: "100%", wordWrap: "break-word", overflow: "auto" }}
          className="cocalc-jupyter-rendered cocalc-jupyter-rendered-md"
        >
          {render_markdown_edit_button()}
          <Markdown
            value={value}
            project_id={props.project_id}
            file_path={props.directory}
            href_transform={href_transform(props.project_id, props.cell)}
            post_hook={markdown_post_hook}
            safeHTML={!props.trust}
          />
        </div>
      );
    }

    function render_unsupported(type: string): Rendered {
      return <div>Unsupported cell type {type}</div>;
    }

    function renderMarkdownEdit() {
      const cmOptions = options("markdown").toJS();
      return (
        <MarkdownInput
          cacheId={`${props.id}${frameActions.current?.frame_id}`}
          value={props.cell.get("input") ?? ""}
          height="auto"
          onChange={(value) => {
            props.actions?.set_cell_input(props.id, value, true);
          }}
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
            frameActions.current?.register_input_editor(
              props.cell.get("id"),
              editor
            );
          }}
          unregisterEditor={() => {
            frameActions.current?.unregister_input_editor(props.cell.get("id"));
          }}
          modeSwitchStyle={{ marginRight: "32px" }}
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
            //return render_codemirror(type);
          } else {
            return render_markdown();
          }
        default:
          return render_unsupported(type);
      }
    }

    function render_complete(): Rendered {
      if (
        props.actions != null &&
        props.complete &&
        props.complete.get("matches", fromJS([])).size > 0
      ) {
        return (
          <Complete
            complete={props.complete}
            actions={props.actions}
            id={props.id}
          />
        );
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

    function render_time(): Rendered {
      return (
        <div
          style={{
            position: "absolute",
            zIndex: 1,
            right: "2px",
            width: "100%",
            paddingLeft: "5px",
          }}
          className="pull-right hidden-xs"
        >
          <div
            style={{
              color: "#666",
              fontSize: "8pt",
              position: "absolute",
              right: "5px",
              lineHeight: 1.25,
              top: "1px",
              textAlign: "right",
            }}
          >
            <span style={{ float: "right" }}>{render_cell_number()}</span>
            {render_cell_timing()}
          </div>
        </div>
      );
    }

    function render_cell_timing(): Rendered {
      if (props.cell.get("start") == null) return;
      return (
        <CellTiming
          start={props.cell.get("start")}
          end={props.cell.get("end")}
          state={props.cell.get("state")}
        />
      );
    }

    function render_cell_number(): Rendered {
      return (
        <span
          style={{
            marginLeft: "3px",
            padding: "0 3px",
            borderLeft: "1px solid #ccc",
            borderBottom: "1px solid #ccc",
          }}
        >
          {props.index + 1}
        </span>
      );
    }

    function render_hidden(): JSX.Element {
      return (
        <CellHiddenPart
          title={
            "Input is hidden; show via Edit --> Toggle hide input in the menu."
          }
        />
      );
    }

    if (props.cell.getIn(["metadata", "jupyter", "source_hidden"])) {
      return render_hidden();
    }

    const type = props.cell.get("cell_type") || "code";
    return (
      <div>
        {render_cell_toolbar()}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "stretch",
          }}
          cocalc-test="cell-input"
        >
          {render_input_prompt(type)}
          {render_complete()}
          {render_input_value(type)}
          {render_time()}
        </div>
      </div>
    );
  },
  (
    cur,
    next /* this has got ugly; the not is from converting from component */
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
      next.is_scrolling !== cur.is_scrolling ||
      next.cell_toolbar !== cur.cell_toolbar ||
      next.index !== cur.index ||
      (next.cell_toolbar === "slideshow" &&
        next.cell.get("slide") !== cur.cell.get("slide"))
    )
);
