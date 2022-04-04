/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map, Set } from "immutable";
import { Rendered, React, useRedux, CSS } from "@cocalc/frontend/app-framework";
import { ErrorDisplay, Loading } from "@cocalc/frontend/components";
import { AvailableFeatures } from "@cocalc/frontend/project_configuration";

import { Actions } from "../code-editor/actions";
import { EditorDescription, EditorState, NodeDesc } from "./types";
import { AccountState } from "@cocalc/frontend/account/types";

const ERROR_STYLE: CSS = {
  maxWidth: "100%",
  maxHeight: "30%",
  fontFamily: "monospace",
  fontSize: "85%",
  whiteSpace: "pre-wrap",
} as const;

interface Props {
  name: string;
  actions: Actions;
  active_id: string;
  available_features: AvailableFeatures;
  component: any; // ??
  derived_file_types: Set<string>;
  desc: NodeDesc;
  editor_actions: Actions;
  editor_settings?: AccountState["editor_settings"];
  editor_state: EditorState;
  font_size: number;
  is_fullscreen: boolean;
  is_public: boolean;
  is_subframe: boolean;
  local_view_state: Map<string, any>;
  path: string;
  project_id: string;
  reload?: number;
  resize: number;
  settings: Map<string, any>;
  spec: EditorDescription;
  status: string;
  terminal?: Map<string, any>;
  // is_visible: true if the entire frame tree is visible (i.e., the tab is shown);
  // knowing this can be critical for rendering certain types of editors, e.g.,
  // see https://github.com/sagemathinc/cocalc/issues/5133 where xterm.js would get
  // randomly rendered wrong if it was initialized when the div was in the DOM,
  // but hidden.
  is_visible: boolean;
  tab_is_visible: boolean; // if that editor tab is active -- see page/page.tsx
  placeholder?: string;
}

export const FrameTreeLeaf: React.FC<Props> = React.memo((props: Props) => {
  const {
    actions,
    active_id,
    available_features,
    derived_file_types,
    desc,
    editor_actions,
    editor_settings,
    editor_state,
    font_size,
    is_fullscreen,
    is_public,
    is_subframe,
    is_visible,
    local_view_state,
    path,
    project_id,
    reload,
    resize,
    settings,
    spec,
    status,
    tab_is_visible,
    terminal,
    placeholder,
  } = props;

  if (editor_actions == null) {
    throw Error("bug -- editor_actions must not be null");
  }

  if (editor_actions.name == null) {
    throw Error("bug -- editor_actions.name must not be null");
  }

  // for redux, not props.name!
  const { name } = editor_actions;

  // Must be CamelCase
  const TheComponent = props.component as any;

  const read_only: boolean | undefined = useRedux(name, "read_only");
  const cursors: Map<string, any> | undefined = useRedux(name, "cursors");

  const value: string | undefined = useRedux(name, "value");
  const misspelled_words: Set<string> | undefined = useRedux(
    name,
    "misspelled_words"
  );
  const complete: Map<string, any> | undefined = useRedux(name, "complete");
  const is_loaded: boolean | undefined = useRedux(name, "is_loaded");
  const error: string | undefined = useRedux(name, "error");
  const gutter_markers: Map<string, any> | undefined = useRedux(
    name,
    "gutter_markers"
  );

  function render_leaf(): Rendered {
    if (!is_loaded) return <Loading theme="medium" />;
    if (TheComponent == null) throw Error("component must not be null");
    return (
      <TheComponent
        id={desc.get("id")}
        name={props.name}
        actions={actions}
        editor_actions={editor_actions}
        mode={spec.mode}
        read_only={desc.get("read_only", read_only || is_public)}
        is_public={is_public}
        font_size={desc.get("font_size", font_size)}
        path={path}
        fullscreen_style={spec.fullscreen_style}
        project_id={project_id}
        editor_state={editor_state.get(desc.get("id"), Map())}
        is_current={desc.get("id") === active_id}
        cursors={cursors}
        value={value}
        misspelled_words={misspelled_words}
        is_fullscreen={is_fullscreen}
        reload={reload}
        resize={resize}
        reload_images={!!spec.reload_images}
        gutters={spec.gutters != null ? spec.gutters : []}
        gutter_markers={gutter_markers}
        editor_settings={editor_settings}
        terminal={terminal}
        settings={settings}
        status={status}
        renderer={spec.renderer}
        complete={complete && complete.get(desc.get("id"))}
        derived_file_types={derived_file_types}
        local_view_state={local_view_state}
        desc={desc}
        available_features={available_features}
        is_subframe={is_subframe}
        is_visible={is_visible}
        tab_is_visible={tab_is_visible}
        placeholder={placeholder}
      />
    );
  }

  function render_error(): Rendered {
    // This is used for showing the error message right with this frame,
    // since otherwise it wouldn't be visible at all.
    if (!is_subframe) return;
    if (!error || desc.get("id") !== active_id) {
      // either no error or not the currently selected frame (otherwise,
      // it's cluttery and there could be a bunch of the same frame all
      // showing the same error.)
      return;
    }
    return (
      <ErrorDisplay
        banner={true}
        error={error}
        onClose={() => editor_actions.set_error("")}
        body_style={ERROR_STYLE}
      />
    );
  }

  return (
    <div
      id={`frame-${desc.get("id")}`}
      className="smc-vfill"
      style={{ background: "white", zIndex: 1 }}
    >
      {render_error()}
      {render_leaf()}
    </div>
  );
});
