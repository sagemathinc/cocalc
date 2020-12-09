/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Single codemirror-based file editor

This is a wrapper around a single codemirror editor view.
*/

const SAVE_DEBOUNCE_MS = 1500;

import { Map, Set } from "immutable";

import { is_safari } from "../generic/browser";
import * as CodeMirror from "codemirror";
import { React, ReactDOM, Rendered, CSS, Component } from "../../app-framework";

import { debounce, throttle, isEqual } from "underscore";

import { copy, is_different, filename_extension } from "smc-util/misc";

import { Cursors } from "smc-webapp/jupyter/cursors";

import { cm_options } from "../codemirror/cm-options";
import { init_style_hacks } from "../codemirror/util";
import * as codemirror_state from "../codemirror/codemirror-state";
import * as doc from "./doc";

import { GutterMarkers } from "./codemirror-gutter-markers";

import { CodeEditor } from "./code-editor-manager";
import { Actions } from "./actions";
import { Icon } from "../../r_misc";
import { file_associations } from "../../file-associations";
import { EditorState } from "../frame-tree/types";

const STYLE = {
  width: "100%",
  overflow: "auto",
  marginbottom: "1ex",
  minheight: "2em",
  border: "0px",
  background: "#fff",
} as CSS;

interface Props {
  id: string;
  actions: any;
  path: string;
  project_id: string;
  font_size: number;
  cursors: Map<string, any>;
  editor_state: EditorState;
  read_only: boolean;
  is_current: boolean;
  is_public: boolean;
  value?: string; // if defined and is_public, use this static value and editor is read-only
  misspelled_words: Set<string> | string; // **or** show these words as not spelled correctly
  resize: number;
  gutters: string[];
  gutter_markers: Map<string, any>;
  editor_settings: Map<string, any>;
  is_subframe?: boolean;
}

interface State {
  has_cm: boolean;
}

export class CodemirrorEditor extends Component<Props, State> {
  private cm?: CodeMirror.Editor;
  private style_active_line: boolean = false;
  static defaultProps = { value: "" };
  private manager?: CodeEditor;
  private editor_actions: Actions;

  constructor(props) {
    super(props);
    this.state = { has_cm: false };
    if (props.is_subframe && this.props.actions != null) {
      this.manager = this.props.actions.get_code_editor(this.props.id);
      if (this.manager == null) throw Error("BUG");
      this.editor_actions = this.manager.get_actions();
    } else {
      this.editor_actions = this.props.actions;
    }
  }

  shouldComponentUpdate(props, state): boolean {
    return (
      is_different(this.state, state, ["has_cm"]) ||
      is_different(this.props, props, [
        "editor_settings",
        "font_size",
        "cursors",
        "read_only",
        "value",
        "is_public",
        "resize",
        "editor_state",
        "gutter_markers",
        "is_subframe",
        "is_current",
        "path",
      ])
    );
  }

  componentDidMount(): void {
    this.init_codemirror(this.props);
  }

  componentWillReceiveProps(next: Props): void {
    if (this.cm == null) {
      return;
    }
    if (this.props.font_size !== next.font_size) {
      this.cm_update_font_size();
    }
    if (this.props.read_only !== next.read_only) {
      this.cm.setOption("readOnly", next.read_only);
    }
    if (this.props.is_public && this.props.value !== next.value) {
      if (next.value !== undefined) {
        // we really know that this will be undefined.
        this.cm.setValueNoJump(next.value);
      }
    }
    if (this.props.misspelled_words !== next.misspelled_words) {
      this.cm_highlight_misspelled_words(next.misspelled_words);
    }
    if (this.props.resize !== next.resize) {
      this.cm_refresh();
    }
    if (this.props.editor_settings != next.editor_settings) {
      this.update_codemirror(next);
    }
  }

  private cm_refresh(): void {
    if (this.cm == null) return;
    this.cm.refresh();
  }

  cm_highlight_misspelled_words(words: Set<string> | string): void {
    if (this.cm == null) return;
    if (words == "browser") {
      // just ensure browser spellcheck is enabled
      this.cm.setOption("spellcheck", true);
      (this.cm as any).spellcheck_highlight([]);
      return;
    }
    if (words == "disabled") {
      // disabled
      this.cm.setOption("spellcheck", false);
      (this.cm as any).spellcheck_highlight([]);
      return;
    }
    if (typeof words == "string") {
      // not supported yet
      console.warn("unsupported words option", words);
      return;
    }
    this.cm.setOption("spellcheck", false);
    (this.cm as any).spellcheck_highlight(words.toJS());
  }

  cm_update_font_size(): void {
    if (this.cm == null) return;
    // It's important to move the scroll position upon zooming -- otherwise the cursor line
    // move UP/DOWN after zoom, which is very annoying.
    const state = codemirror_state.get_state(this.cm);
    // actual restore happens in next refresh cycle after render.
    if (state != null) codemirror_state.set_state(this.cm, state);
  }

  componentWillUnmount(): void {
    if (this.cm != null && this.props.is_public == null) {
      this.save_editor_state();
      this.save_syncstring();
      this._cm_destroy();
    }
  }

  _cm_undo(): void {
    this.editor_actions.undo(this.props.id);
  }

  _cm_redo(): void {
    this.editor_actions.redo(this.props.id);
  }

  _cm_destroy(): void {
    if (this.cm == null) {
      return;
    }
    delete (this.cm as any).undo;
    delete (this.cm as any).redo;
    $(this.cm.getWrapperElement()).remove(); // remove from DOM -- "Remove this from your tree to delete an editor instance."  NOTE: there is still potentially a reference to the cm in actions._cm[id]; that's how we can bring back this frame (with given id) very efficiently.
    delete this.cm;
  }

  _cm_cursor(): void {
    if (!this.props.is_current) {
      // not in focus, so any cursor movement is not to be broadcast.
      return;
    }
    if (this.cm == null) {
      // not yet done initializing/mounting or already unmounting,
      // so nothing to do.
      return;
    }
    const locs = this.cm
      .getDoc()
      .listSelections()
      .map((c) => ({ x: c.anchor.ch, y: c.anchor.line }));
    // side_effect is whether or not the cursor move is being caused by an
    // external setValueNoJump, so just a side effect of something another user did.
    const side_effect = (this.cm as any)._setValueNoJump;
    if (side_effect) {
      // cursor movement is a side effect of upstream change, so ignore.
      return;
    }
    this.editor_actions.set_cursor_locs(locs);
  }

  // Save the UI state of the CM (not the actual content) -- scroll position, selections, etc.
  save_editor_state(): void {
    if (this.cm == null) {
      return;
    }
    const state = codemirror_state.get_state(this.cm);
    if (state != null) {
      this.props.actions.save_editor_state(this.props.id, state);
    }
  }

  // Save the underlying syncstring content.
  save_syncstring(): void {
    if (this.cm == null || this.props.is_public) {
      return;
    }
    this.editor_actions.set_syncstring_to_codemirror();
    this.editor_actions.syncstring_commit();
  }

  safari_hack(): void {
    if (is_safari()) {
      $(ReactDOM.findDOMNode(this)).make_height_defined();
    }
  }

  async init_codemirror(props: Props): Promise<void> {
    const node: HTMLTextAreaElement = ReactDOM.findDOMNode(this.refs.textarea);
    if (node == null) {
      return;
    }

    this.safari_hack();

    const options: any = cm_options(
      props.path,
      props.editor_settings,
      props.gutters,
      this.editor_actions,
      props.actions,
      props.id
    );
    if (options == null) throw Error("bug"); // make typescript happy.

    // we will explicitly enable and disable styleActiveLine depending focus
    this.style_active_line = options.styleActiveLine;
    options.styleActiveLine = false;

    if (props.is_public) {
      options.readOnly = true;
    }

    if (options.extraKeys == null) {
      options.extraKeys = {};
    }

    options.extraKeys["Tab"] = this.tab_key;
    // options.extraKeys["Shift-Tab"] = this.shift_tab_key;
    // options.extraKeys["Up"] = this.up_key;
    // options.extraKeys["Down"] = this.down_key;
    // options.extraKeys["PageUp"] = this.page_up_key;
    // options.extraKeys["PageDown"] = this.page_down_key;
    options.extraKeys["Cmd-/"] = "toggleComment";
    options.extraKeys["Ctrl-/"] = "toggleComment";

    // Needed e.g., for vim ":w" support; obviously this is global, so be careful.
    if ((CodeMirror as any).commands.save == null) {
      (CodeMirror as any).commands.save = (cm: any) => {
        this.props.actions.explicit_save();
        if (cm._actions) {
          cm._actions.save(true);
        }
      };
    }

    const cm: CodeMirror.Editor = (this.editor_actions as any)._cm[
      this.props.id
    ];
    if (cm != undefined) {
      // Reuse existing codemirror editor, rather
      // than creating a new one -- faster and preserves
      // state such as code folding.
      if (!this.cm) {
        this.cm = cm;
        if (!node.parentNode) {
          // this never happens, but is needed for typescript.
          return;
        }
        node.parentNode.insertBefore(cm.getWrapperElement(), node.nextSibling);
        this.update_codemirror(props, options);
      }
    } else {
      this.cm = CodeMirror.fromTextArea(node, options);
      this.init_new_codemirror();
    }

    if (props.editor_state != null) {
      codemirror_state.set_state(this.cm, props.editor_state.toJS() as any);
    }

    if (!props.is_public) {
      this.cm_highlight_misspelled_words(props.misspelled_words);
    }

    this.setState({ has_cm: true });

    if (props.is_current) {
      this.cm.focus();
    }
    this.cm.setOption("readOnly", props.read_only);
    this.cm_refresh();
  }

  init_new_codemirror(): void {
    if (this.cm == null) return;
    (this.cm as any)._actions = this.editor_actions;

    if (this.props.is_public) {
      if (this.props.value !== undefined) {
        // should always be the case if public.
        this.cm.setValue(this.props.value);
      }
    } else {
      if (!doc.has_doc(this.props.project_id, this.props.path)) {
        // save it to cache so can be used by other components/editors
        doc.set_doc(this.props.project_id, this.props.path, this.cm);
      } else {
        // has it already, so use that.
        this.cm.swapDoc(
          doc.get_linked_doc(this.props.project_id, this.props.path)
        );
      }
    }

    const save_editor_state = throttle(() => this.save_editor_state(), 150);
    this.cm.on("scroll", save_editor_state);
    init_style_hacks(this.cm);

    this.editor_actions.set_cm(this.props.id, this.cm);

    if (this.props.is_public) {
      return;
    }

    // After this only stuff that we use for the non-public version!
    const save_syncstring_debounce = debounce(
      () => this.save_syncstring(),
      SAVE_DEBOUNCE_MS
    );

    this.cm.on("change", (_, changeObj) => {
      save_syncstring_debounce();
      if (changeObj.origin != null && changeObj.origin !== "setValue") {
        this.editor_actions.exit_undo_mode();
      }
    });

    this.cm.on("focus", () => {
      this.props.actions.set_active_id(this.props.id);
      if (this.style_active_line && this.cm) {
        // any because the typing doesn't recognize extensions
        this.cm.setOption("styleActiveLine" as any, true);
      }
    });

    this.cm.on("blur", () => {
      if (this.style_active_line && this.cm) {
        this.cm.setOption("styleActiveLine" as any, false);
      }
    });

    this.cm.on("cursorActivity", () => {
      this._cm_cursor();
      save_editor_state();
    });

    // replace undo/redo by our sync aware versions
    (this.cm as any).undo = () => this._cm_undo();
    (this.cm as any).redo = () => this._cm_redo();
  }

  update_codemirror(props: Props, options?): void {
    if (this.cm == null) return;
    if (!options) {
      options = cm_options(
        props.path,
        props.editor_settings,
        props.gutters,
        this.editor_actions,
        props.actions,
        props.id
      );
    }

    const cm = this.cm;
    let key: string;
    for (key of [
      "lineNumbers",
      "showTrailingSpace",
      "indentUnit",
      "tabSize",
      "smartIndent",
      "electricChars",
      "matchBrackets",
      "autoCloseBrackets",
      "autoCloseLatex",
      "leanSymbols",
      "lineWrapping",
      "indentWithTabs",
      "theme",
    ]) {
      if (!isEqual(cm.options[key], options[key])) {
        cm.setOption(key as any, options[key]);
      }
    }
  }

  tab_nothing_selected = (): void => {
    if (this.cm == null) return;
    const cursor = this.cm.getDoc().getCursor();
    if (
      cursor.ch === 0 ||
      /\s/.test(this.cm.getDoc().getLine(cursor.line)[cursor.ch - 1])
    ) {
      // whitespace before cursor -- just do normal tab
      if (this.cm.options.indentWithTabs) {
        (CodeMirror as any).commands.defaultTab(this.cm);
      } else {
        (this.cm as any).tab_as_space();
      }
      return;
    }
    // Do completion at cursor.
    this.complete_at_cursor();
  };

  tab_key = (): void => {
    if (this.cm == null) return;
    if ((this.cm as any).somethingSelected()) {
      (CodeMirror as any).commands.defaultTab(this.cm);
    } else {
      this.tab_nothing_selected();
    }
  };

  // Do completion at the current cursor position -- this uses
  // the codemirror plugin, which can be configured with lots of
  // ways of completing -- see "show-hint.js" at
  // https://codemirror.net/doc/manual.html#addons
  complete_at_cursor = (): void => {
    if (this.cm == null) return;
    this.cm.execCommand("autocomplete");
  };

  render_cursors(): Rendered {
    if (this.props.cursors != null && this.cm != null && this.state.has_cm) {
      // Very important not to render without cm defined, because that renders
      // to static Codemirror instead.
      return <Cursors cursors={this.props.cursors} codemirror={this.cm} />;
    }
  }

  render_gutter_markers(): Rendered {
    if (
      !this.state.has_cm ||
      this.props.gutter_markers == null ||
      this.cm == null
    ) {
      return;
    }
    return (
      <GutterMarkers
        gutter_markers={this.props.gutter_markers}
        codemirror={this.cm}
        set_handle={(id, handle) =>
          this.props.actions._set_gutter_handle(id, handle)
        }
      />
    );
  }

  private click_on_path(evt): void {
    if (!evt.shiftKey) return;
    const project_actions = this.props.actions._get_project_actions();
    project_actions.open_file({ path: this.props.path, foreground: true });
  }

  // todo: move this render_path to a component in a separate file.
  render_path(): Rendered {
    const style: any = {
      borderBottom: "1px solid lightgrey",
      borderRight: "1px solid lightgrey",
      padding: "0 5px",
      borderTopLeftRadius: "5px",
      borderTopRightRadius: "5px",
      color: "#337ab7",
      cursor: "pointer",
      width: "100%",
      fontSize: "10pt",
    };
    if (this.props.is_current) {
      style.background = "#337ab7";
      style.color = "white";
    }
    const ext = filename_extension(this.props.path);
    const x = file_associations[ext];
    let icon: any = undefined;
    if (x != null && x.icon != null) {
      icon = <Icon name={x.icon} />;
    }
    return (
      <div style={style} onClick={this.click_on_path.bind(this)}>
        {icon} {this.props.path}
      </div>
    );
  }

  render(): Rendered {
    const style = copy(STYLE);
    style.fontSize = `${this.props.font_size}px`;
    return (
      <div className="smc-vfill cocalc-editor-div">
        {this.render_path()}
        <div style={style} className="smc-vfill">
          {this.render_cursors()}
          {this.render_gutter_markers()}
          <textarea ref="textarea" style={{ display: "none" }} />
        </div>
      </div>
    );
  }
}
