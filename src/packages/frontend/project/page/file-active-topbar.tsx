/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Tabs for the open files in a project.
*/

import { CSS } from "@cocalc/frontend/app-framework";
import { COLORS } from "@cocalc/util/theme";

interface FileTabActiveFileTopbarProps {
  activeKey: string; // an empty string means there is no active file
  style?: CSS;
}

export function FileTabActiveFileTopbar({
  activeKey,
  style,
}: FileTabActiveFileTopbarProps) {
  return (
    <div
      style={{
        flex: "1",
        justifyContent: "center",
        paddingLeft: "5px",
        borderBottom: `1px solid ${COLORS.GRAY_L}`,
        ...style,
      }}
    >
      file: {activeKey}
    </div>
  );
}
