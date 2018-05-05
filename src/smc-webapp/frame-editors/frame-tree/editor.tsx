import { React, rclass, rtypes, Component, Rendered } from "../generic/react";

const { ErrorDisplay, Loading } = require("smc-webapp/r_misc");

import { FormatBar } from "./format-bar.tsx";

import { StatusBar } from "./status-bar.tsx";
const { FrameTree } = require("../code-editor/frame-tree");

import { is_different } from "../generic/misc";

interface FrameTreeEditorProps {
  actions: any;
  path: string;
  project_id: string;
  format_bar: boolean;
  editor_spec: any;

  // reduxProps:
  name: string;

  editor_settings?: Map<string, any>;

  is_public: boolean;
  has_unsaved_changes: boolean;
  has_uncommitted_changes: boolean;
  read_only: boolean;
  is_loaded: boolean;
  local_view_state: Map<string, any>;
  error: string;
  cursors: Map<string, any>;
  status: string;

  load_time_estimate?: Map<string, any>;
  value?: string;
  content?: string;
}

class FrameTreeEditor0 extends Component<FrameTreeEditorProps, {}> {
  static reduxProps({ name }) {
    return {
      account: {
        editor_settings: rtypes.immutable.Map
      },
      [name]: {
        is_public: rtypes.bool.isRequired,
        has_unsaved_changes: rtypes.bool.isRequired,
        has_uncommitted_changes: rtypes.bool.isRequired,
        read_only: rtypes.bool.isRequired,
        is_loaded: rtypes.bool.isRequired,
        local_view_state: rtypes.immutable.Map.isRequired,
        error: rtypes.string.isRequired,
        cursors: rtypes.immutable.Map.isRequired,
        status: rtypes.string.isRequired,

        load_time_estimate: rtypes.immutable.Map,
        value: rtypes.string,
        content: rtypes.string
      }
    };
  }

  shouldComponentUpdate(next): boolean {
    if (
      this.props.editor_settings === undefined ||
      next.editor_settings === undefined
    )
      return true;
    return (
      is_different(
        this.props,
        next,
        [
          "is_public",
          "has_unsaved_changes",
          "has_uncommitted_changes",
          "read_only",
          "is_loaded",
          "local_view_state",
          "error",
          "cursors",
          "status",
          "load_time_estimate",
          "value",
          "content"
        ]
      ) ||
      this.props.editor_settings.get("extra_button_bar") !==
        next.editor_settings.get("extra_button_bar")
    );
  }

  render_format_bar(): Rendered {
    if (
      this.props.format_bar &&
      !this.props.is_public &&
      this.props.editor_settings &&
      this.props.editor_settings.get("extra_button_bar")
    )
      return <FormatBar actions={this.props.actions} extension={"html"} />;
  }

  render_frame_tree(): Rendered {
    if (!this.props.is_loaded) return;
    const local = this.props.local_view_state;
    const frame_tree = local.get("frame_tree");
    const editor_state = local.get("editor_state");
    return (
      <div className={"smc-vfill"}>
        <FrameTree
          name={name}
          actions={this.props.actions}
          frame_tree={frame_tree}
          editor_state={editor_state}
          project_id={this.props.project_id}
          path={this.props.path}
          active_id={local.get("active_id")}
          full_id={local.get("full_id")}
          font_size={local.get("font_size")}
          is_only={frame_tree.get("type") !== "node"}
          cursors={this.props.cursors}
          read_only={this.props.read_only}
          is_public={this.props.is_public}
          content={this.props.content}
          value={this.props.value}
          editor_spec={this.props.editor_spec}
        />
      </div>
    );
  }

  render_error(): Rendered {
    if (!this.props.error) {
      return;
    }
    return (
      <ErrorDisplay
        error={this.props.error}
        onClose={() => this.props.actions.set_error("")}
        style={{
          maxWidth: "100%",
          margin: "1ex",
          maxHeight: "30%",
          overflowY: "scroll"
        }}
      />
    );
  }

  render_status_bar(): Rendered {
    let status: string;
    if (!this.props.is_loaded) {
      status = `Waiting for ${this.props.path}...`;
    } else {
      status = this.props.status;
    }
    return <StatusBar status={status} />;
  }

  render_loading(): Rendered {
    if (this.props.is_loaded) return;
    return (
      <div
        className="smc-vfill"
        style={{
          fontSize: "40px",
          textAlign: "center",
          padding: "15px",
          color: "#999"
        }}
      >
        <Loading estimate={this.props.load_time_estimate} />
      </div>
    );
  }

  render(): Rendered {
    return (
      <div className="smc-vfill">
        {this.render_error()}
        {this.render_format_bar()}
        {this.render_loading()}
        {this.render_frame_tree()}
        {this.render_status_bar()}
      </div>
    );
  }
}

const FrameTreeEditor = rclass(FrameTreeEditor0);

interface Options {
  display_name: string;
  format_bar: boolean;
  editor_spec: any;
}

interface EditorProps {
  actions: any;
  name: string;
  path: string;
  project_id: string;
}

export function createEditor(opts: Options) {
  class Editor extends Component<EditorProps, {}> {
    public displayName: string = opts.display_name;

    render(): Rendered {
      return (
        <FrameTreeEditor
          actions={this.props.actions}
          name={this.props.name}
          path={this.props.path}
          project_id={this.props.project_id}
          format_bar={opts.format_bar}
          editor_spec={opts.editor_spec}
        />
      );
    }
  }
  return Editor;
}
