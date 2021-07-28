/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, Rendered } from "smc-webapp/app-framework";
import { Map } from "immutable";
import { endswith } from "smc-util/misc";
import { Ansi } from "./ansi";
import { TRACEBACK_STYLE } from "./style";

interface TracebackProps {
  message: Map<string, any>;
}

function should_memoize(prev, next) {
  return prev.message.equals(next.message);
}

export const Traceback: React.FC<TracebackProps> = React.memo(
  (props: TracebackProps) => {
    const { message } = props;

    const v: Rendered[] = [];

    const tb = message.get("traceback");

    if (typeof tb == "string") {
      v.push(<Ansi>{tb}</Ansi>);
    }
    // forEach detects an immutable object
    else if (typeof tb.forEach == "function" || Array.isArray(tb)) {
      let n: number = 0;
      for (let x of tb) {
        if (!endswith(x, "\n")) {
          x += "\n";
        }
        v.push(<Ansi key={n}>{x}</Ansi>);
        n += 1;
      }
    }

    return <div style={TRACEBACK_STYLE}>{v}</div>;
  },
  should_memoize
);
