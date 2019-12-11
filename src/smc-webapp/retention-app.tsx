import * as React from "react";
import * as ReactDOM from "react-dom";
import { AppRedux } from "./app-framework";

export function render(_redux: AppRedux, opts: { escape: () => Promise<void> }) {
  function clean_up() {
    const element = document.getElementById("smc-react-container");
    if (element) {
      ReactDOM.unmountComponentAtNode(element);
    }
    opts.escape();
  }

  ReactDOM.render(
    <div
      style={{ width: "100vw", height: "100vh", background: "lavenderblush" }}
    >
      New hot application!
      <div
        style={{
          margin: "10px",
          width: "175px",
          height: "100px",
          background: "tomato"
        }}
        onClick={e => {
          e.preventDefault();
          clean_up();
        }}
      >
        Get me out of here!
      </div>
    </div>,
    document.getElementById("smc-react-container")
  );
}
