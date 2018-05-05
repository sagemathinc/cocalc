/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS104: Avoid inline assignments
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
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

let FrameTree;

import { is_safari } from "../generic/browser";

const immutable = require("immutable");

const Draggable = require("react-draggable");
const misc = require("smc-util/misc");
const misc_page = require("smc-webapp/misc_page");
const { React, ReactDOM, rclass, rtypes } = require("smc-webapp/smc-react");
const { CodemirrorEditor } = require("../code-editor/codemirror-editor"); // todo should just spec all editors.
const feature = require("smc-webapp/feature");
const { FrameTitleBar } = require("./title-bar");
const tree_ops = require("./tree-ops");

const drag_offset = feature.IS_TOUCH ? 5 : 2;

const cols_drag_bar = {
  padding: `${drag_offset}px`,
  background: "#efefef",
  zIndex: 20,
  cursor: "ew-resize"
};

const drag_hover = {
  background: "darkgrey",
  opacity: 0.8
};

const cols_drag_bar_drag_hover = misc.merge(
  misc.copy(cols_drag_bar),
  drag_hover
);

const rows_drag_bar = misc.merge(misc.copy(cols_drag_bar), {
  cursor: "ns-resize"
});

const rows_drag_bar_drag_hover = misc.merge(
  misc.copy(rows_drag_bar),
  drag_hover
);

let FrameTree$1 = (FrameTree = rclass(function({ name }) {
  return {
    displayName: "CodeEditor-FrameTree",

    // TODO: **yes, I'm half done moving some props from here to reduxProps below!**
    propTypes: {
      actions: rtypes.object.isRequired,
      path: rtypes.string, // assumed to never change -- all frames in same project
      project_id: rtypes.string, // assumed to never change -- all frames in same project
      active_id: rtypes.string,
      full_id: rtypes.string,
      frame_tree: rtypes.immutable.isRequired,
      editor_state: rtypes.immutable.isRequired, // IMPORTANT: change does NOT cause re-render (uncontrolled); only used for full initial render, on purpose, i.e., setting scroll positions.
      font_size: rtypes.number.isRequired,
      is_only: rtypes.bool,
      cursors: rtypes.immutable.Map,
      read_only: rtypes.bool, // if true, then whole document considered read only (individual frames can still be via desc)
      is_public: rtypes.bool,
      content: rtypes.string,
      value: rtypes.string,
      editor_spec: rtypes.object
    }, // optional map from types to object that specify the different editors related to the master file (assumed to not change!)

    reduxProps: {
      [name]: {
        reload: rtypes.immutable.Map,
        resize: rtypes.number, // if changes, means that frames have been resized, so may need refreshing; passed to leaf.
        misspelled_words: rtypes.immutable.Set,
        has_unsaved_changes: rtypes.bool,
        has_uncommitted_changes: rtypes.bool,
        is_saving: rtypes.bool
      }
    },

    getInitialState() {
      return { drag_hover: false };
    },

    shouldComponentUpdate(next, state) {
      return (
        this.state.drag_hover !== state.drag_hover ||
        misc.is_different(this.props, next, [
          "frame_tree",
          "active_id",
          "full_id",
          "is_only",
          "cursors",
          "has_unsaved_changes",
          "has_uncommitted_changes",
          "is_public",
          "content",
          "value",
          "project_id",
          "path",
          "misspelled_words",
          "reload",
          "resize",
          "is_saving"
        ])
      );
    },

    render_frame_tree(desc) {
      return (
        <FrameTree
          name={this.props.name}
          actions={this.props.actions}
          frame_tree={desc}
          editor_state={this.props.editor_state}
          active_id={this.props.active_id}
          project_id={this.props.project_id}
          path={this.props.path}
          font_size={this.props.font_size}
          is_only={false}
          cursors={this.props.cursors}
          read_only={this.props.read_only}
          is_public={this.props.is_public}
          content={this.props.content}
          value={this.props.value}
          editor_spec={this.props.editor_spec}
        />
      );
    },

    render_titlebar(desc) {
      let left, left1, left2;
      return (
        <FrameTitleBar
          actions={this.props.actions}
          active_id={this.props.active_id}
          project_id={
            (left = desc.get("project_id")) != null
              ? left
              : this.props.project_id
          }
          path={(left1 = desc.get("path")) != null ? left1 : this.props.path}
          is_full={desc.get("id") === this.props.full_id && !this.props.is_only}
          is_only={this.props.is_only}
          id={desc.get("id")}
          deletable={(left2 = desc.get("deletable")) != null ? left2 : true}
          read_only={desc.get("read_only") || this.props.read_only}
          has_unsaved_changes={this.props.has_unsaved_changes}
          has_uncommitted_changes={this.props.has_uncommitted_changes}
          is_saving={this.props.is_saving}
          is_public={this.props.is_public}
          type={desc.get("type")}
          editor_spec={this.props.editor_spec}
        />
      );
    },

    render_leaf(type, desc, Leaf, spec) {
      let fullscreen_style, left, left1, left2, left3, left4;
      let path = (left = desc.get("path")) != null ? left : this.props.path;
      if (spec == null) {
        spec = {};
      }
      if (spec.path != null) {
        path = spec.path(path);
      }
      if (spec.fullscreen_style != null) {
        // this is set via jquery's .css...
        ({ fullscreen_style } = spec);
      } else {
        fullscreen_style = undefined;
      }

      return (
        <Leaf
          name={this.props.name}
          actions={this.props.actions}
          id={desc.get("id")}
          read_only={
            !!(
              desc.get("read_only") ||
              this.props.read_only ||
              this.props.is_public
            )
          }
          is_public={!!this.props.is_public}
          font_size={
            (left1 =
              (left2 = desc.get("font_size")) != null
                ? left2
                : this.props.font_size) != null
              ? left1
              : 12
          }
          path={path}
          fullscreen_style={fullscreen_style}
          project_id={
            (left3 = desc.get("project_id")) != null
              ? left3
              : this.props.project_id
          }
          editor_state={
            (left4 = this.props.editor_state.get(desc.get("id"))) != null
              ? left4
              : immutable.Map()
          }
          is_current={desc.get("id") === this.props.active_id}
          cursors={this.props.cursors}
          content={this.props.content}
          value={this.props.value}
          misspelled_words={this.props.misspelled_words}
          is_fullscreen={
            this.props.is_only || desc.get("id") === this.props.full_id
          }
          reload={
            this.props.reload != null ? this.props.reload.get(type) : undefined
          }
          resize={this.props.resize}
          reload_images={!!spec.reload_images}
          gutters={spec.gutters != null ? spec.gutters : []}
          renderer={spec.renderer}
        />
      );
    },

    render_one(desc) {
      let child;
      const type = desc != null ? desc.get("type") : undefined;
      if (type === "node") {
        return this.render_frame_tree(desc);
      }
      const spec =
        this.props.editor_spec != null
          ? this.props.editor_spec[type]
          : undefined;
      const C = spec != null ? spec.component : undefined;
      if (C != null) {
        child = this.render_leaf(type, desc, C, spec);
      } else if (type === "cm") {
        // minimal support -- TODO: instead should just fully spec all editors!
        child = this.render_leaf(type, desc, CodemirrorEditor);
      } else {
        // fix this disaster next time around.
        setTimeout(
          () =>
            this.props.actions != null
              ? this.props.actions.reset_frame_tree()
              : undefined,
          1
        );
        return <div>Invalid frame tree {misc.to_json(desc)}</div>;
      }
      return (
        <div
          className={"smc-vfill"}
          onClick={() => this.props.actions.set_active_id(desc.get("id"), 10)}
          onTouchStart={() =>
            this.props.actions.set_active_id(desc.get("id"), 10)
          }
          style={spec != null ? spec.style : undefined}
        >
          {this.render_titlebar(desc)}
          {child}
        </div>
      );
    },

    render_first() {
      const desc = this.props.frame_tree.get("first");
      return <div className={"smc-vfill"}>{this.render_one(desc)}</div>;
    },

    render_cols_drag_bar() {
      const reset = () => {
        if (this.refs.cols_drag_bar != null) {
          this.refs.cols_drag_bar.state.x = 0;
          return $(ReactDOM.findDOMNode(this.refs.cols_drag_bar)).css(
            "transform",
            ""
          );
        }
      };

      const handle_stop = (_, ui) => {
        misc_page.drag_stop_iframe_enable();
        const clientX = ui.node.offsetLeft + ui.x + drag_offset;
        const elt = ReactDOM.findDOMNode(this.refs.cols_container);
        const pos = (clientX - elt.offsetLeft) / elt.offsetWidth;
        reset();
        this.props.actions.set_frame_tree({
          id: this.props.frame_tree.get("id"),
          pos
        });
        return this.props.actions.set_resize();
      };

      // the preventDefault below prevents the text and scroll of what is in the frame from getting messed up during the drag.
      return (
        <Draggable
          ref={"cols_drag_bar"}
          axis={"x"}
          onStop={handle_stop}
          onMouseDown={e => e.preventDefault()}
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
    },

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
    },

    get_data(flex_direction) {
      const pos = this.get_pos();
      const data = {
        pos,
        first: this.props.frame_tree.get("first"),
        style_first: { display: "flex", flex: pos },
        second: this.props.frame_tree.get("second"),
        style_second: { display: "flex", flex: 1 - pos },
        outer_style: undefined as any
      };

      if (flex_direction === "row") {
        // overflow:'hidden' is NOT needed on chrome, but *is* needed on Firefox.
        data.outer_style = {
          display: "flex",
          flexDirection: "row",
          flex: 1,
          overflow: "hidden"
        };
      }
      return data;
    },

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
    },

    safari_hack() {
      if (!is_safari()) {
        return;
      }
      // Workaround a major and annoying bug in Safari:
      //     https://github.com/philipwalton/flexbugs/issues/132
      return $(ReactDOM.findDOMNode(this))
        .find(".cocalc-editor-div")
        .make_height_defined();
    },

    render_rows_drag_bar() {
      const reset = () => {
        if (this.refs.rows_drag_bar != null) {
          this.refs.rows_drag_bar.state.y = 0;
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
          pos
        });
        this.props.actions.set_resize();
        return this.safari_hack();
      };

      return (
        <Draggable
          ref={"rows_drag_bar"}
          axis={"y"}
          onStop={handle_stop}
          onMouseDown={e => e.preventDefault()}
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
    },

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
    },

    render() {
      if (this.props.full_id) {
        // A single frame is full-tab'd:
        const node = tree_ops.get_node(
          this.props.frame_tree,
          this.props.full_id
        );
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
  };
}));

export { FrameTree$1 as FrameTree };
