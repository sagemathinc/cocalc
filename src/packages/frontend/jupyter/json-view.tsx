/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Provide nice JSON view of the ipynb
*/

// NOTE: this react-json-view **does** support editing, but the editing isn't great,
// and using codemirror directly is better for *editing*.
// react-json-view is very nice for viewing.
import ReactJson from "@microlink/react-json-view";
import { React } from "../app-framework";
import { JupyterActions } from "./browser-actions";
import { Loading } from "../components";

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
        backgroundColor: "var(--cocalc-bg-hover, #eee)",
        height: "100%",
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      <div
        style={{
          backgroundColor: "var(--cocalc-bg-base, #fff)",
          padding: "15px",
          boxShadow: "0px 0px 12px 1px rgba(87, 87, 87, 0.2)",
          position: "relative",
        }}
      >
        <div
          style={{
            color: "var(--cocalc-text-secondary, #666)",
            fontSize: "12pt",
            padding: "5px",
            float: "right",
            background: "white",
            borderBottom: "1px solid var(--cocalc-border-light, lightgray)",
            borderLeft: "1px solid var(--cocalc-border-light, lightgray)",
          }}
        >
          Read-only view of notebook's underlying object structure.
        </div>
        <ReactJson src={data} />
      </div>
    </div>
  );
};
