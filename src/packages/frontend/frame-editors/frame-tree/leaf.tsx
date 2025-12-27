/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Map, Set } from "immutable";

import {
  CSS,
  React,
  Rendered,
  useRedux,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { ErrorDisplay, Loading } from "@cocalc/frontend/components";
import { AvailableFeatures } from "@cocalc/frontend/project_configuration";
import { AccountState } from "@cocalc/frontend/account/types";
import { BaseEditorActions as Actions } from "../base-editor/actions-base";
import {
  EditorComponentProps,
  EditorDescription,
  EditorState,
  NodeDesc,
} from "./types";
import DeletedFile from "@cocalc/frontend/project/deleted-file";

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
  editor_settings: AccountState["editor_settings"];
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
  // se https://github.com/sagemathinc/cocalc/issues/5133 where xterm.js would get
  // randomly rendered wrong if it was initialized when the div was in the DOM,
  // but hidden.
  is_visible: boolean;
  tab_is_visible: boolean; // if that editor tab is active -- see page/page.tsx
  placeholder?: string;
}

export const FrameTreeLeaf: React.FC<Props> = React.memo(
  (props: Readonly<Props>) => {
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

    const recentlyDeletedPaths: Map<string, number> | undefined = useTypedRedux(
      { project_id },
      "recentlyDeletedPaths",
    );

    const value: string | undefined = useRedux(name, "value");
    const misspelled_words: Set<string> | undefined = useRedux(
      name,
      "misspelled_words",
    );
    const complete: Map<string, any> | undefined = useRedux(name, "complete");
    const is_loaded: boolean | undefined = useRedux(name, "is_loaded");
    const error: string | undefined = useRedux(name, "error");
    const gutter_markers: Map<string, any> | undefined = useRedux(
      name,
      "gutter_markers",
    );

    if (recentlyDeletedPaths?.get(path)) {
      return (
        <DeletedFile
          project_id={project_id}
          path={path}
          time={recentlyDeletedPaths.get(path)!}
        />
      );
    }

    function render_leaf(): Rendered {
      if (!is_loaded) return <Loading theme="medium" />;
      if (TheComponent == null) throw Error("component must not be null");

      const componentProps: EditorComponentProps = {
        id: desc.get("id"),
        actions,
        available_features,
        complete: complete && complete.get(desc.get("id")),
        cursors,
        derived_file_types: derived_file_types,
        desc,
        editor_actions,
        editor_settings,
        editor_state: editor_state.get(desc.get("id"), Map()),
        font_size: desc.get("font_size", font_size),
        fullscreen_style: spec.fullscreen_style,
        gutter_markers,
        gutters: spec.gutters != null ? spec.gutters : [],
        is_current: desc.get("id") === active_id,
        is_fullscreen,
        is_public,
        is_subframe,
        is_visible,
        local_view_state,
        misspelled_words,
        mode: spec.mode,
        name: props.name,
        onFocus: () => actions.set_active_id(desc.get("id"), true),
        path,
        placeholder,
        project_id,
        read_only: desc.get("read_only", read_only || is_public),
        reload_images: !!spec.reload_images,
        reload,
        resize,
        settings,
        status,
        tab_is_visible,
        terminal,
        value,
      };

      return <TheComponent {...componentProps} />;
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
  },
);
