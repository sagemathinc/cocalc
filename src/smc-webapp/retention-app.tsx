import * as React from "react";
import * as ReactDOM from "react-dom";
import { AppRedux } from "./app-framework";

import { App } from "./single-file-app";

export function render(
  redux: AppRedux,
  opts: { escape: () => Promise<void> }
): void {
  function clean_up(): void {
    const element = document.getElementById("smc-react-container");
    if (element) {
      ReactDOM.unmountComponentAtNode(element);
    }
    opts.escape();
  }

  ReactDOM.render(
    <App go_to_main_app={clean_up} redux={redux} />,
    document.getElementById("smc-react-container")
  );
}
