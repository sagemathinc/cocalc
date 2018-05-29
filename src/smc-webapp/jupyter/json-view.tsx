/*
Provide nice JSON view of the ipynb
*/

import { React, Component } from "../frame-editors/generic/react"; // TODO: this will move
import { Map as ImmutableMap } from "immutable";
import Inspector from "react-json-inspector";

const { Loading } = require("../r_misc"); // TODO: import types

interface JSONViewProps {
  actions: any; // TODO: type
  font_size?: number;
  // TODO: delete these?
  cells?: ImmutableMap<any,any>; // ipynb object depends on this
  kernel?: string; // ipynb object depends on this
}

export class JSONView extends Component<JSONViewProps> {
  render_desc() {
    const s = "Read-only view of notebook's underlying object structure.";
    return (
      <div
        style={{
          color: "#666",
          fontSize: "12pt",
          right: "15px",
          position: "absolute",
          background: "white"
        }}
      >
        {s}
      </div>
    );
  }
  render() {
    const data = this.props.actions.store.get_ipynb();
    if (data == null) {
      return <Loading />;
    }
    return (
      <div
        style={{
          fontSize: `${this.props.font_size}px`,
          paddingLeft: "20px",
          padding: "20px",
          backgroundColor: "#eee",
          height: "100%",
          overflowY: "auto",
          overflowX: "hidden"
        }}
      >
        <div
          style={{
            backgroundColor: "#fff",
            padding: "15px",
            boxShadow: "0px 0px 12px 1px rgba(87, 87, 87, 0.2)",
            position: "relative"
          }}
        >
          {this.render_desc()}
          <Inspector data={data} />
        </div>
      </div>
    );
  }
}
