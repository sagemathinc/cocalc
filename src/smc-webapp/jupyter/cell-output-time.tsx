/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../app-framework";

import { TimeAgo, A, Icon } from "../r_misc";

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
      <br />
      {(props.state == null || props.state == "done") && (
        <A
          href="https://doc.cocalc.com/howto/jupyter-kernel-terminated.html"
          style={{
            display: "inline-block",
            background: "red",
            color: "white",
            padding: "0 5px",
          }}
        >
          <Icon name="skull" /> Kernel killed...
        </A>
      )}
    </div>
  );
};
