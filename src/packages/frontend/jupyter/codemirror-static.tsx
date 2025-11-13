/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*

Rendering of static codemirror editor.

Meant to be efficient to render many of these on the page at once.

We use this for:

  - the share server
  - rendering cells that are offscreen or scrolling.

In benchmarks, this seems to easily be 10x faster than creating an actual CodeMirror editor.

It also has an editable prop you can pass in that uses a *lightweight*
nextjs friendly code editor to make it editable.  (This is NOT codemirror.)
*/

import React, { ReactNode } from "react";

import CodeMirror from "@cocalc/frontend/codemirror/static";
import CodeEditor from "@cocalc/frontend/components/code-editor";

const BLURRED_STYLE: React.CSSProperties = {
  width: "100%",
  overflowX: "auto",
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

export interface Options {
  mode?: string | { name?: string };
  theme?: string;
  lineNumbers?: boolean;
  lineWrapping?: boolean; // defaults to true.
}

interface Props {
  value: string;
  id?: string;
  options?: Options;
  font_size?: number;
  set_click_coords?: (pos: { left: number; top: number }) => void;
  style?: React.CSSProperties; // optional style that is merged into BLURRED_STYLE
  no_border?: boolean; // if given, do not draw border around whole thing
  addonBefore?: ReactNode;
  addonAfter?: ReactNode;
  onDoubleClick?;
  editable?: boolean;
  onChange?;
  onKeyDown?;
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
    const v: React.JSX.Element[] = [];
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
      CodeMirror.runMode(props.value, mode, append);
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
      style = { ...BLURRED_STYLE, padding: `4px 4px 4px ${width + 4}px` };
    } else {
      width = 0;
      style = BLURRED_STYLE;
    }
    if (theme == "default") {
      style.background = "white";
    }
    if (props.options?.lineWrapping != null && !props.options?.lineWrapping) {
      style = { ...style, whiteSpace: "pre" };
    }

    const v = theme.split(" ");
    const theme_base = "cm-s-" + v[0];
    const theme_extra = v.length == 2 ? "cm-s-" + v[1] : "";

    return (
      <pre
        className={`CodeMirror ${theme_base} ${theme_extra} CodeMirror-wrap`}
        style={{ ...style, ...props.style }}
        onDoubleClick={props.onDoubleClick}
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

  const fontSize = props.font_size ? `${props.font_size}px` : undefined;
  const divStyle: React.CSSProperties = {
    width: "100%",
    borderRadius: "5px",
    position: "relative",
    overflowX: "hidden",
    fontSize,
  };
  if (!props.no_border) {
    divStyle.border = "1px solid rgb(207, 207, 207)";
  }
  return (
    <div style={divStyle}>
      {props.addonBefore}
      {props.editable ? (
        <CodeEditor
          style={{
            // Note -- some natural properties here, e.g., padding and line height, *totally mess up either the app or nextjs*.
            // Basically, the screw up computations done internally with this editor.  This is all just a shim, and we'll switch
            // to codemirror at some point, so little point in debugging this.
            fontSize: fontSize ?? "14.6666px",
            fontFamily: "monospace",
            border: "0px solid transparent",
            borderLeft: `10px solid #cfcfcf`,
          }}
          value={props.value}
          language={props.options?.mode}
          onChange={props.onChange}
          onKeyDown={props.onKeyDown}
        />
      ) : (
        render_code()
      )}
      {props.addonAfter}
    </div>
  );
}
