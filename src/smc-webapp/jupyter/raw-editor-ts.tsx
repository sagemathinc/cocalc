/*
Raw editable view of .ipynb file json, including metadata.

WARNING:  There are many similarities between the code in this file and in
the file codemirror-editor.cjsx, and also many differences.  Part of the
subtlely comes from editing JSON, but not saving when state is invalid.
*/

import { React, Component } from "../frame-editors/generic/react"; // TODO: this will move
import { Map as ImmutableMap } from "immutable";
const { JSONEditor } = require("./json-editor");

interface RawEditorProps {
  actions: any;
  font_size: number;
  raw_ipynb: ImmutableMap<any, any>;
  cm_options: ImmutableMap<any, any>;
}

export class RawEditor extends Component<RawEditorProps> {
  shouldComponentUpdate(nextProps) {
    return (
      this.props.font_size !== nextProps.font_size ||
      this.props.raw_ipynb !== nextProps.raw_ipynb ||
      this.props.cm_options !== nextProps.cm_options
    );
  }

  // TODO: unused
  render_desc() {
    return (
      <div style={{ color: "#666", fontSize: "12pt", marginBottom: "15px" }}>
        This is an editable view IPynb notebook's underlying .ipynb file (images are replaced by
        sha1 hashes).
      </div>
    );
  }

  on_change = (obj: any) => this.props.actions.set_to_ipynb(obj);

  render_editor() {
    return (
      <JSONEditor
        value={this.props.raw_ipynb}
        font_size={this.props.font_size}
        on_change={this.on_change}
        cm_options={this.props.cm_options}
        undo={this.props.actions.undo}
        redo={this.props.actions.redo}
      />
    );
  }

  render() {
    const style: React.CSSProperties = {
      fontSize: `${this.props.font_size}px`,
      backgroundColor: "#eee",
      height: "100%",
      overflowY: "auto",
      overflowX: "hidden",
    };

    const viewer_style: React.CSSProperties = {
      backgroundColor: "#fff",
      boxShadow: "0px 0px 12px 1px rgba(87, 87, 87, 0.2)",
      height: "100%",
    };

    return (
      <div style={style}>
        <div style={viewer_style}>{this.render_editor()}</div>
      </div>
    );
  }
}
