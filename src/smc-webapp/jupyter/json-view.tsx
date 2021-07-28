/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Provide nice JSON view of the ipynb
*/

// NOTE: this react-json-view **does** support editing, but the editing isn't great,
// and using codemirror directly is better for *editing*.
// react-json-view is very nice for viewing.
import ReactJson from "react-json-view";
import { React } from "../app-framework";
import { JupyterActions } from "./browser-actions";
import { Loading } from "../r_misc";

interface JSONViewProps {
  actions: JupyterActions;
  font_size?: number;
}

export const JSONView: React.FC<JSONViewProps> = ({
  actions,
  font_size,
}: JSONViewProps) => {
  const data = actions.store.get_ipynb();

  if (data == null) {
    return <Loading />;
  }

  return (
    <div
      style={{
        fontSize: `${font_size}px`,
        paddingLeft: "20px",
        padding: "20px",
        backgroundColor: "#eee",
        height: "100%",
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      <div
        style={{
          backgroundColor: "#fff",
          padding: "15px",
          boxShadow: "0px 0px 12px 1px rgba(87, 87, 87, 0.2)",
          position: "relative",
        }}
      >
        <div
          style={{
            color: "#666",
            fontSize: "12pt",
            padding: "5px",
            float: "right",
            background: "white",
            borderBottom: "1px solid lightgrey",
            borderLeft: "1px solid lightgrey",
          }}
        >
          Read-only view of notebook's underlying object structure.
        </div>
        <ReactJson src={data} />
      </div>
    </div>
  );
};
