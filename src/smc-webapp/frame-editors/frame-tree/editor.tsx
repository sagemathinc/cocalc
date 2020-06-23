/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  React,
  rclass,
  rtypes,
  Component,
  Rendered,
  project_redux_name,
} from "../../app-framework";

import { ErrorDisplay, Loading, LoadingEstimate } from "smc-webapp/r_misc";
import { FormatBar } from "./format-bar";
import { StatusBar } from "./status-bar";
const { FrameTree } = require("./frame-tree");
import { EditorSpec, ErrorStyles } from "./types";

import { is_different, filename_extension } from "smc-util/misc2";

import { SetMap } from "./types";

import { AvailableFeatures } from "../../project_configuration";

interface FrameTreeEditorReactProps {
  name: string;
  actions: any;
  path: string;
  project_id: string;
  format_bar: boolean;
  format_bar_exclude?: SetMap;
  editor_spec: any;
}

interface FrameTreeEditorReduxProps {
  editor_settings?: Map<string, any>;
  terminal?: Map<string, any>;
  is_public: boolean;
  has_unsaved_changes: boolean;
  has_uncommitted_changes: boolean;
  read_only: boolean;
  is_loaded: boolean;
  local_view_state: Map<string, any>;
  error: string;
  errorstyle: ErrorStyles;
  cursors: Map<string, any>;
  status: string;
  load_time_estimate?: LoadingEstimate;
  value?: string;
  reload: Map<string, number>;
  resize: number; // if changes, means that frames have been resized, so may need refreshing; passed to leaf.
  misspelled_words: Set<string>;
  is_saving: boolean;
  gutter_markers: Map<string, any>;
  settings: Map<string, any>;
  complete: Map<string, any>;
  derived_file_types: Set<string>;
  available_features: AvailableFeatures;
}

type FrameTreeEditorProps = FrameTreeEditorReactProps &
  FrameTreeEditorReduxProps;

const FrameTreeEditor0 = class extends Component<FrameTreeEditorProps, {}> {
  private editor_spec: any = {};

  constructor(props) {
    super(props);
    // Copy the editor spec we will use for all future rendering
    // into our private state variable, and also do some function
    // evaluation (e.g,. if buttons is a function of the path).
    for (const type in props.editor_spec) {
      let spec = props.editor_spec[type];
      this.editor_spec[type] = spec;
    }
  }

  static reduxProps({ name, project_id }) {
    const project_store_name = project_redux_name(project_id);
    return {
      account: {
        editor_settings: rtypes.immutable.Map,
        terminal: rtypes.immutable.Map,
      },
      [name]: {
        is_public: rtypes.bool.isRequired,
        has_unsaved_changes: rtypes.bool.isRequired,
        has_uncommitted_changes: rtypes.bool.isRequired,
        read_only: rtypes.bool.isRequired,
        is_loaded: rtypes.bool.isRequired,
        local_view_state: rtypes.immutable.Map.isRequired,
        error: rtypes.string.isRequired,
        errorstyle: rtypes.string,
        cursors: rtypes.immutable.Map.isRequired,
        status: rtypes.string.isRequired,

        load_time_estimate: rtypes.immutable.Map,
        value: rtypes.string,

        reload: rtypes.immutable.Map.isRequired,
        resize: rtypes.number.isRequired, // if changes, means that frames have been resized, so may need refreshing; passed to leaf.
        misspelled_words: rtypes.immutable.Set.isRequired,
        is_saving: rtypes.bool.isRequired,

        gutter_markers: rtypes.immutable.Map.isRequired,

        settings: rtypes.immutable.Map.isRequired,

        complete: rtypes.immutable.Map.isRequired,

        derived_file_types: rtypes.immutable.Set,
      },
      [project_store_name]: {
        available_features: rtypes.immutable.Map,
      },
    };
  }

  shouldComponentUpdate(next): boolean {
    if (
      this.props.editor_settings === undefined ||
      next.editor_settings === undefined
    )
      return true;
    return (
      is_different(this.props, next, [
        // do NOT include editor_spec below -- it is assumed to never change
        "is_public",
        "has_unsaved_changes",
        "has_uncommitted_changes",
        "read_only",
        "is_loaded",
        "local_view_state",
        "error",
        "errorstyle",
        "cursors",
        "status",
        "load_time_estimate",
        "value",
        "reload",
        "resize",
        "misspelled_words",
        "has_unsaved_changes",
        "has_uncommitted_changes",
        "is_saving",
        "gutter_markers",
        "editor_settings",
        "terminal",
        "settings",
        "complete",
        "derived_file_types",
        "available_features",
      ]) ||
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
      return (
        <FormatBar
          actions={this.props.actions}
          extension={filename_extension(this.props.path)}
          exclude={this.props.format_bar_exclude}
        />
      );
  }

  render_frame_tree(): Rendered {
    if (!this.props.is_loaded) return;
    const local = this.props.local_view_state;
    const frame_tree = local.get("frame_tree");
    const editor_state = local.get("editor_state");
    return (
      <div className={"smc-vfill"}>
        <FrameTree
          editor_spec={this.editor_spec}
          name={this.props.name}
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
          value={this.props.value}
          reload={this.props.reload}
          resize={this.props.resize}
          misspelled_words={this.props.misspelled_words}
          has_unsaved_changes={this.props.has_unsaved_changes}
          has_uncommitted_changes={this.props.has_uncommitted_changes}
          is_saving={this.props.is_saving}
          gutter_markers={this.props.gutter_markers}
          editor_settings={this.props.editor_settings}
          terminal={this.props.terminal}
          settings={this.props.settings}
          status={this.props.status}
          complete={this.props.complete}
          derived_file_types={this.props.derived_file_types}
          available_features={this.props.available_features}
        />
      </div>
    );
  }

  render_error(): Rendered {
    if (!this.props.error) {
      return;
    }
    const style: any = {
      maxWidth: "100%",
      margin: "1ex",
      maxHeight: "30%",
      overflowY: "scroll",
    };
    if (this.props.errorstyle === "monospace") {
      style.fontFamily = "monospace";
      style.fontSize = "85%";
      style.whiteSpace = "pre-wrap";
    }
    return (
      <ErrorDisplay
        error={this.props.error}
        onClose={() => this.props.actions.set_error("")}
        style={style}
      />
    );
  }

  render_status_bar(): Rendered {
    if (!this.props.is_loaded) {
      return;
    }
    if (!this.props.status) {
      return;
    }
    return <StatusBar status={this.props.status} />;
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
          color: "#999",
        }}
      >
        <Loading estimate={this.props.load_time_estimate} />
      </div>
    );
  }

  render(): Rendered {
    return (
      <div className="smc-vfill cc-frame-tree-editor">
        {this.render_error()}
        {this.render_format_bar()}
        {this.render_loading()}
        {this.render_frame_tree()}
        {this.render_status_bar()}
      </div>
    );
  }
} as React.ComponentType<FrameTreeEditorReactProps>;

const FrameTreeEditor = rclass(FrameTreeEditor0);

interface Options {
  display_name: string;
  format_bar: boolean;
  format_bar_exclude?: SetMap;
  editor_spec: EditorSpec;
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

    render(): JSX.Element {
      return (
        <FrameTreeEditor
          actions={this.props.actions}
          name={this.props.name}
          path={this.props.path}
          project_id={this.props.project_id}
          format_bar={opts.format_bar}
          format_bar_exclude={opts.format_bar_exclude}
          editor_spec={opts.editor_spec}
        />
      );
    }
  }
  return Editor;
}
