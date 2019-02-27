/*
Rendering of static codemirror editor.

Meant to be efficient to render hundreds
of these on the page at once.
*/

import { React, Component } from "../app-framework"; // TODO: this
import { Map as ImmutableMap } from "immutable";
const misc_page = require("../misc_page");
const misc = require("smc-util/misc");

declare const CodeMirror: any; // TODO: find typings for this UMD

const BLURRED_STYLE: React.CSSProperties = {
  width: "100%",
  overflowX: "hidden",
  background: "#f7f7f7",
  lineHeight: "normal",
  height: "auto",
  fontSize: "inherit",
  marginBottom: 0,
  padding: "4px",
  whiteSpace: "pre-wrap",
  wordWrap: "break-word",
  wordBreak: "normal",
  border: 0
};

interface CodeMirrorStaticProps {
  value: string;
  actions?: any;
  id?: string;
  options?: ImmutableMap<any, any>;
  font_size?: number;
  complete?: ImmutableMap<any, any>;
  set_click_coords?: (pos: { left: number; top: number }) => void;
  style?: any; // optional style that is merged into BLURRED_STYLE
  no_border?: boolean; // if given, do not draw border around whole thing
}

export class CodeMirrorStatic extends Component<CodeMirrorStaticProps> {
  focus = (event: any) => {
    if (this.props.actions == null || this.props.id == null) {
      // read only
      return;
    }
    if (event.shiftKey) {
      misc_page.clear_selection();
      this.props.actions.select_cell_range(this.props.id);
      event.stopPropagation();
      return;
    }
    if (window.getSelection().toString()) {
      // User is selected some text in the cell; if we switch to edit mode
      // then the selection would be cleared, which is annoying.  NOTE that
      // this makes the behavior slightly different than official Jupyter.
      event.stopPropagation();
      return;
    }
    this.props.actions.unselect_all_cells();
    this.props.actions.set_cur_id(this.props.id);
    this.props.actions.set_mode("edit"); // important to set this *AFTER* setting the current id - see issue #2547
    if (this.props.set_click_coords) {
      this.props.set_click_coords({ left: event.clientX, top: event.clientY });
    }
  };

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
    let mode = "python";
    if (this.props.options) {
      mode = this.props.options.getIn(["mode", "name"], mode);
    }
    const v: any[] = [];
    // TODO: write this line better
    let line_numbers: boolean = !!(this.props.options != null
      ? this.props.options.get("lineNumbers")
      : undefined);
    let line = 1;
    if (line_numbers) {
      v.push(this.line_number(v.length, line, width));
      line++;
    }
    // TODO: this was unused code from coffeescript file
    // let last_type = undefined;  // used for detecting introspection
    const append = (text: string, type?: string) => {
      if (type != null) {
        v.push(
          <span key={v.length} className={`cm-${type}`}>
            {text}
          </span>
        );
        // TODO: this was unused code from coffeescript file
        // if (text.trim().length > 0) {
        //   last_type = type;
        // }
      } else {
        v.push(<span key={v.length}>{text}</span>);
      }
      if (line_numbers && text === "\n") {
        v.push(this.line_number(v.length, line, width));
        line++;
      }
    };

    try {
      CodeMirror.runMode(this.props.value, mode, append);
    } catch(err) {
      /* This does happen --
            https://github.com/sagemathinc/cocalc/issues/3626
         However, basically silently ignoring it (with a console.log)
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
    if (
      this.props.options != null
        ? this.props.options.get("lineNumbers")
        : undefined
    ) {
      const num_lines = this.props.value.split("\n").length;
      if (num_lines < 100) {
        width = 30;
      } else if (num_lines < 1000) {
        width = 39;
      } else if (num_lines < 10000) {
        width = 49;
      } else {
        // nobody better do this...
        width = 59;
      }
      style = misc.merge({ paddingLeft: `${width + 4}px` }, BLURRED_STYLE);
      if (this.props.style != null) {
        style = misc.merge(style, this.props.style);
      }
    } else {
      width = 0;
      style = BLURRED_STYLE;
      if (this.props.style != null) {
        style = misc.merge(misc.copy(style), this.props.style);
      }
    }

    return (
      <pre
        className="CodeMirror cm-s-default CodeMirror-wrap"
        style={style}
        onMouseUp={this.focus}
      >
        {this.render_lines(width)}
        {this.render_gutter(width)}
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
      overflowX: "auto"
    };
    if (!this.props.no_border) {
      style.border = "1px solid rgb(207, 207, 207)";
    }
    return <div style={style}>{this.render_code()}</div>;
  }
}
