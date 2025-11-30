/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*

The code defines a React component called CodemirrorEditor that wraps a single
instance of the codemirror text editor. It also defines several functions for
initializing and updating the codemirror editor, using useEffect hooks to
trigger actions when certain props change. This manages the state of a single
codemirror editor instance mainly for use in a frame tree.
*/

import * as CodeMirror from "codemirror";
import { Map, Set } from "immutable";
import {
  CSS,
  React,
  Rendered,
  useEffect,
  useIsMountedRef,
  useRef,
  useState,
} from "@cocalc/frontend/app-framework";
import { initFold, saveFold } from "@cocalc/frontend/codemirror/util";
import { Cursors } from "@cocalc/frontend/jupyter/cursors";
import { debounce, isEqual, throttle } from "lodash";
import { cm_options } from "../codemirror/cm-options";
import { get_state, set_state } from "../codemirror/codemirror-state";
import { init_style_hacks } from "../codemirror/util";
import { Path } from "../frame-tree/path";
import { EditorState } from "../frame-tree/types";
import { Actions } from "./actions";
import { GutterMarkers } from "./codemirror-gutter-markers";
import { SAVE_DEBOUNCE_MS } from "./const";
import { get_linked_doc, has_doc, set_doc } from "./doc";
import { AccountState } from "../../account/types";
import { attachSyncListeners } from "./cm-adapter";

const STYLE: CSS = {
  width: "100%",
  overflow: "auto",
  // marginbottom: "1ex",
  // minheight: "2em",
  border: "0px",
  background: "#fff",
} as const;

export interface Props {
  id: string;
  actions: any;
  path: string;
  project_id: string;
  font_size: number;
  cursors?: Map<string, any>;
  editor_state: EditorState;
  read_only: boolean;
  is_current: boolean;
  is_public: boolean;
  value?: string; // if defined and is_public, use this static value and editor is read-only  (TODO: public was deprecated years ago)
  misspelled_words?: Set<string> | string; // **or** show these words as not spelled correctly
  resize: number;
  gutters?: string[];
  gutter_markers?: Map<string, any>;
  editor_settings: AccountState["editor_settings"];
  is_subframe?: boolean;
  placeholder?: string;
}

export const CodemirrorEditor: React.FC<Props> = React.memo((props: Props) => {
  const [has_cm, set_has_cm] = useState<boolean>(false);

  const cmRef = useRef<CodeMirror.Editor | undefined>(undefined);
  const propsRef = useRef<Props>(props);
  propsRef.current = props;
  const styleActiveLineRef = useRef<boolean>(false);
  const textareaRef = useRef<any>(null);
  const divRef = useRef<any>(null);
  const isMountedRef = useIsMountedRef();
  const detachSyncListenersRef = useRef<(() => void) | null>(null);

  function editor_actions(): Actions | undefined {
    if (props.is_subframe && props.actions != null) {
      // in this case props.actions is the frame tree actions, not the actions for the particular file.
      const actions = props.actions.get_code_editor(props.id)?.get_actions();
      if (actions == null) return;
      // The actions we just got are for the frame with given id.  It's possible
      // (e.g., see #5779) that the frame id has not changed, but the actions have
      // changed to be for a different file.  If this is the case, return null:
      if (actions.path != props.path) return;
      return actions;
    } else {
      // in this case props.actions is the actions for the particular file we're editing.
      return props.actions;
    }
  }

  useEffect(() => {
    cm_destroy();
    init_codemirror(props);
    return () => {
      // clean up because unmounting.
      if (cmRef.current != null && !props.is_public) {
        save_editor_state(cmRef.current);
        const actions = editor_actions();
        if (actions != null) {
          // We can't just use save_syncstring(), since if this is
          // the last editor, then editor_actions()._cm may already be empty.
          editor_actions()?.set_value(cmRef.current.getValue());
          editor_actions()?.syncstring_commit();
        }
        cm_destroy();
      }
    };
  }, [props.path]);

  useEffect(cm_update_font_size, [props.font_size]);

  useEffect(() => {
    if (cmRef.current != null) {
      cmRef.current.setOption("readOnly", props.read_only);
    }
  }, [props.read_only]);

  useEffect(() => {
    if (props.is_public && cmRef.current != null && props.value != null) {
      // we really know that this will be undefined.
      cmRef.current.setValueNoJump(props.value);
    }
  }, [props.value]);

  useEffect(cm_highlight_misspelled_words, [props.misspelled_words]);
  useEffect(cm_refresh, [props.resize]);
  useEffect(update_codemirror, [props.editor_settings]);

  function cm_refresh(): void {
    if (cmRef.current == null) return;
    cmRef.current.refresh();
  }

  function cm_highlight_misspelled_words(): void {
    const words = props.misspelled_words;
    if (cmRef.current == null || words == null) return;
    if (words == "browser") {
      // just ensure browser spellcheck is enabled
      cmRef.current.setOption("spellcheck", true);
      (cmRef.current as any).spellcheck_highlight([]);
      return;
    }
    if (words == "disabled") {
      // disabled
      cmRef.current.setOption("spellcheck", false);
      (cmRef.current as any).spellcheck_highlight([]);
      return;
    }
    if (typeof words == "string") {
      // not supported yet
      console.warn("unsupported words option", words);
      return;
    }
    cmRef.current.setOption("spellcheck", false);
    (cmRef.current as any).spellcheck_highlight(words.toJS());
  }

  const firstFontSizeUpdateRef = useRef<boolean>(true);
  function cm_update_font_size(): void {
    if (firstFontSizeUpdateRef.current) {
      // Do not update the first time, since that conflicts
      // with restoring the editor state.  See
      //   https://github.com/sagemathinc/cocalc/issues/5211
      firstFontSizeUpdateRef.current = false;
      return;
    }
    if (cmRef.current == null) return;
    // It's important to move the scroll position upon zooming -- otherwise the cursor line
    // move UP/DOWN after zoom, which is very annoying.
    const state = get_state(cmRef.current);
    // actual restore happens in next refresh cycle after render.
    if (state != null) set_state(cmRef.current, state);
  }

  function cm_undo(): void {
    editor_actions()?.undo(props.id);
  }

  function cm_redo(): void {
    editor_actions()?.redo(props.id);
  }

  function cm_destroy(): void {
    if (cmRef.current == null) {
      return;
    }
    detachSyncListenersRef.current?.();
    detachSyncListenersRef.current = null;
    // remove from DOM -- "Remove this from your tree to delete an editor instance."
    // NOTE: there is still potentially a reference to the cm in actions._cm[id];
    // that's how we can bring back this frame (with given id) very efficiently.
    $(cmRef.current.getWrapperElement()).remove();
    cmRef.current = undefined;
  }

  // Save the UI state of the CM (not the actual content) -- scroll position, selections, etc.
  function save_editor_state(cm): void {
    const state = get_state(cm);
    if (state != null) {
      props.actions.save_editor_state(props.id, state);
    }
  }

  // Save the underlying syncstring content.
  function save_syncstring(): void {
    editor_actions()?.syncstring_commit();
  }

  async function init_codemirror(props: Props): Promise<void> {
    const node: HTMLTextAreaElement = textareaRef.current;
    if (node == null) {
      return;
    }

    const options: any = cm_options(
      props.path,
      props.editor_settings,
      props.gutters,
      editor_actions(),
      props.actions,
      props.id,
    );
    if (options == null) throw Error("bug"); // make typescript happy.

    // we will explicitly enable and disable styleActiveLine depending focus
    styleActiveLineRef.current = options.styleActiveLine;
    options.styleActiveLine = false;

    if (props.is_public || props.read_only) {
      options.readOnly = true;
    }

    if (options.extraKeys == null) {
      options.extraKeys = {};
    }

    options.extraKeys["Tab"] = tab_key;
    options.extraKeys["Cmd-/"] = "toggleComment";
    options.extraKeys["Ctrl-/"] = "toggleComment";

    const cm: CodeMirror.Editor = (editor_actions() as any)._cm[props.id];
    if (cm != undefined) {
      // Reuse existing codemirror editor, rather
      // than creating a new one -- faster and preserves
      // state such as code folding.
      if (!cmRef.current) {
        cmRef.current = cm;
        if (!node.parentNode) {
          // this never happens, but is needed for typescript.
          return;
        }
        node.parentNode.insertBefore(cm.getWrapperElement(), node.nextSibling);
        update_codemirror(options);
      }
    } else {
      cmRef.current = CodeMirror.fromTextArea(node, options);
      // We explicitly re-add all the extraKeys due to weird precedence.
      cmRef.current.addKeyMap(options.extraKeys);
      init_new_codemirror();
    }

    if (props.editor_state != null) {
      set_state(cmRef.current, props.editor_state.toJS() as any);
    }

    if (!props.is_public) {
      cm_highlight_misspelled_words();
    }

    set_has_cm(true);

    if (props.is_current) {
      cmRef.current.focus();
    }
    cmRef.current.setOption("readOnly", props.read_only);
    cm_refresh();

    const foldKey = `${props.path}\\${props.id}`;
    const saveFoldState = () => {
      if (cmRef.current != null) {
        saveFold(cmRef.current, foldKey);
      }
    };
    cmRef.current.on("fold" as any, saveFoldState);
    cmRef.current.on("unfold" as any, saveFoldState);
    initFold(cmRef.current, foldKey);
  }

  function init_new_codemirror(): void {
    const cm = cmRef.current;
    if (cm == null) return;
    (cm as any)._actions = editor_actions();

    if (props.is_public) {
      if (props.value != null) {
        // should always be the case if public.
        cm.setValue(props.value);
      }
    } else {
      if (!has_doc(props.project_id, props.path)) {
        // save it to cache so can be used by other components/editors
        set_doc(props.project_id, props.path, cm);
      } else {
        // has it already, so use that.
        cm.swapDoc(get_linked_doc(props.project_id, props.path));
      }
    }

    const throttled_save_editor_state = throttle(save_editor_state, 150);
    cm.on("scroll", () => throttled_save_editor_state(cm));
    init_style_hacks(cm);

    editor_actions()?.set_cm(props.id, cm);

    if (props.is_public) {
      return;
    }

    // After this only stuff that we use for the non-public version!
    const save_syncstring_debounce = debounce(
      save_syncstring,
      SAVE_DEBOUNCE_MS,
      { leading: false, trailing: true },
    );

    cm.on("beforeChange", (_, changeObj) => {
      if (changeObj.origin == "paste") {
        // See https://github.com/sagemathinc/cocalc/issues/5110
        save_syncstring();
      }
    });

    detachSyncListenersRef.current = attachSyncListeners(cm, {
      onChangeDebounced: save_syncstring_debounce,
      onExitUndo: () => editor_actions()?.exit_undo_mode(),
    });

    cm.on("focus", () => {
      if (!isMountedRef.current) return;
      props.actions.set_active_id(props.id);
      if (styleActiveLineRef.current && cm) {
        // any because the typing doesn't recognize extensions
        cm.setOption("styleActiveLine" as any, true);
      }
    });

    cm.on("blur", () => {
      if (styleActiveLineRef.current && cm) {
        cm.setOption("styleActiveLine" as any, false);
      }
      if (cm?.state.vim != null) {
        // We exit insert mode whenever blurring the editor.  This isn't
        // necessarily the *right* thing to do with vim; however, not doing
        // this seriously confuses the editor state.  See
        //    https://github.com/sagemathinc/cocalc/issues/5324
        // @ts-ignore
        CodeMirror.Vim?.exitInsertMode(cm);
      }
      save_syncstring();
    });

    cm.on("cursorActivity", (cm) => {
      if (!propsRef.current.is_current) {
        // not in focus, so any cursor movement is not to be broadcast.
        return;
      }
      // side_effect is whether or not the cursor move is being
      // caused by an  external setValueNoJump, so just a side
      // effect of something another user did.
      const side_effect = (cm as any)._setValueNoJump;
      if (side_effect) {
        // cursor movement is a side effect of upstream change, so ignore.
        return;
      }
      const locs = cm
        .getDoc()
        .listSelections()
        .map((c) => ({ x: c.anchor.ch, y: c.anchor.line }));

      const actions = editor_actions();
      actions?.set_cursor_locs(locs);
      throttled_save_editor_state(cm);
    });

    // replace undo/redo by our sync aware versions
    (cm as any).undo = cm_undo;
    (cm as any).redo = cm_redo;
  }

  function update_codemirror(options?): void {
    if (cmRef.current == null) return;
    if (!options) {
      options = cm_options(
        props.path,
        props.editor_settings,
        props.gutters,
        editor_actions(),
        props.actions,
        props.id,
      );
    }
    const cm = cmRef.current;
    for (const key in options) {
      const opt = options[key];
      if (!isEqual(cm.options[key], opt)) {
        if (opt != null) {
          cm.setOption(key as any, opt);
          if (key == "extraKeys") {
            cm.addKeyMap(options.extraKeys);
          }
        }
      }
    }
  }

  function tab_nothing_selected(): void {
    if (cmRef.current == null) return;
    const cursor = cmRef.current.getDoc().getCursor();
    if (
      cursor.ch === 0 ||
      /\s/.test(cmRef.current.getDoc().getLine(cursor.line)[cursor.ch - 1])
    ) {
      // whitespace before cursor -- just do normal tab
      if (cmRef.current.options.indentWithTabs) {
        (CodeMirror.commands as any).defaultTab(cmRef.current);
      } else {
        (cmRef.current as any).tab_as_space();
      }
      return;
    }
    // Do completion at cursor.
    complete_at_cursor();
  }

  function tab_key(): void {
    if (cmRef.current == null) return;
    if ((cmRef.current as any).somethingSelected()) {
      (CodeMirror as any).commands.defaultTab(cmRef.current);
    } else {
      tab_nothing_selected();
    }
  }

  // Do completion at the current cursor position -- this uses
  // the codemirror plugin, which can be configured with lots of
  // ways of completing -- see "show-hint.js" at
  // https://codemirror.net/doc/manual.html#addons
  function complete_at_cursor(): void {
    if (cmRef.current == null) return;
    cmRef.current.execCommand("autocomplete");
  }

  function render_cursors(): Rendered {
    if (props.cursors != null && cmRef.current != null && has_cm) {
      // Very important not to render without cm defined, because that renders
      // to static Codemirror instead.
      return <Cursors cursors={props.cursors} codemirror={cmRef.current} />;
    }
  }

  function render_gutter_markers(): Rendered {
    if (!has_cm || props.gutter_markers == null || cmRef.current == null) {
      return;
    }
    return (
      <GutterMarkers
        gutter_markers={props.gutter_markers}
        codemirror={cmRef.current}
        set_handle={(id, handle) =>
          props.actions._set_gutter_handle(id, handle)
        }
      />
    );
  }

  return (
    <div className="smc-vfill cocalc-editor-div" ref={divRef}>
      <Path
        project_id={props.project_id}
        path={props.path}
        is_current={props.is_current}
      />
      <div
        style={{ ...STYLE, fontSize: `${props.font_size}px` }}
        className="smc-vfill"
      >
        {render_cursors()}
        {render_gutter_markers()}
        <textarea
          ref={textareaRef}
          style={{ display: "none" }}
          placeholder={props.placeholder}
        />
      </div>
    </div>
  );
});

// Needed e.g., for vim ":w" support; this is global,
// so be careful.
if ((CodeMirror as any).commands.save == null) {
  (CodeMirror as any).commands.save = (cm: any) => {
    const f = cm.cocalc_actions?.save;
    if (typeof f == "function") {
      f(true);
    }
  };
}
