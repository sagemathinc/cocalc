/*
React component that describes the input of a cell
*/
import { React, Component } from "../app-framework"; // TODO: this will move
import { Map as ImmutableMap, fromJS } from "immutable";
import { Button } from "react-bootstrap";

// TODO: import jquery
// to make compiling TS in the hub work
declare const $: any;

// TODO: use imports
const misc = require("smc-util/misc");
const { Icon, Markdown } = require("../r_misc");
const { CodeMirror } = require("./codemirror");
const { InputPrompt } = require("./prompt");
const { Complete } = require("./complete");
const { CellToolbar } = require("./cell-toolbar");
const { CellTiming } = require("./cell-output-time");
const { get_blob_url } = require("./server-urls");

function href_transform(project_id: string, cell: any) {
  return (href: string) => {
    if (!misc.startswith(href, "attachment:")) {
      return href;
    }
    const name = href.slice("attachment:".length);
    const data = cell.getIn(["attachments", name]);
    let ext = misc.filename_extension(name);
    switch (data != null ? data.get("type") : undefined) {
      case "sha1":
        const sha1 = data.get("value");
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
  actions: any;
  cm_options: ImmutableMap<string, any>; // TODO: what is this
  cell: ImmutableMap<string, any>; // TODO: what is this
  is_markdown_edit: boolean;
  is_focused: boolean;
  is_current: boolean;
  font_size: number;
  project_id: string;
  directory: string;
  complete: ImmutableMap<string, any>; // TODO: what is this
  cell_toolbar: string;
  trust: boolean;
  is_readonly: boolean;
  id: any; // TODO: what is this
}

export class CellInput extends Component<CellInputProps> {
  shouldComponentUpdate(nextProps: CellInputProps) {
    return (
      nextProps.cell.get("input") !== this.props.cell.get("input") ||
      nextProps.cell.get("exec_count") !== this.props.cell.get("exec_count") ||
      nextProps.cell.get("cell_type") !== this.props.cell.get("cell_type") ||
      nextProps.cell.get("state") !== this.props.cell.get("state") ||
      nextProps.cell.get("start") !== this.props.cell.get("start") ||
      nextProps.cell.get("end") !== this.props.cell.get("end") ||
      nextProps.cell.get("tags") !== this.props.cell.get("tags") ||
      nextProps.cell.get("cursors") !== this.props.cell.get("cursors") ||
      nextProps.cell.get("line_numbers") !== this.props.cell.get("line_numbers") ||
      nextProps.cm_options !== this.props.cm_options ||
      nextProps.trust !== this.props.trust ||
      (nextProps.is_markdown_edit !== this.props.is_markdown_edit &&
        nextProps.cell.get("cell_type") === "markdown") ||
      nextProps.is_focused !== this.props.is_focused ||
      nextProps.is_current !== this.props.is_current ||
      nextProps.font_size !== this.props.font_size ||
      nextProps.complete !== this.props.complete ||
      nextProps.cell_toolbar !== this.props.cell_toolbar ||
      (nextProps.cell_toolbar === "slideshow" &&
        nextProps.cell.get("slide") !== this.props.cell.get("slide"))
    );
  }
  render_input_prompt = (type: any) => (
    <InputPrompt
      type={type}
      state={this.props.cell.get("state")}
      exec_count={this.props.cell.get("exec_count")}
      kernel={this.props.cell.get("kernel")}
      start={this.props.cell.get("start")}
      end={this.props.cell.get("end")}
    />
  );
  handle_md_double_click = () => {
    if (this.props.actions == null) {
      return;
    }
    if (this.props.cell.getIn(["metadata", "editable"]) === false) {
      return;
    }
    const id = this.props.cell.get("id");
    this.props.actions.set_md_cell_editing(id);
    this.props.actions.set_cur_id(id);
    return this.props.actions.set_mode("edit");
  };
  options = (type?: "code" | "markdown") => {
    let opt: any;
    switch (type) {
      case "code":
        opt = this.props.cm_options.get("options");
        break;
      case "markdown":
        opt = this.props.cm_options.get("markdown");
        break;
      default:
        // raw
        opt = this.props.cm_options.get("options");
        opt = opt.set("mode", {});
        opt = opt.set("foldGutter", false); // no use with no mode
    }
    if (this.props.is_readonly) {
      opt = opt.set("readOnly", "nocursor");
    }
    if (this.props.cell.get("line_numbers") != null) {
      opt = opt.set("lineNumbers", this.props.cell.get("line_numbers"));
    }
    return opt;
  };
  render_codemirror(type: any) {
    return (
      <CodeMirror
        value={this.props.cell.get("input", "")}
        options={this.options(type)}
        actions={this.props.actions}
        id={this.props.cell.get("id")}
        is_focused={this.props.is_focused}
        font_size={this.props.font_size}
        cursors={this.props.cell.get("cursors")}
      />
    );
  }
  render_markdown_edit_button() {
    if (
      !this.props.is_current ||
      this.props.actions == null ||
      this.props.cell.getIn(["metadata", "editable"]) === false
    ) {
      return;
    }
    return (
      <Button onClick={this.handle_md_double_click} style={{ float: "right" }}>
        <Icon name="edit" /> Edit
      </Button>
    );
  }
  render_markdown() {
    let value = this.props.cell.get("input", "").trim();
    if (value === "" && this.props.actions) {
      value = "Type *Markdown* and LaTeX: $\\alpha^2$";
    }
    return (
      <div
        onDoubleClick={this.handle_md_double_click}
        style={{ width: "100%", wordWrap: "break-word", overflow: "auto" }}
        className="cocalc-jupyter-rendered cocalc-jupyter-rendered-md"
      >
        {this.render_markdown_edit_button()}
        <Markdown
          value={value}
          project_id={this.props.project_id}
          file_path={this.props.directory}
          href_transform={href_transform(this.props.project_id, this.props.cell)}
          post_hook={markdown_post_hook}
          safeHTML={!this.props.trust}
        />
      </div>
    );
  }
  render_unsupported(type: any) {
    return <div>Unsupported cell type {type}</div>;
  }
  render_input_value(type: any) {
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
  render_complete() {
    if (this.props.complete && this.props.complete.get("matches", fromJS([])).size > 0) {
      return (
        <Complete complete={this.props.complete} actions={this.props.actions} id={this.props.id} />
      );
    }
  }
  render_cell_toolbar() {
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
  render_time() {
    if (this.props.cell.get("start") !== undefined) {
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
            <CellTiming
              start={this.props.cell.get("start")}
              end={this.props.cell.get("end")}
              state={this.props.cell.get("state")}
            />
          </div>
        </div>
      );
    }
  }
  render() {
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
