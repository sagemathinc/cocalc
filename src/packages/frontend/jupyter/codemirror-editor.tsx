/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Focused codemirror editor, which you can interactively type into.

declare const $: any;

import { SAVE_DEBOUNCE_MS } from "../frame-editors/code-editor/const";

import LRU from "lru-cache";
import { delay } from "awaiting";
import { React, useRef, usePrevious } from "../app-framework";
import * as underscore from "underscore";
import { Map as ImmutableMap } from "immutable";
import { three_way_merge } from "@cocalc/sync/editor/generic/util";
import { Complete, Actions as CompleteActions } from "./complete";
import { Cursors } from "./cursors";
import CodeMirror from "codemirror";
import { CSSProperties, useEffect } from "react";

import useNotebookFrameActions from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/hook";
import { EditorFunctions } from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/actions";

// We cache a little info about each Codemirror editor we make here,
// so we can restore it when we make the same one again.  Due to
// windowing, destroying and creating the same codemirror can happen
interface CachedInfo {
  sel?: any[]; // only cache the selections right now...
  last_introspect_pos?: { line: number; ch: number };
}

const cache = new LRU<string, CachedInfo>({ max: 1000 });

const FOCUSED_STYLE: React.CSSProperties = {
  width: "100%",
  overflowX: "hidden",
  border: "1px solid #cfcfcf",
  borderRadius: "2px",
  background: "#f7f7f7",
  lineHeight: "1.21429em",
} as const;

// This is what we use.  It's satisfied by these actions
// -- 'import { JupyterActions } from "./browser-actions";',
// but anybody who wants to use this component could make
// there own object with this interface and it should work.
export interface Actions extends CompleteActions {
  set_cursor_locs: (locs: any[], side_effect?: boolean) => void;
  set_cell_input: (id: string, input: string, save?: boolean) => void;
  undo: () => void;
  redo: () => void;
  in_undo_mode: () => boolean;
  is_introspecting: () => boolean;
  introspect_close: () => void;
  introspect_at_pos: (
    code: string,
    level: 0 | 1,
    pos: { ch: number; line: number }
  ) => Promise<void>;
  complete: (
    code: string,
    pos?: { line: number; ch: number } | number,
    id?: string,
    offset?: any
  ) => Promise<boolean>;
  save: () => Promise<void>;
}

interface CodeMirrorEditorProps {
  actions: Actions; // e.g., JupyterActions from "./browser-actions".
  id: string;
  options: ImmutableMap<any, any>;
  value: string;
  set_click_coords?: Function; // TODO: type
  font_size?: number; // font_size not explicitly used, but it is critical
  // to re-render on change so Codemirror recomputes itself!
  cursors?: ImmutableMap<any, any>;
  click_coords?: any; // coordinates if cell was just clicked on
  set_last_cursor?: Function; // TODO: type
  last_cursor?: any;
  is_focused?: boolean;
  is_scrolling?: boolean;
  complete?: ImmutableMap<any, any>;
  style?: CSSProperties;
  onKeyDown?: (cm, e) => void;
  registerEditor?: (EditorFunctions) => void;
  unregisterEditor?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  contenteditable?: boolean; // make true for whiteboard so works when scaled.
  refresh?: any; // if this changes, then cm.refresh() is called.
}

export const CodeMirrorEditor: React.FC<CodeMirrorEditorProps> = ({
  actions,
  id,
  options,
  value,
  font_size,
  cursors,
  set_click_coords,
  click_coords,
  set_last_cursor,
  last_cursor,
  is_focused,
  is_scrolling,
  complete,
  style,
  onKeyDown,
  registerEditor,
  unregisterEditor,
  onFocus,
  onBlur,
  contenteditable,
  refresh,
}: CodeMirrorEditorProps) => {
  const cm = useRef<any>(null);
  const cm_last_remote = useRef<any>(null);
  const cm_change = useRef<any>(null);
  const cm_is_focused = useRef<boolean>(false);
  const vim_mode = useRef<boolean>(false);
  const cm_ref = React.createRef<HTMLPreElement>();

  const key = useRef<string | null>(null);

  const prev_options = usePrevious(options);

  const frameActions = useNotebookFrameActions();

  useEffect(() => {
    if (frameActions.current?.frame_id != null) {
      key.current = `${frameActions.current.frame_id}${id}`;
    }
    init_codemirror(options, value);

    return () => {
      if (cm.current != null) {
        cm_save();
        cm_destroy();
      }
    };
  }, []);

  useEffect(() => {
    cm.current?.refresh();
  }, [refresh]);

  useEffect(() => {
    if (cm.current == null) {
      init_codemirror(options, value);
      return;
    }
    if (prev_options != null && !prev_options.equals(options)) {
      update_codemirror_options(options, prev_options);
    }
  }, [options, value]);

  useEffect(() => {
    cm_refresh();
  }, [font_size, is_scrolling]);

  // In some cases (e.g., tab completion when selecting via keyboard)
  // nextProps.value and value are the same, but they
  // do not equal cm.current.getValue().  The complete prop changes
  // so the component updates, but without checking cm.getValue(),
  // we would fail to update the cm editor, which would is
  // a disaster.  May be root cause of
  //    https://github.com/sagemathinc/cocalc/issues/3978
  useEffect(() => {
    if (cm.current?.getValue() != value) {
      cm_merge_remote(value);
    }
  }, [value, cm.current?.getValue()]);

  useEffect(() => {
    // can't do anything if there is no codemirror editor
    if (cm.current == null) return;

    // gain focus
    if (is_focused && !cm_is_focused.current) {
      focus_cm();
    }

    (async () => {
      if (!is_focused && cm_is_focused.current) {
        // controlled loss of focus from store; we have to force
        // this somehow.  Note that codemirror has no .blur().
        // See http://codemirror.977696.n3.nabble.com/Blur-CodeMirror-editor-td4026158.html
        await delay(1);
        cm.current?.getInputField().blur();
      }
    })();

    if (vim_mode.current && !is_focused) {
      $(cm.current.getWrapperElement()).css({ paddingBottom: 0 });
    }
  }, [is_focused]);

  function cm_destroy(): void {
    if (cm.current != null) {
      unregisterEditor?.();
      cm_last_remote.current = null;
      cm.current.save = null;
      if (cm_change.current != null) {
        cm.current.off("change", cm_change.current);
        cm.current.off("focus", cm_focus);
        cm.current.off("blur", cm_blur);
        cm_change.current = null;
      }
      $(cm.current.getWrapperElement()).remove(); // remove from DOM
      if (cm.current.getOption("extraKeys") != null) {
        cm.current.getOption("extraKeys").Tab = undefined; // no need to reference method of this react class
      }
      cm.current = null;
    }
  }

  function cm_focus(): void {
    onFocus?.();
    cm_is_focused.current = true;
    if (cm.current == null || actions == null) {
      return;
    }
    frameActions.current?.unselect_all_cells();
    frameActions.current?.set_cur_id(id);
    frameActions.current?.set_mode("edit");
    if (vim_mode.current) {
      $(cm.current.getWrapperElement()).css({ paddingBottom: "1.5em" });
    }
    cm_cursor();
  }

  function cm_blur(): void {
    onBlur?.();
    cm_is_focused.current = false;
    if (cm.current == null || actions == null) {
      return;
    }
    set_last_cursor?.(cm.current.getCursor());
    // NOTE: see https://github.com/sagemathinc/cocalc/issues/5289
    // We had code here that did
    //    frameActions.current?.set_mode("escape");
    // so that any time the jupyter notebook blurs the mode
    // changes, which is consistent with the behavior of Jupyter
    // classic.  However, it causes that bug #5289, and I don't
    // really see that it is a good idea to switch this mode on
    // blur anyways.
  }

  function cm_cursor(): void {
    if (cm.current == null || actions == null) {
      return;
    }
    const sel = cm.current.listSelections();
    if (key.current != null) {
      const cached_val = cache.get(key.current) ?? {};
      cached_val.sel = sel;
      cache.set(key.current, cached_val);
    }
    const locs = sel.map((c) => ({
      x: c.anchor.ch,
      y: c.anchor.line,
      id: id,
    }));
    actions.set_cursor_locs(locs, cm.current._setValueNoJump);

    // See https://github.com/jupyter/notebook/issues/2464 for discussion of this cell_list_top business.
    if (frameActions.current) {
      const cell_list_div = frameActions.current?.cell_list_div;
      if (cell_list_div != null) {
        const cell_list_top = cell_list_div.offset()?.top;
        if (
          cell_list_top != null &&
          cm.current.cursorCoords(true, "window").top < cell_list_top
        ) {
          const scroll = cell_list_div.scrollTop();
          cell_list_div.scrollTop(
            scroll -
              (cell_list_top - cm.current.cursorCoords(true, "window").top) -
              20
          );
        }
      }
    }
  }

  function cm_set_cursor(pos: { x?: number; y?: number }): void {
    let { x = 0, y = 0 } = pos; // codemirror tracebacks on undefined pos!
    if (y < 0) {
      // for getting last line...
      y = cm.current.lastLine() + 1 + y;
    }
    cm.current.setCursor({ line: y, ch: x });
  }

  function cm_refresh(): void {
    if (cm.current == null || frameActions.current == null) {
      return;
    }
    cm.current.refresh();
  }

  function cm_save(): string | undefined {
    if (cm.current == null || actions == null) {
      return;
    }
    const value = cm.current.getValue();
    if (value !== cm_last_remote.current) {
      // only save if we actually changed something
      cm_last_remote.current = value;
      // The true makes sure the Store has its state set immediately,
      // with no debouncing/throttling, etc., which is important
      // since some code, e.g., for introspection when doing evaluation,
      // which runs immediately after this, assumes the Store state
      // is set for the editor.
      actions.set_cell_input(id, value);
    }
    return value;
  }

  function cm_merge_remote(remote: string): void {
    if (cm.current == null) {
      return;
    }
    if (cm_last_remote.current == null) {
      cm_last_remote.current = "";
    }
    if (cm_last_remote.current === remote) {
      return; // nothing to do
    }
    const local = cm.current.getValue();
    const new_val = three_way_merge({
      base: cm_last_remote.current,
      local,
      remote,
    });
    cm_last_remote.current = remote;
    cm.current.setValueNoJump(new_val);
  }

  function cm_undo(): void {
    if (cm.current == null || actions == null) {
      return;
    }
    if (
      !actions.in_undo_mode() ||
      cm.current.getValue() !== cm_last_remote.current
    ) {
      cm_save();
    }
    actions.undo();
  }

  function cm_redo(): void {
    if (cm.current == null || actions == null) {
      return;
    }
    actions.redo();
  }

  function shift_tab_key(): void {
    if (cm.current == null) return;
    if (cm.current.somethingSelected() || whitespace_before_cursor()) {
      // Something is selected or there is whitespace before
      // the cursor: unindent.
      if (cm.current != null) cm.current.unindent_selection();
      return;
    }
    // Otherwise, Shift+tab in Jupyter is introspect.
    const pos = cm.current.getCursor();
    let last_introspect_pos: undefined | { line: number; ch: number } =
      undefined;
    if (key.current != null) {
      const cached_val = cache.get(key.current);
      if (cached_val != null) {
        last_introspect_pos = cached_val.last_introspect_pos;
      }
    }
    if (
      actions.is_introspecting() &&
      last_introspect_pos != null &&
      last_introspect_pos.line === pos.line &&
      last_introspect_pos.ch === pos.ch
    ) {
      // make sure introspect pager closes (if visible)
      actions.introspect_close();
      last_introspect_pos = undefined;
    } else {
      actions.introspect_at_pos(cm.current.getValue(), 0, pos);
      last_introspect_pos = pos;
    }
    if (key.current != null) {
      const cached_val = cache.get(key.current) ?? {};
      cached_val.last_introspect_pos = last_introspect_pos;
      cache.set(key.current, cached_val);
    }
  }

  function tab_key(): void {
    if (cm.current == null) {
      return;
    }
    if (cm.current.somethingSelected()) {
      // @ts-ignore
      CodeMirror.commands.defaultTab(cm.current);
    } else {
      tab_nothing_selected();
    }
  }

  function up_key(): void {
    if (cm.current == null) {
      return;
    }
    const cur = cm.current.getCursor();
    if (
      (cur != null ? cur.line : undefined) === cm.current.firstLine() &&
      (cur != null ? cur.ch : undefined) === 0
    ) {
      adjacent_cell(-1, -1);
    } else {
      CodeMirror.commands.goLineUp(cm.current);
    }
  }

  function down_key(): void {
    if (cm.current == null) {
      return;
    }
    const cur = cm.current.getCursor();
    const n = cm.current.lastLine();
    const cur_line = cur != null ? cur.line : undefined;
    const cur_ch = cur != null ? cur.ch : undefined;
    const line = cm.current.getLine(n);
    const line_length = line != null ? line.length : undefined;
    if (cur_line === n && cur_ch === line_length) {
      adjacent_cell(0, 1);
    } else {
      CodeMirror.commands.goLineDown(cm.current);
    }
  }

  function page_up_key(): void {
    if (cm.current == null) {
      return;
    }
    const cur = cm.current.getCursor();
    if (
      (cur != null ? cur.line : undefined) === cm.current.firstLine() &&
      (cur != null ? cur.ch : undefined) === 0
    ) {
      adjacent_cell(-1, -1);
    } else {
      CodeMirror.commands.goPageUp(cm.current);
    }
  }

  function page_down_key(): void {
    if (cm.current == null) {
      return;
    }
    const cur = cm.current.getCursor();
    const n = cm.current.lastLine();
    const cur_line = cur != null ? cur.line : undefined;
    const cur_ch = cur != null ? cur.ch : undefined;
    const line = cm.current.getLine(n);
    const line_length = line != null ? line.length : undefined;
    if (cur_line === n && cur_ch === line_length) {
      adjacent_cell(0, 1);
    } else {
      CodeMirror.commands.goPageDown(cm.current);
    }
  }

  function adjacent_cell(y: number, delta: number): void {
    frameActions.current?.adjacentCell(y, delta);
  }

  function whitespace_before_cursor(): boolean {
    if (cm.current == null) return false;
    const cur = cm.current.getCursor();
    return cur.ch === 0 || /\s/.test(cm.current.getLine(cur.line)[cur.ch - 1]);
  }

  async function tab_nothing_selected(): Promise<void> {
    if (cm.current == null || actions == null) {
      return;
    }
    if (whitespace_before_cursor()) {
      if (cm.current.options.indentWithTabs) {
        // @ts-ignore
        CodeMirror.commands.defaultTab(cm.current);
      } else {
        cm.current.tab_as_space();
      }
      return;
    }
    const cur = cm.current.getCursor();
    const pos = cm.current.cursorCoords(cur, "local");
    const top = pos.bottom;
    const { left } = pos;
    const gutter = $(cm.current.getGutterElement()).width();
    // ensure that store has same version of cell as we're completing
    cm_save();
    // do the actual completion:
    try {
      const show_dialog: boolean = await actions.complete(
        cm.current.getValue(),
        cur,
        id,
        {
          top,
          left,
          gutter,
        }
      );
      if (!show_dialog) {
        frameActions.current?.set_mode("edit");
      }
    } catch (err) {
      // ignore -- maybe another complete happened and this should be ignored.
    }
  }

  function update_codemirror_options(next: any, current: any): void {
    next.forEach((value: any, option: string) => {
      if (value !== current.get(option)) {
        if (option != "inputStyle") {
          // note: inputStyle can not (yet) be changed in a running editor
          // -- see https://github.com/sagemathinc/cocalc/issues/5383
          if (typeof value?.toJS === "function") {
            value = value.toJS();
          }
          cm.current.setOption(option, value);
        }
      }
    });
  }

  // NOTE: init_codemirror is VERY expensive, e.g., on the order of 10's of ms.
  function init_codemirror(
    options: ImmutableMap<string, any>,
    value: string
  ): void {
    if (cm.current != null) return;
    const node = cm_ref.current;
    if (node == null) {
      return;
    }
    const options0: any = options.toJS();
    if (actions != null) {
      if (options0.extraKeys == null) {
        options0.extraKeys = {};
      }
      options0.extraKeys["Shift-Tab"] = shift_tab_key;
      options0.extraKeys["Tab"] = tab_key;
      options0.extraKeys["Up"] = up_key;
      options0.extraKeys["Down"] = down_key;
      options0.extraKeys["PageUp"] = page_up_key;
      options0.extraKeys["PageDown"] = page_down_key;
      options0.extraKeys["Cmd-/"] = "toggleComment";
      options0.extraKeys["Ctrl-/"] = "toggleComment";
      options0.extraKeys["Ctrl-Enter"] = () => {}; // ignore control+enter, since there's a shortcut
      /*
      Disabled for now since fold state isn't preserved.
      if (options0.foldGutter) {
        options0.extraKeys["Ctrl-Q"] = cm => cm.foldCodeSelectionAware();
        options0.gutters = ["CodeMirror-linenumbers", "CodeMirror-foldgutter"];
      }
      */
    } else {
      options0.readOnly = true;
    }

    if (contenteditable) {
      options0.inputStyle = "contenteditable" as "contenteditable";
    }

    cm.current = CodeMirror(function (elt) {
      if (node.parentNode == null) return;
      node.parentNode.replaceChild(elt, node);
    }, options0);

    cm.current.save = () => actions.save();
    if (actions != null && options0.keyMap === "vim") {
      vim_mode.current = true;
      cm.current.on("vim-mode-change", async (obj) => {
        if (obj.mode === "normal") {
          // The delay is because this must not be set when the general
          // keyboard handler for the whole editor gets called with escape.
          // This is ugly, but I'm not going to spend forever on this before
          // the #v1 release, as vim support is a bonus feature.
          await delay(0);
          frameActions.current?.setState({
            cur_cell_vim_mode: "escape",
          });
        } else {
          frameActions.current?.setState({ cur_cell_vim_mode: "edit" });
        }
      });
    } else {
      vim_mode.current = false;
    }

    const css: CSSProperties = { height: "auto" };
    if (options0.theme == null) {
      css.backgroundColor = "#fff";
    }
    $(cm.current.getWrapperElement()).css(css);

    cm_last_remote.current = value;
    cm.current.setValue(value);
    if (key.current != null) {
      const info = cache.get(key.current);
      if (info != null && info.sel != null) {
        cm.current
          .getDoc()
          .setSelections(info.sel, undefined, { scroll: false });
      }
    }
    cm_change.current = underscore.debounce(cm_save, SAVE_DEBOUNCE_MS);
    cm.current.on("change", cm_change.current);
    cm.current.on("beforeChange", (_, changeObj) => {
      if (changeObj.origin == "paste") {
        // See https://github.com/sagemathinc/cocalc/issues/5110
        cm_save();
      }
    });
    cm.current.on("focus", cm_focus);
    cm.current.on("blur", cm_blur);
    cm.current.on("cursorActivity", cm_cursor);
    if (onKeyDown != null) {
      cm.current.on("keydown", (cm, e) => onKeyDown(cm, e));
    }

    // replace undo/redo by our sync aware versions
    cm.current.undo = cm_undo;
    cm.current.redo = cm_redo;

    if (registerEditor != null) {
      registerEditor({
        save: cm_save,
        set_cursor: cm_set_cursor,
        tab_key: tab_key,
        shift_tab_key: shift_tab_key,
        refresh: cm_refresh,
        get_cursor: () => cm.current.getCursor(),
        get_cursor_xy: () => {
          const pos = cm.current.getCursor();
          return { x: pos.ch, y: pos.line };
        },
      });
    }
    if (frameActions.current) {
      const editor = {
        save: cm_save,
        set_cursor: cm_set_cursor,
        tab_key: tab_key,
        shift_tab_key: shift_tab_key,
        refresh: cm_refresh,
        get_cursor: () => cm.current.getCursor(),
        get_cursor_xy: () => {
          const pos = cm.current.getCursor();
          return { x: pos.ch, y: pos.line };
        },
      };
      frameActions.current?.register_input_editor(id, editor);
    }

    if (click_coords != null) {
      // editor clicked on, so restore cursor to that position
      cm.current.setCursor(cm.current.coordsChar(click_coords, "window"));
      set_click_coords?.(); // clear them
    } else if (last_cursor != null) {
      cm.current.setCursor(last_cursor);
      set_last_cursor?.();
    }

    if (is_focused) {
      focus_cm();
    }
  }

  function focus_cm(): void {
    const ed = cm.current;
    if (ed == null) return;
    ed.getInputField().focus({ preventScroll: true });
  }

  function render_complete() {
    if (
      complete != null &&
      complete.get("matches") &&
      complete.get("matches").size > 0
    ) {
      return <Complete complete={complete} actions={actions} id={id} />;
    }
  }

  function render_cursors() {
    if (cursors != null) {
      return <Cursors cursors={cursors} codemirror={cm.current} />;
    }
  }

  return (
    <div style={{ width: "100%", overflow: "auto" }}>
      {render_cursors()}
      <div style={{ ...FOCUSED_STYLE, ...style }}>
        <pre
          ref={cm_ref}
          style={{
            width: "100%",
            backgroundColor: "#fff",
            minHeight: "25px",
          }}
        >
          {value}
        </pre>
      </div>
      {render_complete()}
    </div>
  );
};
