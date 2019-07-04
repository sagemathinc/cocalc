import * as React from "react";
import * as ReactDOM from "react-dom";

const page = <div> This is from react! </div>;

export function render_app() {
  ReactDOM.render(page, document.getElementById("cocalc-react-container"));
}
