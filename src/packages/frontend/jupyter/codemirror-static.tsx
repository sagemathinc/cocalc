/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Rendering of static codemirror editor.
//
// Meant to be efficient to render many of these on the page at once.
//
// We use this for:
//
//   - the share server
//   - rendering cells that are offscreen or scrolling.
//
// In benchmarks, this seems to easily be 10x faster than creating an actual CodeMirror editor.


import React from "react";

// This tricky code works in both Node.js *and* the web browser, in a way that
// works with Next.js SSR rendering.  It just tooks hours of careful thought
// and trial and error to figure out.
let CodeMirror;
try {
  // Try to require the full codemirror package.  In the browser via webpack
  // this will work and runMode is defined.  In nextjs in the browser, this
  // CodeMirror.runMode is null.
  CodeMirror = require("codemirror");
  if (CodeMirror?.runMode == null) {
    throw Error();
  }
} catch (_) {
  // In next.js browser or node.js, so we use the node runmode approach,
  // which fully works in both situations.
  CodeMirror =
    global.CodeMirror = require("codemirror/addon/runmode/runmode.node");
  require("@cocalc/frontend/codemirror/modes");
}

export const runMode = CodeMirror.runMode;

const BLURRED_STYLE: React.CSSProperties = {
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
};

interface Props {
  value: string;
  id?: string;
  options?: {
    mode?: string | { name?: string };
    theme?: string;
    lineNumbers?: boolean;
  };
  font_size?: number;
  set_click_coords?: (pos: { left: number; top: number }) => void;
  style?: any; // optional style that is merged into BLURRED_STYLE
  no_border?: boolean; // if given, do not draw border around whole thing
}

// This is used heavily by the share server.
export function CodeMirrorStatic(props: Props) {
  const line_number = (key: string | number, line: number, width: number) => {
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
  };

  const render_lines = (width: number) => {
    // python3 is a reasonable fallback, given it's CoCalc.
    const mode = props.options?.mode ?? "python3";
    const v: JSX.Element[] = [];
    const lineNumbers = !!props.options?.lineNumbers;
    let line = 1;
    if (lineNumbers) {
      v.push(line_number(v.length, line, width));
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
      if (lineNumbers && text === "\n") {
        v.push(line_number(v.length, line, width));
        line++;
      }
    };

    try {
      // @ts-ignore -- fails in packages/hub right now...
      runMode(props.value, mode, append);
    } catch (err) {
      /* This does happen --
            https://github.com/sagemathinc/cocalc/issues/3626
         However, basically ignoring it (with a console.log)
         is probably the best option for now (rather than figuring
         out every possible bad input that could cause this), since
         it completely crashes cocalc. */
      console.warn(`WARNING: CodeMirror.runMode failed -- ${err}`);
    }
    append("\n"); // TODO: should this have 2 parameters?

    return v;
  };

  function render_code() {
    // NOTE: for #v1 this line numbers code is NOT used for now.  It works perfectly regarding
    // look and layout, but there is trouble with copying, which copies the line numbers too.
    // This can be fixed via a standard trick of having an invisible text area or div
    // in front with the same content... but that's a speed optimization for later.
    let style: React.CSSProperties;
    let width: number;
    const theme = props.options?.theme ?? "default";
    if (props.options?.lineNumbers) {
      const num_lines = props.value.split("\n").length;
      if (num_lines < 100) {
        width = 30;
      } else if (num_lines < 1000) {
        width = 35;
      } else if (num_lines < 10000) {
        width = 45;
      } else {
        // nobody better do this...?
        width = 69;
      }
      style = { paddingLeft: `${width + 4}px`, ...BLURRED_STYLE };
      if (props.style != null) {
        style = { ...style, ...props.style };
      }
    } else {
      width = 0;
      style = BLURRED_STYLE;
      if (props.style != null) {
        style = { ...style, ...props.style };
      }
    }
    if (theme == "default") {
      style = { ...{ background: "white" }, ...style };
    }

    const v = theme.split(" ");
    const theme_base = "cm-s-" + v[0];
    const theme_extra = v.length == 2 ? "cm-s-" + v[1] : "";

    return (
      <pre
        className={`CodeMirror ${theme_base} ${theme_extra} CodeMirror-wrap`}
        style={style}
      >
        <div style={{ marginLeft: width }}>
          {render_lines(width)}
          {render_gutter(width)}
        </div>
      </pre>
    );
  }

  function render_gutter(width: number) {
    if (props.options?.lineNumbers) {
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

  const style: React.CSSProperties = {
    width: "100%",
    borderRadius: "2px",
    position: "relative",
    overflowX: "auto",
    fontSize: props.font_size ? `${props.font_size}px` : undefined,
  };
  if (!props.no_border) {
    style.border = "1px solid rgb(207, 207, 207)";
  }
  return <div style={style}>{render_code()}</div>;
}
