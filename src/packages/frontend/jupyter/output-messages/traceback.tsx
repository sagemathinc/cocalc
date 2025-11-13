/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import React from "react";
import { Map } from "immutable";
import { Ansi, toText } from "./ansi";
import { TRACEBACK_STYLE } from "./style";
import { useFileContext } from "@cocalc/frontend/lib/file-context";
import { HOME_ROOT } from "@cocalc/util/consts/files";

interface TracebackProps {
  message: Map<string, any>;
}

function should_memoize(prev, next) {
  return prev.message.equals(next.message);
}

export const Traceback: React.FC<TracebackProps> = React.memo(
  (props: TracebackProps) => {
    const { message } = props;

    const v: React.JSX.Element[] = [];

    const tb = message.get("traceback");
    const { AnchorTagComponent } = useFileContext();

    let lines: string[];
    if (typeof tb == "string") {
      lines = tb.split("\n");
    } else if (typeof tb.forEach == "function" || Array.isArray(tb)) {
      // forEach detects an immutable.js object
      lines = [];
      for (const x of tb) {
        lines.push(x);
      }
    } else {
      lines = [JSON.stringify(tb)];
    }

    let n: number = 0;
    for (let x of lines) {
      if (!x.endsWith("\n")) {
        x += "\n";
      }
      if (AnchorTagComponent != null && x.startsWith("File ")) {
        const { file, target, rest, line } = parseFile(x);
        v.push(
          <div key={n}>
            File{" "}
            <AnchorTagComponent href={`${target}#line=${line}`}>
              {file}:{line}
            </AnchorTagComponent>
            <Ansi>{rest}</Ansi>
          </div>,
        );
      } else {
        v.push(<Ansi key={n}>{x}</Ansi>);
      }
      n += 1;
    }

    return <div style={TRACEBACK_STYLE}>{v}</div>;
  },
  should_memoize,
);

function parseFile(x: string): {
  file: string;
  rest: string;
  target: string;
  line: number;
} {
  const i = x.indexOf(", ");
  const a = toText(x.slice(0, i).trim()).slice(5).trim();
  const rest = x.slice(i);
  const v = a.split(":");
  const file = v[0];
  let target = file;
  if (target[0] === "/") {
    // absolute path to the root
    target = '~/' + HOME_ROOT + target; // use root symlink
  }

  const line = parseInt(v[1]);
  return { rest, file, target, line };
}
