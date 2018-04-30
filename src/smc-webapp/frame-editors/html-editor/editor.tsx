/*
Top-level react component for editing HTML documents
*/

import { React, rclass, rtypes, Component, Rendered } from "../generic/react";

//import { FormatBar } from "../markdown-editor/format-bar";
const { FormatBar } = require("../markdown-editor/format-bar");

//import { Editor, set } from "../code-editor/editor";
const { Editor, set } = require("../code-editor/editor");

import { QuickHTMLPreview } from "./rendered-html.tsx";

import { IFrameHTML } from "./iframe-html.tsx";

//import { CodemirrorEditor } from "../code-editor/codemirror-editor";
const { CodemirrorEditor } = require("../code-editor/codemirror-editor");

const EDITOR_SPEC = {
  cm: {
    short: "Code",
    name: "Source Code",
    icon: "code",
    component: CodemirrorEditor,
    buttons: set([
      "print",
      "decrease_font_size",
      "increase_font_size",
      "save",
      "time_travel",
      "replace",
      "find",
      "goto_line",
      "cut",
      "paste",
      "copy",
      "undo",
      "redo",
      "reload",
      "auto_indent"
    ])
  },
  iframe: {
    short: "HTML",
    name: "HTML IFrame",
    icon: "compass",
    component: IFrameHTML,
    buttons: set([
      "print",
      "save",
      "time_travel",
      "reload",
      "decrease_font_size",
      "increase_font_size"
    ])
  },

  preview: {
    short: "Preview",
    name: "Quick Preview",
    icon: "html5",
    component: QuickHTMLPreview,
    buttons: set([
      "print",
      "decrease_font_size",
      "increase_font_size",
      "save",
      "time_travel",
      "reload"
    ])
  }
};

interface EditorProps {
  actions: any;
  path: string;
  project_id: string;

  // reduxProps:
  name: string;
  editor_settings: Map<string, any>;
  is_public: boolean;
}

class HTMLEditor extends Component<EditorProps, {}> {
  static reduxProps({ name }) {
    return {
      account: {
        editor_settings: rtypes.immutable.Map
      },
      [name]: {
        is_public: rtypes.bool
      }
    };
  }

  shouldComponentUpdate(next): boolean {
    if (!this.props.editor_settings) return false;
    return (
      this.props.editor_settings.get("extra_button_bar") !==
      next.editor_settings.get("extra_button_bar")
    );
  }

  render_format_bar(): Rendered {
    if (
      !this.props.is_public &&
      this.props.editor_settings &&
      this.props.editor_settings.get("extra_button_bar")
    )
      return <FormatBar actions={this.props.actions} extension={"html"} />;
  }

  render_editor(): Rendered {
    return (
      <Editor
        name={this.props.name}
        actions={this.props.actions}
        path={this.props.path}
        project_id={this.props.project_id}
        editor_spec={EDITOR_SPEC}
      />
    );
  }

  render(): Rendered {
    return (
      <div className="smc-vfill">
        {this.render_format_bar()}
        {this.render_editor()}
      </div>
    );
  }
}

const tmp = rclass(HTMLEditor);
export { tmp as HTMLEditor };
