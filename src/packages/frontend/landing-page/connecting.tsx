/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Icon } from "../components";
import { COLORS } from "@cocalc/util/theme";

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
      <Icon name="cocalc-ring" spin />{" "}
      Connecting...
    </div>
  );
}
