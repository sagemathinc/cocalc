/*
Focused codemirror editor, which you can interactively type into.
*/

declare const $: any;

const SAVE_DEBOUNCE_MS = 1500;

import { React, Component, ReactDOM } from "../app-framework"; // TODO: this will move
import * as underscore from "underscore";
import { Map as ImmutableMap } from "immutable";
import { three_way_merge } from "smc-util/sync/editor/generic/util";
const { Complete } = require("./complete");
const { Cursors } = require("./cursors");
declare const CodeMirror: any; // TODO: type

const FOCUSED_STYLE: React.CSSProperties = {
  width: "100%",
  overflowX: "hidden",
  border: "1px solid #cfcfcf",
  borderRadius: "2px",
  background: "#f7f7f7",
  lineHeight: "1.21429em"
};

interface CodeMirrorEditorProps {
  actions?: any;
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
  complete?: ImmutableMap<any, any>;
}

export class CodeMirrorEditor extends Component<CodeMirrorEditorProps> {
  private cm: any;
  private _cm_last_remote: any;
  private _cm_change: any;
  private _cm_blur_skip: any;
  private _cm_is_focused: any;
  private _vim_mode: any;

  componentDidMount() {
    return this.init_codemirror(this.props.options, this.props.value);
  }

  _cm_destroy = (): void => {
    if (this.cm != null) {
      if (this.props.actions != null) {
        this.props.actions.unregister_input_editor(this.props.id);
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
    this.props.actions.unselect_all_cells();
    this.props.actions.set_cur_id(this.props.id);
    this.props.actions.set_mode("edit");
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
    this.props.actions.set_mode("escape");
  };

  _cm_cursor = (): void => {
    if (this.cm == null || this.props.actions == null) {
      return;
    }
    const locs = this.cm
      .listSelections()
      .map(c => ({ x: c.anchor.ch, y: c.anchor.line, id: this.props.id }));
    this.props.actions.set_cursor_locs(locs, this.cm._setValueNoJump);

    // See https://github.com/jupyter/notebook/issues/2464 for discussion of this cell_list_top business.
    const cell_list_top =
      this.props.actions._cell_list_div != null
        ? this.props.actions._cell_list_div.offset().top
        : undefined;
    if (
      cell_list_top != null &&
      this.cm.cursorCoords(true, "window").top < cell_list_top
    ) {
      const scroll = this.props.actions._cell_list_div.scrollTop();
      this.props.actions._cell_list_div.scrollTop(
        scroll - (cell_list_top - this.cm.cursorCoords(true, "window").top) - 20
      );
    }

    this.set_hook_pos();
  };

  set_hook_pos = (): void => {
    if (this.cm == null) {
      return;
    }
    // Used for maintaining vertical scroll position with multiple simultaneous editors.
    const offset = this.cm.cursorCoords(true, "local").top;
    this.props.actions.setState({ hook_offset: offset });
  };

  _cm_set_cursor = (pos: { x?: number; y?: number }): void => {
    let { x = 0, y = 0 } = pos; // codemirror tracebacks on undefined pos!
    if (y < 0) {
      // for getting last line...
      y = this.cm.lastLine() + 1 + y;
    }
    this.cm.setCursor({ line: y, ch: x });
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

  _cm_merge_remote = (remote: any): void => {
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
      remote
    });
    this._cm_last_remote = remote;
    this.cm.setValueNoJump(new_val);
    this.set_hook_pos();
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
    this.cm != null ? this.cm.unindent_selection() : undefined;
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
    this.props.actions.move_cursor(delta);
    this.props.actions.set_cursor(this.props.actions.store.get("cur_id"), {
      x: 0,
      y
    });
  };

  tab_nothing_selected = (): void => {
    if (this.cm == null) {
      return;
    }
    const cur = this.cm.getCursor();
    if (cur.ch === 0 || /\s/.test(this.cm.getLine(cur.line)[cur.ch - 1])) {
      // whitespace before cursor
      if (this.cm.options.indentWithTabs) {
        CodeMirror.commands.defaultTab(this.cm);
      } else {
        this.cm.tab_as_space();
      }
      return;
    }
    const pos = this.cm.cursorCoords(cur, "local");
    const top = pos.bottom;
    const { left } = pos;
    const gutter = $(this.cm.getGutterElement()).width();
    this.props.actions.complete(this.cm.getValue(), cur, this.props.id, {
      top,
      left,
      gutter
    });
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

  init_codemirror = (options: any, value: any): void => {
    const node = $(ReactDOM.findDOMNode(this)).find("textarea")[0]; // TODO: avoid findDOMNode
    if (node == null) {
      return;
    }
    const options0 = options.toJS();
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
    } else {
      options0.readOnly = true;
    }

    /*
        * Disabled for efficiency reasons:
        *   100% for speed reasons, we only use codemirror for cells with cursors
        *   or the active cell, so don't want to show a gutter.
        if options0.foldGutter
            options0.extraKeys["Ctrl-Q"] = (cm) -> cm.foldCodeSelectionAware()
            options0.gutters = ["CodeMirror-linenumbers", "CodeMirror-foldgutter"]  # TODO: if we later change options to disable folding, the gutter still remains in the editors.
        */

    this.cm = CodeMirror.fromTextArea(node, options0);
    this.cm.save = () => this.props.actions.save();
    if (this.props.actions != null && options0.keyMap === "vim") {
      this._vim_mode = true;
      this.cm.on("vim-mode-change", obj => {
        if (obj.mode === "normal") {
          // The timeout is because this must not be set when the general
          // keyboard handler for the whole editor gets called with escape.
          // This is ugly, but I'm not going to spend forever on this before
          // the #v1 release, as vim support is a bonus feature.
          setTimeout(
            () => this.props.actions.setState({ cur_cell_vim_mode: "escape" }),
            0
          );
        } else {
          this.props.actions.setState({ cur_cell_vim_mode: "edit" });
        }
      });
    } else {
      this._vim_mode = false;
    }

    const css: any = { height: "auto" };
    if (options0.theme == null) {
      css.backgroundColor = "#f7f7f7"; // this is what official jupyter looks like...
    }
    $(this.cm.getWrapperElement()).css(css);

    this._cm_last_remote = value;
    this.cm.setValue(value);

    this._cm_change = underscore.debounce(this._cm_save, SAVE_DEBOUNCE_MS);
    this.cm.on("change", this._cm_change);
    this.cm.on("focus", this._cm_focus);
    this.cm.on("blur", this._cm_blur);
    this.cm.on("cursorActivity", this._cm_cursor);

    // replace undo/redo by our sync aware versions
    this.cm.undo = this._cm_undo;
    this.cm.redo = this._cm_redo;

    if (this.props.actions != null) {
      const editor = {
        save: this._cm_save,
        set_cursor: this._cm_set_cursor,
        tab_key: this.tab_key
      };
      this.props.actions.register_input_editor(this.props.id, editor);
    }

    if (this.props.click_coords != null) {
      // editor clicked on, so restore cursor to that position
      this.cm.setCursor(this.cm.coordsChar(this.props.click_coords, "window"));
      this.props.set_click_coords(); // clear them
    } else if (this.props.last_cursor != null) {
      this.cm.setCursor(this.props.last_cursor);
      this.props.set_last_cursor();
    }

    // Finally, do a refresh in the next render loop, once layout is done.
    // See https://github.com/sagemathinc/cocalc/issues/2397
    // Note that this also avoids a significant disturbing flicker delay
    // even for non-raw cells.  This obviously probably slows down initial
    // load or switch to of the page, unfortunately.  Such is life.
    // CRITICAL: Also do the focus only after the refresh, or when
    // switching from static to non-static, whole page gets badly
    // repositioned (see https://github.com/sagemathinc/cocalc/issues/2548).
    setTimeout(() => {
      if (this.cm != null) {
        this.cm.refresh();
      }
      if (this.props.is_focused) {
        this.cm != null ? this.cm.focus() : undefined;
      }
    }, 1);
  };

  componentWillReceiveProps(nextProps: CodeMirrorEditorProps) {
    if (this.cm == null) {
      this.init_codemirror(nextProps.options, nextProps.value);
      return;
    }
    if (!this.props.options.equals(nextProps.options)) {
      this.update_codemirror_options(nextProps.options, this.props.options);
    }
    if (this.props.font_size !== nextProps.font_size) {
      this.cm.refresh();
    }
    if (nextProps.value !== this.props.value) {
      this._cm_merge_remote(nextProps.value);
    }
    if (nextProps.is_focused && !this.props.is_focused) {
      // gain focus
      if (this.cm != null) {
        this.cm.focus();
      }
    }
    if (!nextProps.is_focused && this._cm_is_focused) {
      // controlled loss of focus from store; we have to force
      // this somehow.  Note that codemirror has no .blur().
      // See http://codemirror.977696.n3.nabble.com/Blur-CodeMirror-editor-td4026158.html
      setTimeout(
        () => (this.cm != null ? this.cm.getInputField().blur() : undefined),
        1
      );
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
          <textarea />
        </div>
        {this.render_complete()}
      </div>
    );
  }
}
