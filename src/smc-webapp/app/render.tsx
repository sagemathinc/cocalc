/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, ReactDOM, Redux } from "../app-framework";
import { Page } from "./page";

export function render(): void {
  ReactDOM.render(
    <Redux>
      <Page />
    </Redux>,
    document.getElementById("smc-react-container")
  );
}
