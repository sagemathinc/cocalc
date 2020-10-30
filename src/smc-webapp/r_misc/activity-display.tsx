/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSS, React } from "../app-framework";
import { is_different_array, len, trunc as trunc_string } from "smc-util/misc";
import { Icon } from "./icon";
import { CloseX } from "./close-x";

const ACTIVITY_STYLE = {
  float: "right",
  backgroundColor: "white",
  position: "absolute",
  right: "25px",
  top: "65px",
  border: "1px solid #ccc",
  padding: "10px",
  zIndex: 10,
  borderRadius: "5px",
  boxShadow: "3px 3px 3px #ccc",
} as CSS;

const ACTIVITY_ITEM_STYLE = {
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
} as CSS;

interface Props {
  activity: string[]; // only changing this causes re-render
  trunc?: number; // truncate activity messages at this many characters (default: 80)
  on_clear?: () => void; // if given, called when a clear button is clicked
  style?: CSS; // additional styles to be merged onto ACTIVITY_STYLE
}

export const ActivityDisplay: React.FC<Props> = React.memo(
  ({ activity, trunc, on_clear, style }) => {
    function render_items(): JSX.Element[] {
      const n = trunc ?? 80;
      const do_trunc = (s) => trunc_string(s, n);
      return activity.map((desc, i) => (
        <div key={i} style={ACTIVITY_ITEM_STYLE}>
          <Icon
            style={{ padding: "2px 1px 1px 2px" }}
            name="cc-icon-cocalc-ring"
            spin
          />{" "}
          {do_trunc(desc)}
        </div>
      ));
    }

    if (len(activity) > 0) {
      return (
        <div key="activity" style={{ ...ACTIVITY_STYLE, ...style }}>
          {on_clear && <CloseX on_close={on_clear} />}
          {render_items()}
        </div>
      );
    } else {
      return <></>;
    }
  },
  (prev, next) => !is_different_array(prev.activity, next.activity)
);
