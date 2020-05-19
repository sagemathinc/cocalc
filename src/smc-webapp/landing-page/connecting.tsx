/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../app-framework";

import { COLORS, Icon } from "../r_misc";

export function Connecting(_props) {
  return (
    <div
      style={{
        fontSize: "25px",
        marginTop: "75px",
        textAlign: "center",
        color: COLORS.GRAY,
      }}
    >
      <Icon name="cc-icon-cocalc-ring" spin />{" "}
      Connecting...
    </div>
  );
}
