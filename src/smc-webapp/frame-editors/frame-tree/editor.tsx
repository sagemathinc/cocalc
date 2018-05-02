import { React, rclass, rtypes, Component, Rendered } from "../generic/react";

// import { Editor as CodeEditor } from "../code-editor/editor";
const CodeEditor = require("../code-editor/editor").Editor;

import { FormatBar } from "./format-bar.tsx";

interface FrameTreeEditorProps {
  actions: any;
  path: string;
  project_id: string;
  format_bar: boolean;
  editor_spec: any;

  // reduxProps:
  name: string;
  editor_settings?: Map<string, any>;
  is_public?: boolean;
}

class FrameTreeEditor extends Component<FrameTreeEditorProps, {}> {
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
      this.props.format_bar &&
      !this.props.is_public &&
      this.props.editor_settings &&
      this.props.editor_settings.get("extra_button_bar")
    )
      return <FormatBar actions={this.props.actions} extension={"html"} />;
  }

  render_editor(): Rendered {
    return (
      <CodeEditor
        name={this.props.name}
        actions={this.props.actions}
        path={this.props.path}
        project_id={this.props.project_id}
        editor_spec={this.props.editor_spec}
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

const tmp = rclass(FrameTreeEditor);
export { tmp as FrameTreeEditor };

interface Options {
  display_name: string;
  format_bar: boolean;
  editor_spec: any;
}

interface EditorProps {
  actions: any;
  name: string;
  path: string;
  project_id: string;
}

export function createEditor(opts: Options) {
  class Editor extends Component<EditorProps, {}> {
    public displayName: string = opts.display_name;

    render(): Rendered {
      return (
        <FrameTreeEditor
          actions={this.props.actions}
          name={this.props.name}
          path={this.props.path}
          project_id={this.props.project_id}
          format_bar={opts.format_bar}
          editor_spec={opts.editor_spec}
        />
      );
    }
  }
  return Editor;
}
