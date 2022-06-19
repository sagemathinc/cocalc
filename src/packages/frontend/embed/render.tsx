/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import ReactDOM from "react-dom";

export async function render(): Promise<void> {
  finishedLoading();
  const elt = document.getElementById("cocalc-webapp-container");
  if (elt != null) {
    ReactDOM.render(
      <div>
        <h1>Hello From Embed</h1>
      </div>,
      elt
    );
  }
}

// When loading is done, remove any visible artifacts.
// This doesn't remove anything added to the head.
function finishedLoading() {
  const load = document.getElementById("cocalc-load-container");
  if (load != null) {
    load.innerHTML = "";
  }
}
