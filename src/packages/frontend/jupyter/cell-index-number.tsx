/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Tooltip } from "antd";

import { numToOrdinal } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";

export function CellIndexNumber({ index }: { index: number }): React.JSX.Element {
  return (
    <Tooltip
      placement="top"
      title={`This is the ${numToOrdinal(index + 1)} cell in the notebook.`}
    >
      <div
        style={{
          marginLeft: "1px",
          padding: "4px 5px 4px 6px",
          borderLeft: `1px solid ${COLORS.GRAY_L}`,
        }}
      >
        {index + 1}
      </div>
    </Tooltip>
  );
}
