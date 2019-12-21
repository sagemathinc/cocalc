/*
Raw editable view of .ipynb file json, including metadata.

WARNING:  There are many similarities between the code in this file and in
the file codemirror-editor.cjsx, and also many differences.  Part of the
subtlely comes from editing JSON, but not saving when state is invalid.
*/

import { delay } from "awaiting";
import { React, Component, rclass, rtypes } from "../app-framework";
import { List, Map } from "immutable";
import { JSONEditor } from "./json-editor";
import { JupyterActions } from "./browser-actions";
import { Loading } from "../r_misc";
import { is_different } from "smc-util/misc";

interface RawEditorProps {
  name: string;
  actions: JupyterActions;
  font_size: number;
  cm_options: Map<string, any>;
}

interface ReduxProps {
  // we ONLY want to update raw_ipynb when the things it depends on change **and**
  // this component is mounted, since it can be very expensive to update.
  raw_ipynb?: Map<string, any>;

  // This is more or less what raw_ipynb depends on, according to store.ts:
  cells?: Map<string, any>;
  cell_list?: List<string>;
  metadata?: Map<string, any>;
  kernel?: string;
}

class RawEditor0 extends Component<RawEditorProps & ReduxProps> {
  public static reduxProps({ name }) {
    return {
      [name]: {
        raw_ipynb: rtypes.immutable.Map,
        cells: rtypes.immutable.Map,
        cell_list: rtypes.immutable.List,
        metadata: rtypes.immutable.Map,
        kernel: rtypes.string
      }
    };
  }

  private async update_raw_ipynb(): Promise<void> {
    // This action must be called later since it may change
    // state.
    await delay(0);
    this.props.actions.set_raw_ipynb();
  }

  shouldComponentUpdate(nextProps) {
    if (
      is_different(this.props, nextProps, [
        "cells",
        "cell_list",
        "metadata",
        "kernel"
      ])
    ) {
      this.update_raw_ipynb();
    }
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
        This is an editable view IPynb notebook's underlying .ipynb file (images
        are replaced by sha1 hashes).
      </div>
    );
  }

  on_change = (obj: any) => this.props.actions.set_to_ipynb(obj);

  render_editor() {
    if (this.props.raw_ipynb == null) {
      return <Loading />;
    }
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
      overflowX: "hidden"
    };

    const viewer_style: React.CSSProperties = {
      backgroundColor: "#fff",
      boxShadow: "0px 0px 12px 1px rgba(87, 87, 87, 0.2)",
      height: "100%"
    };

    return (
      <div style={style}>
        <div style={viewer_style}>{this.render_editor()}</div>
      </div>
    );
  }
}

export const RawEditor = rclass(RawEditor0);
