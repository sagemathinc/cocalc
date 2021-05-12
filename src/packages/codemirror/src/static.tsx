/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Statically render using **React** a non-interactive codemirror
editor, with full support for syntax highlighting (of course)
and *line numbers*. Line numbers are tricky and something which
official codemirror static rendering doesn't have.

TODO: make jupyter/cocdemirror-static a simple wrapper around
this (or get rid of it).
*/

import * as React from "react";

// We use a special version of runMode that can be run on the backend
// or frontend, to better support next.js.
// @ts-ignore -- issue with runMode having any type
import { runMode } from "codemirror/addon/runmode/runmode.node";
import "./modes";
import { CSSProperties } from "react";

const BLURRED_STYLE = {
  width: "100%",
  overflowX: "hidden",
  lineHeight: "normal",
  height: "auto",
  fontSize: "inherit",
  marginBottom: 0,
  padding: "4px",
  whiteSpace: "pre-wrap",
  wordWrap: "break-word",
  wordBreak: "normal",
  border: 0,
} as CSSProperties;

interface Props {
  value: string;
  id?: string;
  options?: { mode?: string; lineNumbers?: boolean; theme?: string };
  fontSize?: number;
  style?: CSSProperties; // optional style that is merged into BLURRED_STYLE
  noBorder?: boolean; // if given, do not draw border around whole thing
}

// This is used heavily by the share server.
export function CodeMirrorStatic({
  value,
  options,
  fontSize,
  style,
  noBorder,
}: Props) {
  function lineNumber(
    key: string | number,
    line: number,
    width: number
  ): JSX.Element {
    return (
      <div key={key} className="CodeMirror-gutter-wrapper">
        <div
          style={{ left: `-${width + 4}px`, width: `${width - 9}px` }}
          className="CodeMirror-linenumber CodeMirror-gutter-elt"
        >
          {line}
        </div>
      </div>
    );
  }

  function renderLines(width: number): JSX.Element[] {
    // python3 = likely fallback, given it's CoCalc...
    const mode = options?.["mode"] ?? "python3";
    const v: JSX.Element[] = [];
    let line_numbers: boolean = !!options?.["lineNumbers"];
    let line = 1;
    if (line_numbers) {
      v.push(lineNumber(v.length, line, width));
      line++;
    }

    const append = (text: string, type?: string) => {
      if (type != null) {
        v.push(
          <span key={v.length} className={`cm-${type}`}>
            {text}
          </span>
        );
      } else {
        v.push(<span key={v.length}>{text}</span>);
      }
      if (line_numbers && text === "\n") {
        v.push(lineNumber(v.length, line, width));
        line++;
      }
    };

    try {
      runMode(value, mode, append);
    } catch (err) {
      /* This does happen --
            https://github.com/sagemathinc/cocalc/issues/3626
         However, basically silently ignoring it (with a console.log)
         is probably the best option for now (rather than figuring
         out every possible bad input that could cause this), since
         it completely crashes cocalc. */
      console.log(`WARNING: CodeMirror runMode failed -- ${err}`);
    }
    line_numbers = false;
    append("\n");

    return v;
  }

  function renderCode(): JSX.Element {
    let cmstyle: React.CSSProperties;
    let width: number;
    let theme = options?.["theme"] ?? "default";
    if (options?.["lineNumbers"]) {
      const num_lines = value.split("\n").length;
      if (num_lines < 100) {
        width = 30;
      } else if (num_lines < 1000) {
        width = 35;
      } else if (num_lines < 10000) {
        width = 45;
      } else {
        width = 69;
      }
      cmstyle = { paddingLeft: `${width + 4}px`, ...BLURRED_STYLE };
      if (style != null) {
        cmstyle = { ...cmstyle, ...style };
      }
    } else {
      width = 0;
      cmstyle = BLURRED_STYLE;
      if (style != null) {
        cmstyle = { ...cmstyle, ...style };
      }
    }
    if (theme == "default") {
      cmstyle = { background: "white", ...cmstyle };
    }

    const v = theme.split(" ");
    const theme_base = "cm-s-" + v[0];
    const theme_extra = v.length == 2 ? "cm-s-" + v[1] : "";

    return (
      <pre
        className={`CodeMirror ${theme_base} ${theme_extra} CodeMirror-wrap`}
        style={cmstyle}
      >
        <div style={{ marginLeft: width }}>
          {renderLines(width)}
          {renderGutter(width)}
        </div>
      </pre>
    );
  }

  function renderGutter(width: number): JSX.Element | undefined {
    if (options?.["lineNumbers"]) {
      return (
        <div className="CodeMirror-gutters">
          <div
            className="CodeMirror-gutter CodeMirror-linenumbers"
            style={{ width: `${width - 1}px` }}
          />
        </div>
      );
    }
  }

  const divStyle: React.CSSProperties = {
    width: "100%",
    borderRadius: "2px",
    position: "relative",
    overflowX: "auto",
    fontSize: fontSize ? `${fontSize}px` : undefined,
  };
  if (!noBorder) {
    divStyle.border = "1px solid rgb(207, 207, 207)";
  }
  return <div style={divStyle}>{renderCode()}</div>;
}
