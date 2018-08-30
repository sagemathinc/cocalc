/*
Single codemirror-based file editor

This is a wrapper around a single codemirror editor view.
*/

const SAVE_INTERVAL_MS = 500;

import { delay } from "awaiting";

import { Map, Set } from "immutable";

import { is_safari } from "../generic/browser";
import * as CodeMirror from "codemirror";
import { React, ReactDOM, Rendered, Component } from "../../app-framework";

import { throttle, isEqual } from "underscore";

const misc = require("smc-util/misc");

const { Cursors } = require("smc-webapp/jupyter/cursors");

const { cm_options } = require("../codemirror/cm-options");
const codemirror_state = require("../codemirror/codemirror-state");
const doc = require("./doc");

const { GutterMarkers } = require("./codemirror-gutter-markers");

const STYLE = {
  width: "100%",
  overflow: "auto",
  marginbottom: "1ex",
  minheight: "2em",
  border: "0px",
  background: "#fff"
};

interface Props {
  id: string;
  actions: any;
  path: string;
  project_id: string;
  font_size: number;
  cursors: Map<string, any>;
  editor_state: Map<string, any>;
  read_only: boolean;
  is_current: boolean;
  is_public: boolean;
  value?: string; // if defined and is_public, use this static value and editor is read-only
  misspelled_words: Set<string>;
  resize: number;
  gutters: string[];
  gutter_markers: Map<string, any>;
  editor_settings: Map<string, any>;
}

interface State {
  has_cm: boolean;
}

export class CodemirrorEditor extends Component<Props, State> {
  private cm: CodeMirror.Editor;
  private style_active_line: boolean = false;
  static defaultProps = { value: "" };

  constructor(props) {
    super(props);
    this.state = { has_cm: false };
  }

  shouldComponentUpdate(props, state): boolean {
    return (
      misc.is_different(this.state, state, ["has_cm"]) ||
      misc.is_different(this.props, props, [
        "editor_settings",
        "font_size",
        "cursors",
        "read_only",
        "value",
        "is_public",
        "resize",
        "editor_state",
        "gutter_markers"
      ])
    );
  }

  componentDidMount(): void {
    this.init_codemirror(this.props);
  }

  componentWillReceiveProps(next: Props): void {
    if (this.props.font_size !== next.font_size) {
      this.cm_update_font_size();
    }
    if (this.cm == null) {
      return;
    }
    if (this.props.read_only !== next.read_only) {
      this.cm.setOption("readOnly", next.read_only);
    }
    if (this.props.is_public && this.props.value !== next.value) {
      if (next.value !== undefined) {
        // we really know that this will be undefined.
        this.cm.setValue(next.value);
      }
    }
    if (this.props.misspelled_words !== next.misspelled_words) {
      this.cm_highlight_misspelled_words(next.misspelled_words);
    }
    if (
      this.props.resize !== next.resize ||
      this.props.editor_state !== next.editor_state
    ) {
      this.cm_refresh();
    }
    if (this.props.editor_settings != next.editor_settings) {
      this.update_codemirror(next);
    }
  }

  _cm_refresh(): void {
    if (!this.cm) return;
    this.cm.refresh();
  }

  async cm_refresh(): Promise<void> {
    await delay(0);
    this._cm_refresh();
  }

  cm_highlight_misspelled_words(words: Set<string>): void {
    (this.cm as any).spellcheck_highlight(words.toJS());
  }

  cm_update_font_size(): void {
    if (!this.cm) return;
    // It's important to move the scroll position upon zooming -- otherwise the cursor line
    // move UP/DOWN after zoom, which is very annoying.
    const state = codemirror_state.get_state(this.cm);
    codemirror_state.set_state(this.cm, state);
  } // actual restore happens in next refresh cycle after render.

  componentWillUnmount(): void {
    if (this.cm != null && this.props.is_public == null) {
      this.save_editor_state();
      this.save_syncstring();
      this._cm_destroy();
    }
  }

  _cm_undo(): void {
    this.props.actions.undo(this.props.id);
  }

  _cm_redo(): void {
    this.props.actions.redo(this.props.id);
  }

  _cm_destroy(): void {
    if (this.cm == null) {
      return;
    }
    delete (this.cm as any).undo;
    delete (this.cm as any).redo;
    $(this.cm.getWrapperElement()).remove(); // remove from DOM -- "Remove this from your tree to delete an editor instance."  NOTE: there is still potentially a reference to the cm in this.props.actions._cm[id]; that's how we can bring back this frame (with given id) very efficiently.
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
      .map(c => ({ x: c.anchor.ch, y: c.anchor.line }));
    // side_effect is whether or not the cursor move is being caused by an
    // external setValueNoJump, so just a side effect of something another user did.
    const side_effect = (this.cm as any)._setValueNoJump;
    if (side_effect) {
      // cursor movement is a side effect of upstream change, so ignore.
      return;
    }
    this.props.actions.set_cursor_locs(locs);
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
    this.props.actions.set_syncstring_to_codemirror();
    this.props.actions.syncstring_save();
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

    const options = cm_options(
      props.path,
      props.editor_settings,
      props.gutters,
      props.actions,
      props.id
    );

    this.style_active_line = options.styleActiveLine;
    options.styleActiveLine = false;

    if (props.is_public) {
      options.readOnly = true;
    }

    // Needed e.g., for vim ":w" support; obviously this is global, so be careful.
    if ((CodeMirror as any).commands.save == null) {
      (CodeMirror as any).commands.save = function(cm: any) {
        if (cm._actions) {
          cm._actions.save(true);
        }
      };
    }

    let cm: CodeMirror.Editor = this.props.actions._cm[this.props.id];
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
      codemirror_state.set_state(this.cm, props.editor_state.toJS());
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
    await delay(0);
    // now in the next render loop
    this.cm_refresh();
    if (props.is_current && this.cm) {
      await delay(1); // just in case.
      this.cm.focus();
    }
  }

  init_new_codemirror(): void {
    (this.cm as any)._actions = this.props.actions;

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

    const save_editor_state = throttle(() => this.save_editor_state(), 250);
    this.cm.on("scroll", save_editor_state);

    const e = $(this.cm.getWrapperElement());
    e.addClass("smc-vfill");
    // The Codemirror themes impose their own weird fonts, but most users want whatever
    // they've configured as "monospace" in their browser.  So we force that back:
    e.attr(
      "style",
      e.attr("style") + "; height:100%; font-family:monospace !important;"
    );
    // see http://stackoverflow.com/questions/2655925/apply-important-css-style-using-jquery

    this.props.actions.set_cm(this.props.id, this.cm);

    if (this.props.is_public) {
      return;
    }

    // After this only stuff that we use for the non-public version!
    const save_syncstring_throttle = throttle(
      () => this.save_syncstring(),
      SAVE_INTERVAL_MS,
      { leading: false }
    );

    this.cm.on("change", (_, changeObj) => {
      save_syncstring_throttle();
      if (changeObj.origin != null && changeObj.origin !== "setValue") {
        this.props.actions.setState({ has_unsaved_changes: true });
        return this.props.actions.exit_undo_mode();
      }
    });

    this.cm.on("focus", () => {
      this.props.actions.set_active_id(this.props.id);
      if (this.style_active_line && this.cm) {
        this.cm.setOption("styleActiveLine", true);
      }
    });

    this.cm.on("blur", () => {
      if (this.style_active_line && this.cm) {
        this.cm.setOption("styleActiveLine", false);
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
    if (!this.cm) {
      return;
    }
    if (!options) {
      options = cm_options(
        props.path,
        props.editor_settings,
        props.gutters,
        props.actions,
        props.id
      );
    }

    let cm = this.cm;
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
      "theme"
    ]) {
      if (!isEqual(cm.options[key], options[key])) {
        cm.setOption(key, options[key]);
      }
    }
  }

  render_cursors(): Rendered {
    if (this.props.cursors != null && this.cm != null && this.state.has_cm) {
      // Very important not to render without cm defined, because that renders
      // to static Codemirror instead.
      return <Cursors cursors={this.props.cursors} codemirror={this.cm} />;
    }
  }

  render_gutter_markers(): Rendered {
    if (!this.state.has_cm || this.props.gutter_markers == null) {
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

  render(): Rendered {
    const style = misc.copy(STYLE);
    style.fontSize = `${this.props.font_size}px`;
    return (
      <div style={style} className="smc-vfill cocalc-editor-div">
        {this.render_cursors()}
        {this.render_gutter_markers()}
        <textarea ref="textarea" style={{ display: "none" }} />
      </div>
    );
  }
}
