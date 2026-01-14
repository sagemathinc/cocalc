/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Progress indicator for assigning/collecting/etc. a particular assignment or handout.
*/

import { Space } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";

const progress_info = {
  color: COLORS.GRAY_D,
  paddingLeft: "5px",
} as const;

const progress_info_done = {
  ...progress_info,
  color: COLORS.BS_GREEN_DD,
} as const;

interface ProgressProps {
  done: number;
  not_done: number;
  step: string;
  skipped?: boolean;
}

export function Progress({ done, not_done, step, skipped }: ProgressProps) {
  if (done == null || not_done == null || step == null) return <span />;
  const style = not_done === 0 ? progress_info_done : progress_info;
  return (
    <Space style={style}>
      <Icon name={not_done === 0 ? "check-circle" : "pie-chart"} />
      {skipped ? "Skipped" : `${done} / ${not_done + done}`}
    </Space>
  );
}
