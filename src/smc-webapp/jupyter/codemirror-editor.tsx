/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Focused codemirror editor, which you can interactively type into.

declare const $: any;

import { SAVE_DEBOUNCE_MS } from "../frame-editors/code-editor/codemirror-editor";

import { delay } from "awaiting";
import { React, Component } from "../app-framework";
import * as underscore from "underscore";
import { Map as ImmutableMap } from "immutable";
import { three_way_merge } from "smc-util/sync/editor/generic/util";
import { Complete } from "./complete";
import { Cursors } from "./cursors";
declare const CodeMirror: any; // TODO: type

import { JupyterActions } from "./browser-actions";
import { NotebookFrameActions } from "../frame-editors/jupyter-editor/cell-notebook/actions";

// We cache a little info about each Codemirror editor we make here,
// so we can restore it when we make the same one again.  Due to
// windowing, destroying and creating the same codemirror can happen
// a lot. TODO: This **should** be an LRU cache to avoid a memory leak.
interface CachedInfo {
  sel?: any[]; // only cache the selections right now...
  last_introspect_pos?: { line: number; ch: number };
}

const cache: { [key: string]: CachedInfo } = {};

const FOCUSED_STYLE: React.CSSProperties = {
  width: "100%",
  overflowX: "hidden",
  border: "1px solid #cfcfcf",
  borderRadius: "2px",
  background: "#f7f7f7",
  lineHeight: "1.21429em",
};

// Todo: the frame-editor/code-editor needs a similar treatment...?
export interface EditorFunctions {
  save: () => string | undefined;
  set_cursor: (pos: { x?: number; y?: number }) => void;
  tab_key: () => void;
  shift_tab_key: () => void;
  refresh: () => void;
  get_cursor: () => { line: number; ch: number };
  get_cursor_xy: () => { x: number; y: number };
}

interface CodeMirrorEditorProps {
  actions: JupyterActions;
  frame_actions: NotebookFrameActions;
  id: string;
  options: ImmutableMap<any, any>;
  value: string;
  font_size?: number; // font_size not explicitly used, but it is critical
  // to re-render on change so Codemirror recomputes itself!
  cursors?: ImmutableMap<any, any>;
  set_click_coords: Function; // TODO: type
  click_coords?: any; // coordinates if cell was just clicked on
  set_last_cursor: Function; // TODO: type
  last_cursor?: any;
  is_focused?: boolean;
  is_scrolling?: boolean;
  complete?: ImmutableMap<any, any>;
}

export class CodeMirrorEditor extends Component<CodeMirrorEditorProps> {
  private cm: any;
  private _cm_last_remote: any;
  private _cm_change: any;
  private _cm_blur_skip: any;
  private _cm_is_focused: any;
  private _vim_mode: any;
  private cm_ref = React.createRef<HTMLPreElement>();
  private key?: string;

  componentDidMount() {
    if (this.has_frame_actions()) {
      this.key = `${this.props.frame_actions.frame_id}${this.props.id}`;
    }
    this.init_codemirror(this.props.options, this.props.value);
  }

  has_frame_actions = (): boolean => {
    return (
      this.props.frame_actions != null && !this.props.frame_actions.is_closed()
    );
  };

  _cm_destroy = (): void => {
    if (this.cm != null) {
      // console.log("destroy_codemirror", this.props.id);
      if (this.has_frame_actions()) {
        this.props.frame_actions.unregister_input_editor(this.props.id);
      }
      delete this._cm_last_remote;
      delete this.cm.save;
      if (this._cm_change != null) {
        this.cm.off("change", this._cm_change);
        this.cm.off("focus", this._cm_focus);
        this.cm.off("blur", this._cm_blur);
        delete this._cm_change;
      }
      $(this.cm.getWrapperElement()).remove(); // remove from DOM
      if (this.cm.getOption("extraKeys") != null) {
        this.cm.getOption("extraKeys").Tab = undefined; // no need to reference method of this react class
      }
      delete this.cm;
    }
  };

  _cm_focus = (): void => {
    this._cm_is_focused = true;
    if (this.cm == null || this.props.actions == null) {
      return;
    }
    if (this.has_frame_actions()) {
      this.props.frame_actions.unselect_all_cells();
      this.props.frame_actions.set_cur_id(this.props.id);
      this.props.frame_actions.set_mode("edit");
    }
    if (this._vim_mode) {
      $(this.cm.getWrapperElement()).css({ paddingBottom: "1.5em" });
    }
    this._cm_cursor();
  };

  _cm_blur = (): void => {
    this._cm_is_focused = false;
    if (this.cm == null || this.props.actions == null) {
      return;
    }
    this.props.set_last_cursor(this.cm.getCursor());
    if (this._vim_mode) {
      return;
    }
    if (this._cm_blur_skip) {
      delete this._cm_blur_skip;
      return;
    }
    if (this.has_frame_actions()) {
      this.props.frame_actions.set_mode("escape");
    }
  };

  _cm_cursor = (): void => {
    if (this.cm == null || this.props.actions == null) {
      return;
    }
    const sel = this.cm.listSelections();
    if (this.key != null) {
      if (cache[this.key] == null) cache[this.key] = {};
      cache[this.key].sel = sel;
    }
    const locs = sel.map((c) => ({
      x: c.anchor.ch,
      y: c.anchor.line,
      id: this.props.id,
    }));
    this.props.actions.set_cursor_locs(locs, this.cm._setValueNoJump);

    // See https://github.com/jupyter/notebook/issues/2464 for discussion of this cell_list_top business.
    if (this.has_frame_actions()) {
      const cell_list_div = this.props.frame_actions.cell_list_div;
      if (cell_list_div != null) {
        const cell_list_top = cell_list_div.offset()?.top;
        if (
          cell_list_top != null &&
          this.cm.cursorCoords(true, "window").top < cell_list_top
        ) {
          const scroll = cell_list_div.scrollTop();
          cell_list_div.scrollTop(
            scroll -
              (cell_list_top - this.cm.cursorCoords(true, "window").top) -
              20
          );
        }
      }
    }
  };

  _cm_set_cursor = (pos: { x?: number; y?: number }): void => {
    let { x = 0, y = 0 } = pos; // codemirror tracebacks on undefined pos!
    if (y < 0) {
      // for getting last line...
      y = this.cm.lastLine() + 1 + y;
    }
    this.cm.setCursor({ line: y, ch: x });
  };

  _cm_refresh = (): void => {
    if (this.cm == null || this.props.frame_actions == null) {
      return;
    }
    this.cm.refresh();
  };

  _cm_save = (): string | undefined => {
    if (this.cm == null || this.props.actions == null) {
      return;
    }
    const value = this.cm.getValue();
    if (value !== this._cm_last_remote) {
      // only save if we actually changed something
      this._cm_last_remote = value;
      // The true makes sure the Store has its state set immediately,
      // with no debouncing/throttling, etc., which is important
      // since some code, e.g., for introspection when doing evaluation,
      // which runs immediately after this, assumes the Store state
      // is set for the editor.
      this.props.actions.set_cell_input(this.props.id, value);
    }
    return value;
  };

  _cm_merge_remote = (remote: string): void => {
    if (this.cm == null) {
      return;
    }
    if (this._cm_last_remote == null) {
      this._cm_last_remote = "";
    }
    if (this._cm_last_remote === remote) {
      return; // nothing to do
    }
    const local = this.cm.getValue();
    const new_val = three_way_merge({
      base: this._cm_last_remote,
      local,
      remote,
    });
    this._cm_last_remote = remote;
    this.cm.setValueNoJump(new_val);
  };

  _cm_undo = (): void => {
    if (this.cm == null || this.props.actions == null) {
      return;
    }
    if (
      !this.props.actions.syncdb.in_undo_mode() ||
      this.cm.getValue() !== this._cm_last_remote
    ) {
      this._cm_save();
    }
    this.props.actions.undo();
  };

  _cm_redo = (): void => {
    if (this.cm == null || this.props.actions == null) {
      return;
    }
    this.props.actions.redo();
  };

  shift_tab_key = (): void => {
    if (this.cm == null) return;
    if (this.cm.somethingSelected() || this.whitespace_before_cursor()) {
      // Something is selected or there is whitespace before
      // the cursor: unindent.
      if (this.cm != null) this.cm.unindent_selection();
      return;
    }
    // Otherwise, Shift+tab in Jupyter is introspect.
    const pos = this.cm.getCursor();
    let last_introspect_pos:
      | undefined
      | { line: number; ch: number } = undefined;
    if (this.key != null && cache[this.key]) {
      last_introspect_pos = cache[this.key].last_introspect_pos;
    }
    if (
      this.props.actions.store.get("introspect") != null &&
      last_introspect_pos != null &&
      last_introspect_pos.line === pos.line &&
      last_introspect_pos.ch === pos.ch
    ) {
      // make sure introspect pager closes (if visible)
      this.props.actions.introspect_close();
      last_introspect_pos = undefined;
    } else {
      this.props.actions.introspect_at_pos(this.cm.getValue(), 0, pos);
      last_introspect_pos = pos;
    }
    if (this.key != null) {
      if (cache[this.key] == null) cache[this.key] = {};
      cache[this.key].last_introspect_pos = last_introspect_pos;
    }
  };

  tab_key = (): void => {
    if (this.cm == null) {
      return;
    }
    if (this.cm.somethingSelected()) {
      CodeMirror.commands.defaultTab(this.cm);
    } else {
      this.tab_nothing_selected();
    }
  };

  up_key = (): void => {
    if (this.cm == null) {
      return;
    }
    const cur = this.cm.getCursor();
    if (
      (cur != null ? cur.line : undefined) === this.cm.firstLine() &&
      (cur != null ? cur.ch : undefined) === 0
    ) {
      this.adjacent_cell(-1, -1);
    } else {
      CodeMirror.commands.goLineUp(this.cm);
    }
  };

  down_key = (): void => {
    if (this.cm == null) {
      return;
    }
    const cur = this.cm.getCursor();
    const n = this.cm.lastLine();
    const cur_line = cur != null ? cur.line : undefined;
    const cur_ch = cur != null ? cur.ch : undefined;
    const line = this.cm.getLine(n);
    const line_length = line != null ? line.length : undefined;
    if (cur_line === n && cur_ch === line_length) {
      this.adjacent_cell(0, 1);
    } else {
      CodeMirror.commands.goLineDown(this.cm);
    }
  };

  page_up_key = (): void => {
    if (this.cm == null) {
      return;
    }
    const cur = this.cm.getCursor();
    if (
      (cur != null ? cur.line : undefined) === this.cm.firstLine() &&
      (cur != null ? cur.ch : undefined) === 0
    ) {
      this.adjacent_cell(-1, -1);
    } else {
      CodeMirror.commands.goPageUp(this.cm);
    }
  };

  page_down_key = (): void => {
    if (this.cm == null) {
      return;
    }
    const cur = this.cm.getCursor();
    const n = this.cm.lastLine();
    const cur_line = cur != null ? cur.line : undefined;
    const cur_ch = cur != null ? cur.ch : undefined;
    const line = this.cm.getLine(n);
    const line_length = line != null ? line.length : undefined;
    if (cur_line === n && cur_ch === line_length) {
      this.adjacent_cell(0, 1);
    } else {
      CodeMirror.commands.goPageDown(this.cm);
    }
  };

  adjacent_cell = (y: number, delta: any): void => {
    if (!this.has_frame_actions()) return;
    this.props.frame_actions.move_cursor(delta);
    this.props.frame_actions.set_input_editor_cursor(
      this.props.frame_actions.store.get("cur_id"),
      {
        x: 0,
        y,
      }
    );
    this.props.frame_actions.scroll("cell visible");
  };

  whitespace_before_cursor = (): boolean => {
    if (this.cm == null) return false;
    const cur = this.cm.getCursor();
    return cur.ch === 0 || /\s/.test(this.cm.getLine(cur.line)[cur.ch - 1]);
  };

  tab_nothing_selected = async (): Promise<void> => {
    if (this.cm == null || this.props.actions == null) {
      return;
    }
    if (this.whitespace_before_cursor()) {
      if (this.cm.options.indentWithTabs) {
        CodeMirror.commands.defaultTab(this.cm);
      } else {
        this.cm.tab_as_space();
      }
      return;
    }
    const cur = this.cm.getCursor();
    const pos = this.cm.cursorCoords(cur, "local");
    const top = pos.bottom;
    const { left } = pos;
    const gutter = $(this.cm.getGutterElement()).width();
    // ensure that store has same version of cell as we're completing
    this._cm_save();
    // do the actual completion:
    try {
      const show_dialog: boolean = await this.props.actions.complete(
        this.cm.getValue(),
        cur,
        this.props.id,
        {
          top,
          left,
          gutter,
        }
      );
      if (!show_dialog && this.has_frame_actions()) {
        this.props.frame_actions.set_mode("edit");
      }
    } catch (err) {
      // ignore -- maybe another complete happened and this should be ignored.
    }
  };

  update_codemirror_options = (next: any, current: any): void => {
    next.forEach((value: any, option: any) => {
      if (value !== current.get(option)) {
        if (typeof value.toJS === "function") {
          value = value.toJS();
        }
        this.cm.setOption(option, value);
      }
    });
  };

  // NOTE: init_codemirror is VERY expensive, e.g., on the order of 10's of ms.
  private init_codemirror(
    options: ImmutableMap<string, any>,
    value: string
  ): void {
    if (this.cm != null) return;
    const node = this.cm_ref.current;
    if (node == null) {
      return;
    }
    // console.log("init_codemirror", this.props.id);
    const options0: any = options.toJS();
    if (this.props.actions != null) {
      if (options0.extraKeys == null) {
        options0.extraKeys = {};
      }
      options0.extraKeys["Shift-Tab"] = this.shift_tab_key;
      options0.extraKeys["Tab"] = this.tab_key;
      options0.extraKeys["Up"] = this.up_key;
      options0.extraKeys["Down"] = this.down_key;
      options0.extraKeys["PageUp"] = this.page_up_key;
      options0.extraKeys["PageDown"] = this.page_down_key;
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

    this.cm = CodeMirror(function (elt) {
      if (node.parentNode == null) return;
      node.parentNode.replaceChild(elt, node);
    }, options0);

    this.cm.save = () => this.props.actions.save();
    if (this.props.actions != null && options0.keyMap === "vim") {
      this._vim_mode = true;
      this.cm.on("vim-mode-change", async (obj) => {
        if (!this.has_frame_actions()) return;
        if (obj.mode === "normal") {
          // The delay is because this must not be set when the general
          // keyboard handler for the whole editor gets called with escape.
          // This is ugly, but I'm not going to spend forever on this before
          // the #v1 release, as vim support is a bonus feature.
          await delay(0);
          this.props.frame_actions.setState({
            cur_cell_vim_mode: "escape",
          });
        } else {
          this.props.frame_actions.setState({ cur_cell_vim_mode: "edit" });
        }
      });
    } else {
      this._vim_mode = false;
    }

    const css: any = { height: "auto" };
    if (options0.theme == null) {
      css.backgroundColor = "#fff";
    }
    $(this.cm.getWrapperElement()).css(css);

    this._cm_last_remote = value;
    this.cm.setValue(value);
    if (this.key != null) {
      const info = cache[this.key];
      if (info != null && info.sel != null) {
        this.cm.getDoc().setSelections(info.sel, undefined, { scroll: false });
      }
    }
    this._cm_change = underscore.debounce(this._cm_save, SAVE_DEBOUNCE_MS);
    this.cm.on("change", this._cm_change);
    this.cm.on("beforeChange", (_, changeObj) => {
      if (changeObj.origin == "paste") {
        // See https://github.com/sagemathinc/cocalc/issues/5110
        this._cm_save();
      }
    });
    this.cm.on("focus", this._cm_focus);
    this.cm.on("blur", this._cm_blur);
    this.cm.on("cursorActivity", this._cm_cursor);

    // replace undo/redo by our sync aware versions
    this.cm.undo = this._cm_undo;
    this.cm.redo = this._cm_redo;

    if (this.has_frame_actions()) {
      const editor: EditorFunctions = {
        save: this._cm_save,
        set_cursor: this._cm_set_cursor,
        tab_key: this.tab_key,
        shift_tab_key: this.shift_tab_key,
        refresh: this._cm_refresh,
        get_cursor: () => this.cm.getCursor(),
        get_cursor_xy: () => {
          const pos = this.cm.getCursor();
          return { x: pos.ch, y: pos.line };
        },
      };
      this.props.frame_actions.register_input_editor(this.props.id, editor);
    }

    if (this.props.click_coords != null) {
      // editor clicked on, so restore cursor to that position
      this.cm.setCursor(this.cm.coordsChar(this.props.click_coords, "window"));
      this.props.set_click_coords(); // clear them
    } else if (this.props.last_cursor != null) {
      this.cm.setCursor(this.props.last_cursor);
      this.props.set_last_cursor();
    }

    if (this.props.is_focused) {
      this.focus_cm();
    }
  }

  async componentWillReceiveProps(nextProps: CodeMirrorEditorProps) {
    if (this.cm == null) {
      this.init_codemirror(nextProps.options, nextProps.value);
      return;
    }
    if (!this.props.options.equals(nextProps.options)) {
      this.update_codemirror_options(nextProps.options, this.props.options);
    }
    if (
      this.props.font_size !== nextProps.font_size ||
      (this.props.is_scrolling && !nextProps.is_scrolling)
    ) {
      this._cm_refresh();
    }
    // In some cases (e.g., tab completion when selecting via keyboard)
    // nextProps.value and this.props.value are the same, but they
    // do not equal this.cm.getValue().  The complete prop changes
    // so the component updates, but without checking cm.getValue(),
    // we would fail to update the cm editor, which would is
    // a disaster.  May be root cause of
    //    https://github.com/sagemathinc/cocalc/issues/3978
    if (
      nextProps.value !== this.props.value ||
      (this.cm != null && nextProps.value != this.cm.getValue())
    ) {
      this._cm_merge_remote(nextProps.value);
    }
    if (nextProps.is_focused && !this.props.is_focused) {
      // gain focus
      if (this.cm != null) {
        this.focus_cm();
      }
    }
    if (!nextProps.is_focused && this._cm_is_focused) {
      // controlled loss of focus from store; we have to force
      // this somehow.  Note that codemirror has no .blur().
      // See http://codemirror.977696.n3.nabble.com/Blur-CodeMirror-editor-td4026158.html
      await delay(1);
      if (this.cm != null) {
        this.cm.getInputField().blur();
      }
    }
    if (this._vim_mode && !nextProps.is_focused && this.props.is_focused) {
      $(this.cm.getWrapperElement()).css({ paddingBottom: 0 });
    }
  }

  componentWillUnmount() {
    if (this.cm != null) {
      this._cm_save();
      this._cm_destroy();
    }
  }

  private focus_cm(): void {
    if (this.cm == null) return;
    // Because we use react-window, it is critical to preventScroll
    // when focusing!  Unfortunately, CodeMirror's api does not
    // expose this option, so we have to bypass it in the dangerous
    // way below, which could break were CodeMirror to be refactored!
    // TODO: send them a PR to expose this.
    if (this.cm.display == null || this.cm.display.input == null) return;
    if (this.cm.display.input.textarea != null) {
      this.cm.display.input.textarea.focus({ preventScroll: true });
    } else if (this.cm.display.input.div != null) {
      this.cm.display.input.div.focus({ preventScroll: true });
    }
  }

  render_complete() {
    if (
      this.props.complete != null &&
      this.props.complete.get("matches") &&
      this.props.complete.get("matches").size > 0
    ) {
      return (
        <Complete
          complete={this.props.complete}
          actions={this.props.actions}
          frame_actions={this.props.frame_actions}
          id={this.props.id}
        />
      );
    }
  }

  render_cursors() {
    if (this.props.cursors != null) {
      return <Cursors cursors={this.props.cursors} codemirror={this.cm} />;
    }
  }

  render() {
    return (
      <div style={{ width: "100%", overflow: "auto" }}>
        {this.render_cursors()}
        <div style={FOCUSED_STYLE}>
          <pre
            ref={this.cm_ref}
            style={{
              width: "100%",
              backgroundColor: "#fff",
              minHeight: "25px",
            }}
          >
            {this.props.value}
          </pre>
        </div>
        {this.render_complete()}
      </div>
    );
  }
}
