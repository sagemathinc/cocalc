/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../app-framework";
import { TimeAgo } from "../r_misc";

interface CellTimingProps {
  start?: number;
  end?: number;
  state?: string;
}

export const CellTiming: React.FC<CellTimingProps> = (props) => {
  if (props.start === undefined) {
    return <span />; // TODO: should this return undefined?
  }
  if (props.end != null) {
    return <span>{(props.end - props.start) / 1000} seconds</span>;
  }
  return (
    <div style={{ float: "right" }}>
      <TimeAgo date={new Date(props.start)} />
    </div>
  );
};
