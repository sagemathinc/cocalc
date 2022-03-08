/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  React,
  CSS,
  Rendered,
  project_redux_name,
  useRedux,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  ErrorDisplay,
  Loading,
  LoadingEstimate,
} from "@cocalc/frontend/components";
import { FormatBar } from "./format-bar";
import StatusBar from "./status-bar";
import { FrameTree } from "./frame-tree";
import { EditorSpec, ErrorStyles } from "./types";
import { is_different, filename_extension } from "@cocalc/util/misc";
import { SetMap } from "./types";
import { AvailableFeatures } from "../../project_configuration";
import { Map, Set } from "immutable";
import { clone } from "lodash";

interface FrameTreeEditorProps {
  name: string;
  actions: any;
  path: string;
  project_id: string;
  format_bar: boolean;
  format_bar_exclude?: SetMap;
  editor_spec: any;
  tab_is_visible: boolean; // if the editor tab is active -- page/page.tsx
}

const LOADING_STYLE: CSS = {
  fontSize: "40px",
  textAlign: "center",
  padding: "15px",
  color: "#999",
} as const;

function shouldMemoize(prev, next): boolean {
  return !is_different(prev, next, [
    // do NOT include editor_spec below -- it is assumed to never change
    "tab_is_visible",
  ]);
}

const FrameTreeEditor: React.FC<FrameTreeEditorProps> = React.memo(
  (props: FrameTreeEditorProps) => {
    const {
      name,
      actions,
      path,
      project_id,
      format_bar,
      format_bar_exclude,
      tab_is_visible,
    } = props;

    // Copy the editor spec we will use for all future rendering
    // into our private state variable
    // TODO unclear: earlier, there was also the comment:
    //      , and also do some function evaluation (e.g,. if buttons is a function of the path).
    // shallow copy via lodash of props.editor_spec
    const editor_spec = clone(props.editor_spec);

    const project_store_name = project_redux_name(project_id);
    const available_features: AvailableFeatures = useRedux(
      project_store_name,
      "available_features"
    );

    const editor_settings = useTypedRedux("account", "editor_settings");
    const terminal = useTypedRedux("account", "terminal");

    const is_public: boolean = useRedux(name, "is_public");
    const has_unsaved_changes: boolean = useRedux(name, "has_unsaved_changes");
    const has_uncommitted_changes: boolean = useRedux(
      name,
      "has_uncommitted_changes"
    );
    const read_only: boolean = useRedux(name, "read_only");
    const is_loaded: boolean = useRedux(name, "is_loaded");
    const local_view_state: Map<string, any> = useRedux(
      name,
      "local_view_state"
    );
    const error: string = useRedux(name, "error");
    const errorstyle: ErrorStyles = useRedux(name, "errorstyle");
    const cursors: Map<string, any> = useRedux(name, "cursors");
    const status: string = useRedux(name, "status");
    const load_time_estimate: LoadingEstimate | undefined = useRedux(
      name,
      "load_time_estimate"
    );
    const value: string | undefined = useRedux(name, "value");
    const reload: Map<string, number> = useRedux(name, "reload");
    // if changes, means that frames have been resized, so may need refreshing; passed to leaf
    const resize: number = useRedux(name, "resize");
    const misspelled_words: Set<string> = useRedux(name, "misspelled_words");
    const is_saving: boolean = useRedux(name, "is_saving");
    const settings: Map<string, any> = useRedux(name, "settings");
    const complete: Map<string, any> = useRedux(name, "complete");
    const derived_file_types: Set<string> = useRedux(
      name,
      "derived_file_types"
    );
    const visible: boolean | undefined = useRedux(name, "visible");

    function render_format_bar(): Rendered {
      if (
        format_bar &&
        !is_public &&
        editor_settings &&
        editor_settings.get("extra_button_bar")
      )
        return (
          <FormatBar
            actions={actions}
            extension={filename_extension(path)}
            exclude={format_bar_exclude}
          />
        );
    }

    function render_frame_tree(): Rendered {
      if (!is_loaded) return;
      const local = local_view_state;
      const frame_tree = local.get("frame_tree");
      const editor_state = local.get("editor_state");
      return (
        <div className={"smc-vfill"}>
          <FrameTree
            editor_spec={editor_spec}
            name={name}
            actions={actions}
            frame_tree={frame_tree}
            editor_state={editor_state}
            project_id={project_id}
            path={path}
            active_id={local.get("active_id")}
            full_id={local.get("full_id")}
            font_size={local.get("font_size")}
            is_only={frame_tree.get("type") !== "node"}
            cursors={cursors}
            read_only={read_only}
            is_public={is_public}
            value={value}
            reload={reload}
            resize={resize}
            misspelled_words={misspelled_words}
            has_unsaved_changes={has_unsaved_changes}
            has_uncommitted_changes={has_uncommitted_changes}
            is_saving={is_saving}
            editor_settings={editor_settings}
            terminal={terminal}
            settings={settings}
            status={status}
            complete={complete}
            derived_file_types={derived_file_types}
            available_features={available_features}
            local_view_state={local_view_state}
            is_visible={visible ?? true}
            tab_is_visible={tab_is_visible}
          />
        </div>
      );
    }

    function render_error(): Rendered {
      if (!error) return;
      const style: CSS = {};
      if (errorstyle === "monospace") {
        style.fontFamily = "monospace";
        style.whiteSpace = "pre-wrap";
      }
      return (
        <ErrorDisplay
          banner={true}
          error={error}
          onClose={() => actions.set_error("")}
          style={style}
        />
      );
    }

    function render_status_bar(): Rendered {
      if (!is_loaded) return;
      if (!status) return;
      return (
        <StatusBar status={status} onClear={() => actions.set_status("")} />
      );
    }

    function render_loading(): Rendered {
      if (is_loaded) return;
      return (
        <div className="smc-vfill" style={LOADING_STYLE}>
          <Loading estimate={load_time_estimate} />
        </div>
      );
    }

    return (
      <div className="smc-vfill cc-frame-tree-editor">
        {render_error()}
        {render_format_bar()}
        {render_loading()}
        {render_frame_tree()}
        {render_status_bar()}
      </div>
    );
  },
  shouldMemoize
);

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
  is_visible: boolean;
}

// this returns a function that creates a FrameTreeEditor for given Options.
// memoization happens in FrameTreeEditor
export function createEditor(opts: Options): React.FC<EditorProps> {
  const Editor = (props: EditorProps) => {
    const { actions, name, path, project_id, is_visible } = props;
    return (
      <FrameTreeEditor
        actions={actions}
        name={name}
        path={path}
        project_id={project_id}
        format_bar={opts.format_bar}
        format_bar_exclude={opts.format_bar_exclude}
        editor_spec={opts.editor_spec}
        tab_is_visible={is_visible}
      />
    );
  };
  Editor.displayName = opts.display_name;
  return Editor;
}
