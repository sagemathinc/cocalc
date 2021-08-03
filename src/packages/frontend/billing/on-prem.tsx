/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../app-framework";
const { HelpEmailLink } = require("../customize");
import { A } from "../r_misc";

export const ON_PREM_TEXT = (
  <React.Fragment>
    <h3>
      Commercial On-Premises
      <sup>
        <i>beta</i>
      </sup>
    </h3>
    <div>
      Contact us at <HelpEmailLink /> for questions about our{" "}
      <A href="https://github.com/sagemathinc/cocalc-docker/blob/master/README.md">
        commercial on premises
      </A>{" "}
      offerings.
    </div>
  </React.Fragment>
);

export const OnPrem: React.FC<{}> = () => {
  function render_intro() {
    return (
      <div style={{ marginBottom: "10px" }}>
        <a id="onprem" />
        {ON_PREM_TEXT}
      </div>
    );
  }

  return render_intro();
};
