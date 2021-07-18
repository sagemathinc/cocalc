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

import { React, Component, Rendered } from "../app-framework";
import { Map as ImmutableMap } from "immutable";
import { copy, merge } from "smc-util/misc";
import * as CodeMirror from "codemirror";
import "codemirror/addon/runmode/runmode";

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

interface CodeMirrorStaticProps {
  value: string;
  id?: string;
  options?: ImmutableMap<string, any>;
  font_size?: number;
  complete?: ImmutableMap<string, any>;
  set_click_coords?: (pos: { left: number; top: number }) => void;
  style?: any; // optional style that is merged into BLURRED_STYLE
  no_border?: boolean; // if given, do not draw border around whole thing
}

// This is used heavily by the share server.
export class CodeMirrorStatic extends Component<CodeMirrorStaticProps> {
  line_number = (key: string | number, line: number, width: number) => {
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

  render_lines = (width: number) => {
    let mode: any = null;
    if (this.props.options != null) {
      mode = this.props.options.get("mode");
      if (mode != null && typeof mode.toJS === "function") {
        mode = mode.toJS();
      }
    } else {
      mode = "python3"; // a likely fallback, given it's CoCalc.
    }
    const v: Rendered[] = [];
    // TODO: write this line better
    let line_numbers: boolean = !!(this.props.options != null
      ? this.props.options.get("lineNumbers")
      : undefined);
    let line = 1;
    if (line_numbers) {
      v.push(this.line_number(v.length, line, width));
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
        v.push(this.line_number(v.length, line, width));
        line++;
      }
    };

    try {
      // @ts-ignore -- fails in smc-hub right now...
      CodeMirror.runMode(this.props.value, mode, append);
    } catch (err) {
      /* This does happen --
            https://github.com/sagemathinc/cocalc/issues/3626
         However, basically ignoring it (with a console.log)
         is probably the best option for now (rather than figuring
         out every possible bad input that could cause this), since
         it completely crashes cocalc. */
      console.log(`WARNING: CodeMirror.runMode failed -- ${err}`);
    }
    line_numbers = false;
    append("\n"); // TODO: should this have 2 parameters?

    return v;
  };

  render_code() {
    // NOTE: for #v1 this line numbers code is NOT used for now.  It works perfectly regarding
    // look and layout, but there is trouble with copying, which copies the line numbers too.
    // This can be fixed via a standard trick of having an invisible text area or div
    // in front with the same content... but that's a speed optimization for later.
    let style: React.CSSProperties;
    let width: number;
    let theme = this.props.options?.get("theme") ?? "default";
    if (this.props.options?.get("lineNumbers")) {
      const num_lines = this.props.value.split("\n").length;
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
      style = merge({ paddingLeft: `${width + 4}px` }, BLURRED_STYLE);
      if (this.props.style != null) {
        style = merge(style, this.props.style);
      }
    } else {
      width = 0;
      style = BLURRED_STYLE;
      if (this.props.style != null) {
        style = merge(copy(style), this.props.style);
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
          {this.render_lines(width)}
          {this.render_gutter(width)}
        </div>
      </pre>
    );
  }

  render_gutter(width: number) {
    if (this.props.options && this.props.options.get("lineNumbers")) {
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

  render() {
    const style: React.CSSProperties = {
      width: "100%",
      borderRadius: "2px",
      position: "relative",
      overflowX: "auto",
      fontSize: this.props.font_size ? `${this.props.font_size}px` : undefined,
    };
    if (!this.props.no_border) {
      style.border = "1px solid rgb(207, 207, 207)";
    }
    return <div style={style}>{this.render_code()}</div>;
  }
}
