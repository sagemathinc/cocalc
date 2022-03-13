/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
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

import { copy, hidden_meta_file, is_different } from "@cocalc/util/misc";
import { delay } from "awaiting";
import { Map, Set } from "immutable";
import React from "react";
import {
  ReactDOM,
  redux,
  Rendered,
  useState,
  useEffect,
} from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import { AvailableFeatures } from "@cocalc/frontend/project_configuration";
import { Actions } from "../code-editor/actions";
import { cm as cm_spec } from "../code-editor/editor";
import { is_safari } from "../generic/browser";
import { TimeTravelActions } from "../time-travel-editor/actions";
import { FrameContext } from "./frame-context";
import { FrameTreeDragBar } from "./frame-tree-drag-bar";
import { FrameTreeLeaf } from "./leaf";
import { get_file_editor } from "./register";
import { FrameTitleBar } from "./title-bar";
import * as tree_ops from "./tree-ops";
import { EditorDescription, EditorSpec, EditorState, NodeDesc } from "./types";
import { AccountState } from "@cocalc/frontend/account/types";

interface FrameTreeProps {
  actions: Actions;
  active_id: string;
  available_features: AvailableFeatures;
  complete: Map<string, any>;
  cursors: Map<string, any>;
  derived_file_types: Set<string>;
  editor_settings?: AccountState["editor_settings"];
  editor_spec: EditorSpec;
  editor_state: EditorState; // IMPORTANT: change does NOT cause re-render (uncontrolled); only used for full initial render, on purpose, i.e., setting scroll positions.
  font_size: number;
  frame_tree: Map<string, any>;
  full_id: string;
  has_uncommitted_changes: boolean;
  has_unsaved_changes: boolean;
  is_only: boolean;
  is_public: boolean;
  is_saving: boolean;
  is_visible: boolean;
  local_view_state: Map<string, any>;
  misspelled_words: Set<string>;
  name: string; // just so editors (leaf nodes) can plug into reduxProps if they need to.
  path: string; // assumed to never change -- all frames in same project
  project_id: string; // assumed to never change -- all frames in same project
  read_only: boolean; // if true, then whole document considered read only (individual frames can still be via desc)
  reload: Map<string, number>;
  resize: number; // if changes, means that frames have been resized, so may need refreshing; passed to leaf.
  settings: Map<string, any>;
  status: string;
  tab_is_visible: boolean;
  terminal?: Map<string, any>; // terminal settings from account
  value?: string;
}

function shouldMemoize(prev, next) {
  return !is_different(prev, next, [
    "active_id",
    "available_features",
    "complete",
    "cursors",
    "derived_file_types",
    "editor_settings",
    "frame_tree",
    "full_id",
    "has_uncommitted_changes",
    "has_unsaved_changes",
    "is_only",
    "is_public",
    "is_saving",
    "is_visible",
    "local_view_state",
    "misspelled_words",
    "path",
    "project_id",
    "reload",
    "resize",
    "settings",
    "status",
    "tab_is_visible",
    "terminal",
    "value",
  ]);
}
export const FrameTree: React.FC<FrameTreeProps> = React.memo(
  (props: FrameTreeProps) => {
    const {
      actions,
      active_id,
      available_features,
      complete,
      cursors,
      derived_file_types,
      editor_settings,
      editor_spec,
      editor_state,
      font_size,
      frame_tree,
      full_id,
      has_uncommitted_changes,
      has_unsaved_changes,
      is_only,
      is_public,
      is_saving,
      is_visible,
      local_view_state,
      misspelled_words,
      name,
      path,
      project_id,
      read_only,
      reload,
      resize,
      settings,
      status,
      tab_is_visible,
      terminal,
      value,
    } = props;

    const elementRef = React.useRef<HTMLDivElement>(null);
    const cols_container_ref = React.useRef<HTMLDivElement>(null);
    const rows_container_ref = React.useRef<HTMLDivElement>(null);

    const [forceReload, setForceReload] = useState<number>(0);

    useEffect(() => {
      return () => {
        if (typeof (actions as any).blur === "function") {
          (actions as any).blur();
        }
      };
    }, []);

    function render_frame_tree(desc) {
      return (
        <FrameTree
          actions={actions}
          active_id={active_id}
          available_features={available_features}
          complete={complete}
          cursors={cursors}
          derived_file_types={derived_file_types}
          editor_settings={editor_settings}
          editor_spec={editor_spec}
          editor_state={editor_state}
          font_size={font_size}
          frame_tree={desc}
          full_id={full_id}
          has_uncommitted_changes={has_uncommitted_changes}
          has_unsaved_changes={has_unsaved_changes}
          is_only={false}
          is_public={is_public}
          is_saving={is_saving}
          is_visible={is_visible}
          local_view_state={local_view_state}
          misspelled_words={misspelled_words}
          name={name}
          path={path}
          project_id={project_id}
          read_only={read_only}
          reload={reload}
          resize={resize}
          settings={settings}
          status={status}
          tab_is_visible={tab_is_visible}
          terminal={terminal}
          value={value}
        />
      );
    }

    async function init_code_editor(id: string, path: string): Promise<void> {
      // This async function starts the manager initializing
      await actions.init_code_editor(id, path);
      // OK, now it's initialized, so we need to cause a refresh...
      setForceReload(forceReload + 1);
    }

    function get_editor_actions(desc: NodeDesc): Actions | undefined {
      if (desc.get("type") == "cm" && editor_spec["cm"] == null) {
        // make it so the spec includes info about cm editor.
        editor_spec.cm = copy(cm_spec);
      }

      if (desc.get("type") == "cm" && desc.get("path", path) != path) {
        const manager = actions.get_code_editor(desc.get("id"));
        if (manager == null) {
          // This async function starts the manager initializing
          init_code_editor(desc.get("id"), desc.get("path", path));

          return undefined;
        }
        return manager?.get_actions();
      } else {
        return actions;
      }
    }

    function render_titlebar(
      desc: NodeDesc,
      spec: EditorDescription,
      editor_actions: Actions
    ): Rendered {
      const id = desc.get("id");
      return (
        <FrameTitleBar
          actions={actions}
          active_id={active_id}
          available_features={available_features}
          connection_status={desc.get("connection_status")}
          editor_actions={editor_actions}
          editor_spec={editor_spec}
          font_size={desc.get("font_size")}
          id={id}
          is_full={desc.get("id") === full_id && !is_only}
          is_only={is_only}
          is_paused={desc.get("is_paused")}
          path={desc.get("path", path)}
          project_id={desc.get("project_id", project_id)}
          spec={spec}
          status={status}
          title={desc.get("title")}
          type={desc.get("type")}
        />
      );
    }

    function render_leaf(
      desc: NodeDesc,
      component: any,
      spec: EditorDescription,
      editor_actions: Actions
    ) {
      const type = desc.get("type");
      const project_id_leaf = desc.get("project_id", project_id);

      let path_leaf: string = desc.get("path", path);
      if (spec.path != null) {
        path_leaf = spec.path(path_leaf);
      }

      // UGLY/TODO: This approach to TimeTravel as a frame is not sufficiently
      // generic and is a **temporary** hack.  It'll be rewritten
      // soon in a more generic way that also will support multifile
      // latex editing. See https://github.com/sagemathinc/cocalc/issues/904
      // Note that this does NOT reference count the actions properly
      // right now... We need to switch to something like we do with
      // CodeEditorManager.
      let is_subframe: boolean = false;
      let name_leaf = name;
      let actions_leaf = actions;
      if (
        spec.name === "TimeTravel" &&
        !(actions instanceof TimeTravelActions)
      ) {
        if (path_leaf.slice(path_leaf.length - 12) != ".time-travel") {
          path_leaf = hidden_meta_file(path_leaf, "time-travel");
          const editor = get_file_editor("time-travel", false);
          if (editor == null) throw Error("bug -- editor must exist");
          name_leaf = editor.init(path_leaf, redux, project_id_leaf);
          const actions2: TimeTravelActions = redux.getActions(name_leaf);
          actions2.ambient_actions = actions;
          // [j3] Assuming this is part of the hackiness above
          // Or just that Actions in the frame tree are confusing
          actions_leaf = actions2 as Actions;
          is_subframe = true;
          // this is particularly hacky for now:
          // ensures time travel params are set.
          // setTimeout is needed since this can change redux store,
          // and we are in a render function.
          setTimeout(() => actions2.init_frame_tree(), 50);
        }
      } else if (type == "cm" && path != path_leaf) {
        // A code editor inside some other editor frame tree
        is_subframe = true;
      }

      return (
        <FrameTreeLeaf
          actions={actions_leaf}
          active_id={active_id}
          available_features={available_features}
          component={component}
          derived_file_types={derived_file_types}
          desc={desc}
          editor_actions={editor_actions}
          editor_settings={editor_settings}
          editor_state={editor_state}
          font_size={font_size}
          is_fullscreen={is_only || desc.get("id") === full_id}
          is_public={is_public}
          is_subframe={is_subframe}
          is_visible={is_visible}
          local_view_state={local_view_state}
          name={name_leaf}
          path={path_leaf}
          project_id={project_id_leaf}
          reload={reload.get(type)}
          resize={resize}
          settings={settings}
          spec={spec}
          status={status}
          tab_is_visible={tab_is_visible}
          terminal={terminal}
          placeholder={spec.placeholder}
        />
      );
    }

    async function reset_frame_tree(): Promise<void> {
      await delay(100);
      if (actions) {
        actions.reset_frame_tree();
      }
    }

    function render_one(desc: NodeDesc): Rendered {
      const type = desc.get("type");
      if (type === "node") {
        return render_frame_tree(desc);
      }
      // NOTE: get_editor_actions may mutate props.editor_spec
      // if necessary for subframe, etc. So we call it first!
      let editor_actions: Actions | undefined,
        spec: EditorDescription,
        component: any;
      try {
        editor_actions = get_editor_actions(desc);
        if (editor_actions == null) {
          return <Loading />;
        }
        spec = editor_spec[type];
        component = spec != null ? spec.component : undefined;
        if (component == null) throw Error(`unknown type '${type}'`);
      } catch (err) {
        const mesg = `Invalid frame tree ${JSON.stringify(desc)} -- ${err}`;
        console.log(mesg);
        // reset -- fix this disaster next time around.
        reset_frame_tree();
        return <div>{mesg}</div>;
      }
      return (
        <FrameContext.Provider
          value={{
            id: desc.get("id"),
            project_id: project_id,
            path: path,
            actions: editor_actions,
            desc,
            isFocused: active_id == desc.get("id"),
          }}
        >
          <div
            className={"smc-vfill"}
            onClick={() => actions.set_active_id(desc.get("id"), true)}
            onTouchStart={() => actions.set_active_id(desc.get("id"))}
            style={spec != null ? spec.style : undefined}
          >
            {render_titlebar(desc, spec, editor_actions)}
            {render_leaf(desc, component, spec, editor_actions)}
          </div>
        </FrameContext.Provider>
      );
    }

    function get_pos() {
      let left;
      let pos = (left = parseFloat(frame_tree.get("pos"))) != null ? left : 0.5;
      if (isNaN(pos)) {
        pos = 0.5;
      }
      return pos;
    }

    function get_data(flex_direction) {
      const pos = get_pos();
      const data = {
        pos,
        first: frame_tree.get("first"),
        style_first: { display: "flex", flex: pos },
        second: frame_tree.get("second"),
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

    function render_cols() {
      const data = get_data("row");
      return (
        <div ref={cols_container_ref} style={data.outer_style}>
          <div className={"smc-vfill"} style={data.style_first}>
            {render_one(data.first)}
          </div>
          <FrameTreeDragBar
            actions={actions}
            containerRef={cols_container_ref}
            dir={"col"}
            frame_tree={frame_tree}
            safari_hack={safari_hack}
          />
          <div className={"smc-vfill"} style={data.style_second}>
            {render_one(data.second)}
          </div>
        </div>
      );
    }

    function safari_hack() {
      if (!is_safari()) {
        return;
      }
      // Workaround a major and annoying bug in Safari:
      //     https://github.com/philipwalton/flexbugs/issues/132
      return $(ReactDOM.findDOMNode(elementRef.current))
        .find(".cocalc-editor-div")
        .make_height_defined();
    }

    function render_rows() {
      const data = get_data("column");
      return (
        <div
          className={"smc-vfill"}
          ref={rows_container_ref}
          style={data.outer_style}
        >
          <div className={"smc-vfill"} style={data.style_first}>
            {render_one(data.first)}
          </div>
          <FrameTreeDragBar
            actions={actions}
            containerRef={rows_container_ref}
            dir={"row"}
            frame_tree={frame_tree}
            safari_hack={safari_hack}
          />
          <div className={"smc-vfill"} style={data.style_second}>
            {render_one(data.second)}
          </div>
        </div>
      );
    }

    if (value == null) {
      return <Loading />;
    }
    if (reload === undefined) {
      return <span>no props.reload</span>;
    }

    function render_root() {
      if (full_id) {
        // A single frame is full-tab'd:
        const node = tree_ops.get_node(frame_tree, full_id);
        if (node != null) {
          // only render it if it actually exists, of course.
          return render_one(node);
        }
      }

      if (frame_tree.get("type") !== "node") {
        return render_one(frame_tree);
      } else if (frame_tree.get("direction") === "col") {
        return render_cols();
      } else {
        return render_rows();
      }
    }

    // TODO we only need this additional div for that safari hack. one that's no longer an issue, remove it.
    return (
      <div className={"smc-vfill"} ref={elementRef}>
        {render_root()}
      </div>
    );
  },
  shouldMemoize
);
