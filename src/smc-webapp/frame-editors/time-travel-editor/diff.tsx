/*
Render a diff of two versions of a document for use in TimeTravel.

NOTE: I did extensively test out using https://github.com/praneshr/react-diff-viewer.
Though it seems reasonably mature and has some work done on it, building on other great
tools, it is has some major show-stopper limitations, e.g., it doesn't support large documents
via windowing. Also, I had a lot of css conflicts trying to use it (it just looked very wrong,
and it uses tables)  Codemirror automatically supports large documents, editor themes, etc.,
so we build something on Codemirror instead
*/

import { debounce } from "lodash";
import * as CodeMirror from "codemirror";
import { Component, React, Rendered } from "../../app-framework";
import { Map } from "immutable";
import { cm_options } from "../codemirror/cm-options";
import { init_style_hacks } from "../codemirror/util";

import { set_cm_line_diff } from "./diff-util";

interface Props {
  v0: string;
  v1: string;
  path: string; // filename of doc, which determines what sort of syntax highlighting to use.
  editor_settings: Map<string, any>;
  font_size: number;
  use_json: boolean;
}

export class Diff extends Component<Props> {
  private update: Function;
  private cm: CodeMirror.Editor;
  private textarea_ref: React.RefObject<HTMLTextAreaElement> = React.createRef<
    HTMLTextAreaElement
  >();

  private init_codemirror() {
    const textarea = this.textarea_ref.current;
    if (textarea == null) return; // can't happen
    const options: any = cm_options(
      this.props.use_json ? "a.js" : this.props.path,
      this.props.editor_settings
    );
    options.readOnly = true;
    this.cm = CodeMirror.fromTextArea(textarea, options);
    init_style_hacks(this.cm);
    set_cm_line_diff(this.cm, this.props.v0, this.props.v1);
    const f = (v0: string, v1: string): void => {
      if (this.cm == null) return;
      set_cm_line_diff(this.cm, v0, v1);
    };
    this.update = debounce(f, 300);
  }

  public componentDidMount(): void {
    this.init_codemirror();
  }

  public componentWillUnmount(): void {
    if (this.cm == null) return;
    $(this.cm.getWrapperElement()).remove();
    delete this.cm;
  }

  public UNSAFE_componentWillReceiveProps(props): void {
    if (props.v0 != this.props.v0 || props.v1 != this.props.v1) {
      this.update(props.v0, props.v1);
    }
    this.cm.refresh();
  }

  public render(): Rendered {
    return (
      <div
        className="smc-vfill"
        style={{ fontSize: `${this.props.font_size}px`, overflow: "auto" }}
      >
        <textarea ref={this.textarea_ref} style={{ display: "none" }} />
      </div>
    );
  }
}
