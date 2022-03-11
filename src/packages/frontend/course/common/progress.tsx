/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Progress indicator for assigning/collecting/etc. a particular assignment or handout.
*/

import { React, CSS } from "@cocalc/frontend/app-framework";
import { Icon, Space } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";

const progress_info: CSS = {
  color: COLORS.GRAY_D,
  marginLeft: "10px",
  whiteSpace: "normal",
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

export const Progress: React.FC<ProgressProps> = React.memo(
  (props: ProgressProps) => {
    const { done, not_done, step, skipped } = props;

    function render_checkbox() {
      if (not_done === 0) {
        return (
          <span style={{ fontSize: "12pt" }}>
            <Icon name="check-circle" />
            <Space />
          </span>
        );
      }
    }

    function render_status() {
      if (!skipped) {
        return (
          <>
            ({done} / {not_done + done} {step})
          </>
        );
      } else {
        return <>Skipped</>;
      }
    }

    function style(): CSS {
      if (not_done === 0) {
        return progress_info_done;
      } else {
        return progress_info;
      }
    }

    if (done == null || not_done == null || step == null) {
      return <span />;
    } else {
      return (
        <div style={style()}>
          {render_checkbox()}
          {render_status()}
        </div>
      );
    }
  }
);
