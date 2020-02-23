/*
React component that describes the input of a cell
*/

declare const $: any;

import { React, Component, Rendered } from "../app-framework";
import { Map, fromJS } from "immutable";
import { Button, ButtonGroup } from "react-bootstrap";
import { startswith, filename_extension } from "smc-util/misc";
import { Icon, Markdown } from "../r_misc";
import { CodeMirror } from "./codemirror";
import { InputPrompt } from "./prompt";
import { Complete } from "./complete";
import { CellToolbar } from "./cell-toolbar";
import { CellTiming } from "./cell-output-time";
import { get_blob_url } from "./server-urls";
import { CellHiddenPart } from "./cell-hidden-part";

import { JupyterActions } from "./browser-actions";
import { NotebookFrameActions } from "../frame-editors/jupyter-editor/cell-notebook/actions";

function href_transform(
  project_id: string | undefined,
  cell: Map<string, any>
): Function {
  return (href: string) => {
    if (!startswith(href, "attachment:")) {
      return href;
    }
    const name = href.slice("attachment:".length);
    const data = cell.getIn(["attachments", name]);
    let ext = filename_extension(name);
    switch (data != null ? data.get("type") : undefined) {
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
    const hash = h
      .text()
      .trim()
      .replace(/\s/g, "-");
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
  frame_actions?: NotebookFrameActions;
  cm_options: Map<string, any>; // TODO: what is this
  cell: Map<string, any>; // TODO: what is this
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

export class CellInput extends Component<CellInputProps> {
  public shouldComponentUpdate(nextProps: CellInputProps): boolean {
    return (
      nextProps.cell.get("input") !== this.props.cell.get("input") ||
      nextProps.cell.get("metadata") !== this.props.cell.get("metadata") ||
      nextProps.cell.get("exec_count") !== this.props.cell.get("exec_count") ||
      nextProps.cell.get("cell_type") !== this.props.cell.get("cell_type") ||
      nextProps.cell.get("state") !== this.props.cell.get("state") ||
      nextProps.cell.get("start") !== this.props.cell.get("start") ||
      nextProps.cell.get("end") !== this.props.cell.get("end") ||
      nextProps.cell.get("tags") !== this.props.cell.get("tags") ||
      nextProps.cell.get("cursors") !== this.props.cell.get("cursors") ||
      nextProps.cell.get("line_numbers") !==
        this.props.cell.get("line_numbers") ||
      nextProps.cm_options !== this.props.cm_options ||
      nextProps.trust !== this.props.trust ||
      (nextProps.is_markdown_edit !== this.props.is_markdown_edit &&
        nextProps.cell.get("cell_type") === "markdown") ||
      nextProps.is_focused !== this.props.is_focused ||
      nextProps.is_current !== this.props.is_current ||
      nextProps.font_size !== this.props.font_size ||
      nextProps.complete !== this.props.complete ||
      nextProps.is_readonly !== this.props.is_readonly ||
      nextProps.is_scrolling !== this.props.is_scrolling ||
      nextProps.cell_toolbar !== this.props.cell_toolbar ||
      nextProps.index !== this.props.index ||
      (nextProps.cell_toolbar === "slideshow" &&
        nextProps.cell.get("slide") !== this.props.cell.get("slide"))
    );
  }

  private render_input_prompt(type: string): Rendered {
    return (
      <InputPrompt
        type={type}
        state={this.props.cell.get("state")}
        exec_count={this.props.cell.get("exec_count")}
        kernel={this.props.cell.get("kernel")}
        start={this.props.cell.get("start")}
        end={this.props.cell.get("end")}
      />
    );
  }

  private handle_upload_click(): void {
    if (this.props.actions == null) {
      return;
    }
    this.props.actions.insert_image(this.props.id);
  }

  private handle_md_double_click(): void {
    if (this.props.frame_actions == null) {
      return;
    }
    if (this.props.cell.getIn(["metadata", "editable"]) === false) {
      // TODO: NEVER ever silently fail!
      return;
    }
    const id = this.props.cell.get("id");
    this.props.frame_actions.set_md_cell_editing(id);
    this.props.frame_actions.set_cur_id(id);
    this.props.frame_actions.set_mode("edit");
  }

  private options(type: "code" | "markdown" | "raw"): Map<string, any> {
    let opt: Map<string, any>;
    switch (type) {
      case "code":
        opt = this.props.cm_options.get("options");
        break;
      case "markdown":
        opt = this.props.cm_options.get("markdown");
        break;
      case "raw":
      default:
        opt = this.props.cm_options.get("options");
        opt = opt.set("mode", {});
        opt = opt.set("foldGutter", false); // no use with no mode
        break;
    }
    if (this.props.is_readonly) {
      opt = opt.set("readOnly", "nocursor");
    }
    if (this.props.cell.get("line_numbers") != null) {
      opt = opt.set("lineNumbers", this.props.cell.get("line_numbers"));
    }
    return opt;
  }

  private render_codemirror(type: "code" | "markdown" | "raw"): Rendered {
    return (
      <CodeMirror
        value={this.props.cell.get("input", "")}
        options={this.options(type)}
        actions={this.props.actions}
        frame_actions={this.props.frame_actions}
        id={this.props.cell.get("id")}
        is_focused={this.props.is_focused}
        font_size={this.props.font_size}
        cursors={this.props.cell.get("cursors")}
        is_scrolling={this.props.is_scrolling}
      />
    );
  }

  private render_markdown_edit_button(): Rendered {
    if (
      !this.props.is_current ||
      this.props.actions == null ||
      this.props.cell.getIn(["metadata", "editable"]) === false
    ) {
      return;
    }
    return (
      <ButtonGroup style={{ float: "right" }}>
        <Button onClick={this.handle_md_double_click.bind(this)}>
          <Icon name="edit" /> Edit
        </Button>
        <Button onClick={this.handle_upload_click.bind(this)}>
          <Icon name="image" />
        </Button>
      </ButtonGroup>
    );
  }

  private render_markdown(): Rendered {
    let value = this.props.cell.get("input");
    if (typeof value != "string") {
      // E.g., if it is null.  This shouldn't happen, but typescript doesn't
      // guarantee it. I might have hit this in production...
      value = "";
    }
    value = value.trim();
    if (value === "" && this.props.actions) {
      value = "Type *Markdown* and LaTeX: $\\alpha^2$";
    }
    return (
      <div
        onDoubleClick={this.handle_md_double_click.bind(this)}
        style={{ width: "100%", wordWrap: "break-word", overflow: "auto" }}
        className="cocalc-jupyter-rendered cocalc-jupyter-rendered-md"
      >
        {this.render_markdown_edit_button()}
        <Markdown
          value={value}
          project_id={this.props.project_id}
          file_path={this.props.directory}
          href_transform={href_transform(
            this.props.project_id,
            this.props.cell
          )}
          post_hook={markdown_post_hook}
          safeHTML={!this.props.trust}
        />
      </div>
    );
  }

  private render_unsupported(type: string): Rendered {
    return <div>Unsupported cell type {type}</div>;
  }

  private render_input_value(type: string): Rendered {
    switch (type) {
      case "code":
        return this.render_codemirror(type);
      case "raw":
        return this.render_codemirror(type);
      case "markdown":
        if (this.props.is_markdown_edit) return this.render_codemirror(type);
        else return this.render_markdown();
      default:
        return this.render_unsupported(type);
    }
  }

  private render_complete(): Rendered {
    if (
      this.props.actions != null &&
      this.props.frame_actions != null &&
      this.props.complete &&
      this.props.complete.get("matches", fromJS([])).size > 0
    ) {
      return (
        <Complete
          complete={this.props.complete}
          actions={this.props.actions}
          frame_actions={this.props.frame_actions}
          id={this.props.id}
        />
      );
    }
  }

  private render_cell_toolbar(): Rendered {
    if (this.props.cell_toolbar && this.props.actions) {
      return (
        <CellToolbar
          actions={this.props.actions}
          cell_toolbar={this.props.cell_toolbar}
          cell={this.props.cell}
        />
      );
    }
  }

  private render_time(): Rendered {
    return (
      <div
        style={{
          position: "absolute",
          zIndex: 1,
          right: "2px",
          width: "100%",
          paddingLeft: "5px"
        }}
        className="pull-right hidden-xs"
      >
        <div
          style={{
            color: "#999",
            fontSize: "8pt",
            position: "absolute",
            right: "5px",
            lineHeight: 1.25,
            top: "1px",
            textAlign: "right"
          }}
        >
          {this.render_cell_timing()}
          {this.render_cell_number()}
        </div>
      </div>
    );
  }

  private render_cell_timing(): Rendered {
    if (this.props.cell.get("start") == null) return;
    return (
      <CellTiming
        start={this.props.cell.get("start")}
        end={this.props.cell.get("end")}
        state={this.props.cell.get("state")}
      />
    );
  }

  private render_cell_number(): Rendered {
    return (
      <span
        style={{
          marginLeft: "3px",
          paddingLeft: "3px",
          borderLeft: "1px solid #ccc",
          borderBottom: "1px solid #ccc"
        }}
      >
        {this.props.index + 1}
      </span>
    );
  }

  private render_hidden(): Rendered {
    return (
      <CellHiddenPart
        title={
          "Input is hidden; show via Edit --> Toggle hide input in the menu."
        }
      />
    );
  }

  public render(): Rendered {
    if (this.props.cell.getIn(["metadata", "jupyter", "source_hidden"])) {
      return this.render_hidden();
    }

    const type = this.props.cell.get("cell_type") || "code";
    return (
      <div>
        {this.render_cell_toolbar()}
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "stretch"
          }}
          cocalc-test="cell-input"
        >
          {this.render_input_prompt(type)}
          {this.render_complete()}
          {this.render_input_value(type)}
          {this.render_time()}
        </div>
      </div>
    );
  }
}
