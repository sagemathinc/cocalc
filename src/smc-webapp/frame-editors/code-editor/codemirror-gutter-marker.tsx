/*
React component that represents gutter markers in a codemirror editor.
*/

import { React, ReactDOM, Component, Rendered } from "../../app-framework";
import { is_different } from "smc-util/misc2";
import * as CodeMirror from "codemirror";

interface Props {
  line: number; // line where it is initially placed -- will of course change as doc changes
  codemirror: CodeMirror.Editor; // codemirror editor instance that we'll put gutter marks in.
  gutter_id: string;
  set_handle: Function;
}

export class GutterMarker extends Component<Props, {}> {
  private _elt: HTMLElement | undefined;
  private _handle: CodeMirror.LineHandle | undefined;

  shouldComponentUpdate(props): boolean {
    return is_different(this.props, props, ["line", "gutter_id"]);
  }

  componentDidMount(): void {
    this.init_gutter();
  }

  init_gutter(): void {
    this._elt = document.createElement("div");
    ReactDOM.render(<div>{this.props.children}</div>, this._elt);
    this._handle = this.props.codemirror.setGutterMarker(
      this.props.line,
      this.props.gutter_id,
      this._elt
    );
    this.props.set_handle(this._handle);
  }

  componentWillUnmount(): void {
    if (this._elt !== undefined) {
      ReactDOM.unmountComponentAtNode(this._elt);
      this._elt.remove();
      delete this._elt;
    }
    if (this._handle !== undefined) {
      this.props.codemirror.setGutterMarker(
        this._handle,
        this.props.gutter_id,
        null
      );
      delete this._handle;
    }
  }

  render(): Rendered {
    return <span />;
  }
}
