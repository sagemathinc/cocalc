/*
FrameTree -- a binary tree of editor frames.

For the first version, these will all be codemirror editors on the same file.
However, the next version will potentially be a mix of editors, output
places, terminals, etc.

The frame_tree prop is:

    id        : a UUID that uniquely determines this particular node in the frame tree
    type      : 'node'
    direction : 'row' = frame is split via horizontal line; 'col' = frame is split via vert line
    first     : NOT optional -- another object with id, type, etc.
    second    : another object with id, type, etc.
    pos       : optional; if given, is position of drag bar, as number from 0 to 1 (representation proportion of width or height).
    deletable : bool

or

    id        : a UUID that uniquely determines this particular node in the frame tree
    type      : 'cm'
    path      : path to file being edited
    font_size : font size of this file
    read_only : is it read only or not?
    deletable : bool
*/

import { delay } from "awaiting";
import { is_safari } from "../generic/browser";
import { hidden_meta_file, is_different } from "smc-util/misc2";
import {
  React,
  ReactDOM,
  Component,
  redux,
  Rendered,
} from "../../app-framework";
import { Map, Set } from "immutable";

const Draggable = require("react-draggable");
import { merge, copy } from "smc-util/misc";
const misc_page = require("smc-webapp/misc_page");

const feature = require("smc-webapp/feature");
import { FrameTitleBar } from "./title-bar";
import { FrameTreeLeaf } from "./leaf";
import * as tree_ops from "./tree-ops";
import { Loading } from "../../r_misc";
import { AvailableFeatures } from "../../project_configuration";
import { get_file_editor } from "./register";

import { TimeTravelActions } from "../time-travel-editor/actions";
import { EditorSpec, EditorDescription, NodeDesc } from "./types";
import { Actions } from "../code-editor/actions";

import { cm as cm_spec } from "../code-editor/editor";

const drag_offset = feature.IS_TOUCH ? 5 : 2;

const cols_drag_bar = {
  padding: `${drag_offset}px`,
  background: "#efefef",
  zIndex: 20,
  cursor: "ew-resize",
};

const drag_hover = {
  background: "darkgrey",
  opacity: 0.8,
};

const cols_drag_bar_drag_hover = merge(copy(cols_drag_bar), drag_hover);

const rows_drag_bar = merge(copy(cols_drag_bar), {
  cursor: "ns-resize",
});

const rows_drag_bar_drag_hover = merge(copy(rows_drag_bar), drag_hover);

interface FrameTreeProps {
  name: string; // just so editors (leaf nodes) can plug into reduxProps if they need to.
  actions: Actions;
  path: string; // assumed to never change -- all frames in same project
  project_id: string; // assumed to never change -- all frames in same project
  active_id: string;
  full_id: string;
  frame_tree: Map<string, any>;
  editor_state: Map<string, any>; // IMPORTANT: change does NOT cause re-render (uncontrolled); only used for full initial render, on purpose, i.e., setting scroll positions.
  font_size: number;
  is_only: boolean;
  cursors: Map<string, any>;
  read_only: boolean; // if true, then whole document considered read only (individual frames can still be via desc)
  is_public: boolean;
  value: string;
  editor_spec: EditorSpec;
  reload: Map<string, number>;
  resize: number; // if changes, means that frames have been resized, so may need refreshing; passed to leaf.
  misspelled_words: Set<string>;
  has_unsaved_changes: boolean;
  has_uncommitted_changes: boolean;
  is_saving: boolean;
  editor_settings: Map<string, any>;
  terminal: Map<string, any>; // terminal settings from account
  status: string;
  settings: Map<string, any>;
  complete: Map<string, any>;
  derived_file_types: Set<string>;
  available_features: AvailableFeatures;
}

interface FrameTreeState {
  drag_hover: boolean;
}

export class FrameTree extends Component<FrameTreeProps, FrameTreeState> {
  constructor(props) {
    super(props);
    this.state = { drag_hover: false };
  }

  componentWillUnmount(): void {
    const actions: any = this.props.actions;
    if (actions.blur != null) {
      actions.blur();
    }
  }

  shouldComponentUpdate(next, state): boolean {
    return (
      this.state.drag_hover !== state.drag_hover ||
      is_different(this.props, next, [
        "frame_tree",
        "active_id",
        "full_id",
        "is_only",
        "cursors",
        "has_unsaved_changes",
        "has_uncommitted_changes",
        "is_public",
        "value",
        "project_id",
        "path",
        "misspelled_words",
        "reload",
        "resize",
        "is_saving",
        "editor_settings",
        "terminal",
        "settings",
        "status",
        "complete",
        "derived_file_types",
        "available_features",
      ])
    );
  }

  render_frame_tree(desc) {
    return (
      <FrameTree
        name={this.props.name}
        actions={this.props.actions}
        frame_tree={desc}
        editor_state={this.props.editor_state}
        active_id={this.props.active_id}
        full_id={this.props.full_id}
        project_id={this.props.project_id}
        path={this.props.path}
        font_size={this.props.font_size}
        is_only={false}
        cursors={this.props.cursors}
        read_only={this.props.read_only}
        is_public={this.props.is_public}
        value={this.props.value}
        editor_spec={this.props.editor_spec}
        reload={this.props.reload}
        resize={this.props.resize}
        misspelled_words={this.props.misspelled_words}
        has_unsaved_changes={this.props.has_unsaved_changes}
        has_uncommitted_changes={this.props.has_uncommitted_changes}
        is_saving={this.props.is_saving}
        editor_settings={this.props.editor_settings}
        terminal={this.props.terminal}
        settings={this.props.settings}
        status={this.props.status}
        complete={this.props.complete}
        derived_file_types={this.props.derived_file_types}
        available_features={this.props.available_features}
      />
    );
  }

  private get_editor_actions(desc: NodeDesc): Actions {
    if (desc.get("type") == "cm" && this.props.editor_spec["cm"] == null) {
      // make it so the spec includes info about cm editor.
      this.props.editor_spec.cm = copy(cm_spec);
    }

    if (
      desc.get("type") == "cm" &&
      desc.get("path", this.props.path) != this.props.path
    ) {
      const manager = this.props.actions.get_code_editor(desc.get("id"));
      return manager.get_actions();
    } else {
      return this.props.actions;
    }
  }

  render_titlebar(
    desc: NodeDesc,
    spec: EditorDescription,
    editor_actions: Actions
  ): Rendered {
    const id = desc.get("id");
    return (
      <FrameTitleBar
        actions={this.props.actions}
        editor_actions={editor_actions}
        active_id={this.props.active_id}
        project_id={desc.get("project_id", this.props.project_id)}
        path={desc.get("path", this.props.path)}
        is_full={desc.get("id") === this.props.full_id && !this.props.is_only}
        is_only={this.props.is_only}
        id={id}
        is_paused={desc.get("is_paused")}
        type={desc.get("type")}
        editor_spec={this.props.editor_spec}
        spec={spec}
        status={this.props.status}
        title={desc.get("title")}
        connection_status={desc.get("connection_status")}
        font_size={desc.get("font_size")}
        available_features={this.props.available_features}
      />
    );
  }

  render_leaf(
    desc: NodeDesc,
    component: any,
    spec: EditorDescription,
    editor_actions: Actions
  ) {
    const type = desc.get("type");
    const project_id = desc.get("project_id", this.props.project_id);
    let name = this.props.name;
    let actions = this.props.actions;

    let path: string = desc.get("path", this.props.path);
    if (spec.path != null) {
      path = spec.path(path);
    }

    // UGLY/TODO: This approach to TimeTravel as a frame is not sufficiently
    // generic and is a **temporary** hack.  It'll be rewritten
    // soon in a more generic way that also will support multifile
    // latex editing. See https://github.com/sagemathinc/cocalc/issues/904
    // Note that this does NOT reference count the actions properly
    // right now... We need to switch to something like we do with
    // CodeEditorManager.
    let is_subframe: boolean = false;
    if (spec.name === "TimeTravel" && !(actions instanceof TimeTravelActions)) {
      if (path.slice(path.length - 12) != ".time-travel") {
        path = hidden_meta_file(path, "time-travel");
        const editor = get_file_editor("time-travel", false);
        if (editor == null) throw Error("bug -- editor must exist");
        name = editor.init(path, redux, project_id);
        const actions2: TimeTravelActions = redux.getActions(name);
        actions2.ambient_actions = actions;
        // [j3] Assuming this is part of the hackiness above
        // Or just that Actions in the frame tree are confusing
        actions = actions2 as Actions;
        is_subframe = true;
        // this is particularly hacky for now:
        // ensures time travel params are set.
        // setTimeout is needed since this can change redux store,
        // and we are in a render function.
        setTimeout(() => actions2.init_frame_tree(), 50);
      }
    } else if (type == "cm" && path != this.props.path) {
      // A code editor inside some other editor frame tree
      is_subframe = true;
    }

    return (
      <FrameTreeLeaf
        name={name}
        path={path}
        project_id={this.props.project_id}
        is_public={this.props.is_public}
        font_size={this.props.font_size}
        editor_state={this.props.editor_state}
        active_id={this.props.active_id}
        editor_settings={this.props.editor_settings}
        terminal={this.props.terminal}
        settings={this.props.settings}
        status={this.props.status}
        derived_file_types={this.props.derived_file_types}
        available_features={this.props.available_features}
        actions={actions}
        component={component}
        desc={desc}
        spec={spec}
        editor_actions={editor_actions}
        is_fullscreen={
          this.props.is_only || desc.get("id") === this.props.full_id
        }
        reload={this.props.reload.get(type)}
        resize={this.props.resize}
        is_subframe={is_subframe}
      />
    );
  }

  async reset_frame_tree(): Promise<void> {
    await delay(100);
    if (this.props.actions) {
      this.props.actions.reset_frame_tree();
    }
  }

  render_one(desc: NodeDesc): Rendered {
    const type = desc.get("type");
    if (type === "node") {
      return this.render_frame_tree(desc);
    }
    // NOTE: get_editor_actions may mutate props.editor_spec
    // if necessary for subframe, etc. So we call it first!
    let editor_actions: Actions, spec: EditorDescription, component: any;
    try {
      editor_actions = this.get_editor_actions(desc);
      spec = this.props.editor_spec[type];
      component = spec != null ? spec.component : undefined;
      if (component == null) throw Error(`unknown type '${type}'`);
    } catch (err) {
      const mesg = `Invalid frame tree ${JSON.stringify(desc)} -- ${err}`;
      console.log(mesg);
      // reset -- fix this disaster next time around.
      this.reset_frame_tree();
      return <div>{mesg}</div>;
    }
    return (
      <div
        className={"smc-vfill"}
        onClick={() => this.props.actions.set_active_id(desc.get("id"), true)}
        onTouchStart={() => this.props.actions.set_active_id(desc.get("id"))}
        style={spec != null ? spec.style : undefined}
      >
        {this.render_titlebar(desc, spec, editor_actions)}
        {this.render_leaf(desc, component, spec, editor_actions)}
      </div>
    );
  }

  render_first() {
    const desc = this.props.frame_tree.get("first");
    return <div className={"smc-vfill"}>{this.render_one(desc)}</div>;
  }

  render_cols_drag_bar() {
    const reset = () => {
      if (this.refs.cols_drag_bar != null) {
        (this.refs.cols_drag_bar as any).state.x = 0;
        return $(ReactDOM.findDOMNode(this.refs.cols_drag_bar)).css(
          "transform",
          ""
        );
      }
    };

    const handle_stop = async (_, ui) => {
      misc_page.drag_stop_iframe_enable();
      const clientX = ui.node.offsetLeft + ui.x + drag_offset;
      const elt = ReactDOM.findDOMNode(this.refs.cols_container);
      const pos = (clientX - elt.offsetLeft) / elt.offsetWidth;
      reset();
      const id = this.props.frame_tree.get("id");
      this.props.actions.set_frame_tree({
        id,
        pos,
      });
      this.props.actions.set_resize();
      this.props.actions.focus(); // see https://github.com/sagemathinc/cocalc/issues/3269
    };

    return (
      <Draggable
        ref={"cols_drag_bar"}
        axis={"x"}
        onStop={handle_stop}
        onStart={misc_page.drag_start_iframe_disable}
      >
        <div
          style={
            this.state.drag_hover ? cols_drag_bar_drag_hover : cols_drag_bar
          }
          onMouseEnter={() => this.setState({ drag_hover: true })}
          onMouseLeave={() => this.setState({ drag_hover: false })}
        />
      </Draggable>
    );
  }

  get_pos() {
    let left;
    let pos =
      (left = parseFloat(this.props.frame_tree.get("pos"))) != null
        ? left
        : 0.5;
    if (isNaN(pos)) {
      pos = 0.5;
    }
    return pos;
  }

  get_data(flex_direction) {
    const pos = this.get_pos();
    const data = {
      pos,
      first: this.props.frame_tree.get("first"),
      style_first: { display: "flex", flex: pos },
      second: this.props.frame_tree.get("second"),
      style_second: { display: "flex", flex: 1 - pos },
      outer_style: undefined as any,
    };

    if (flex_direction === "row") {
      // overflow:'hidden' is NOT needed on chrome, but *is* needed on Firefox.
      data.outer_style = {
        display: "flex",
        flexDirection: "row",
        flex: 1,
        overflow: "hidden",
      };
    }
    return data;
  }

  render_cols() {
    const data = this.get_data("row");
    return (
      <div ref={"cols_container"} style={data.outer_style}>
        <div className={"smc-vfill"} style={data.style_first}>
          {this.render_one(data.first)}
        </div>
        {this.render_cols_drag_bar()}
        <div className={"smc-vfill"} style={data.style_second}>
          {this.render_one(data.second)}
        </div>
      </div>
    );
  }

  safari_hack() {
    if (!is_safari()) {
      return;
    }
    // Workaround a major and annoying bug in Safari:
    //     https://github.com/philipwalton/flexbugs/issues/132
    return $(ReactDOM.findDOMNode(this))
      .find(".cocalc-editor-div")
      .make_height_defined();
  }

  render_rows_drag_bar() {
    const reset = () => {
      if (this.refs.rows_drag_bar != null) {
        (this.refs.rows_drag_bar as any).state.y = 0;
        return $(ReactDOM.findDOMNode(this.refs.rows_drag_bar)).css(
          "transform",
          ""
        );
      }
    };

    const handle_stop = (_, ui) => {
      misc_page.drag_stop_iframe_enable();
      const clientY = ui.node.offsetTop + ui.y + drag_offset;
      const elt = ReactDOM.findDOMNode(this.refs.rows_container);
      const pos = (clientY - elt.offsetTop) / elt.offsetHeight;
      reset();
      this.props.actions.set_frame_tree({
        id: this.props.frame_tree.get("id"),
        pos,
      });
      this.props.actions.set_resize();
      this.props.actions.focus();
      this.safari_hack();
    };

    return (
      <Draggable
        ref={"rows_drag_bar"}
        axis={"y"}
        onStop={handle_stop}
        onStart={misc_page.drag_start_iframe_disable}
      >
        <div
          style={
            this.state.drag_hover ? rows_drag_bar_drag_hover : rows_drag_bar
          }
          onMouseEnter={() => this.setState({ drag_hover: true })}
          onMouseLeave={() => this.setState({ drag_hover: false })}
        />
      </Draggable>
    );
  }

  render_rows() {
    const data = this.get_data("column");
    return (
      <div
        className={"smc-vfill"}
        ref={"rows_container"}
        style={data.outer_style}
      >
        <div className={"smc-vfill"} style={data.style_first}>
          {this.render_one(data.first)}
        </div>
        {this.render_rows_drag_bar()}
        <div className={"smc-vfill"} style={data.style_second}>
          {this.render_one(data.second)}
        </div>
      </div>
    );
  }

  render() {
    if (this.props.value == null) {
      return <Loading />;
    }
    if (this.props.reload === undefined) {
      return <span>no props.reload</span>;
    }
    if (this.props.full_id) {
      // A single frame is full-tab'd:
      const node = tree_ops.get_node(this.props.frame_tree, this.props.full_id);
      if (node != null) {
        // only render it if it actually exists, of course.
        return this.render_one(node);
      }
    }

    if (this.props.frame_tree.get("type") !== "node") {
      return this.render_one(this.props.frame_tree);
    } else if (this.props.frame_tree.get("direction") === "col") {
      return this.render_cols();
    } else {
      return this.render_rows();
    }
  }
}
