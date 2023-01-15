/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
React component that represents gutter markers in a codemirror editor.
*/

import { Component, Rendered } from "../../app-framework";
import { createRoot } from "react-dom/client";
import { ReactNode } from "react";
import { is_different } from "@cocalc/util/misc";
import * as CodeMirror from "codemirror";

interface Props {
  line: number; // line where it is initially placed -- will of course change as doc changes
  codemirror: CodeMirror.Editor; // codemirror editor instance that we'll put gutter marks in.
  gutter_id: string;
  set_handle: Function;
  children: ReactNode;
}

export class GutterMarker extends Component<Props, {}> {
  private _elt: HTMLElement | undefined;
  private _handle: CodeMirror.LineHandle | undefined;
  private root;

  shouldComponentUpdate(props): boolean {
    return is_different(this.props, props, ["line", "gutter_id"]);
  }

  componentDidMount(): void {
    this.init_gutter();
  }

  init_gutter(): void {
    this._elt = document.createElement("div");
    this.root = createRoot(this._elt);
    this.root.render(<div>{this.props.children}</div>);
    this._handle = this.props.codemirror.setGutterMarker(
      this.props.line,
      this.props.gutter_id,
      this._elt
    );
    this.props.set_handle(this._handle);
  }

  componentWillUnmount(): void {
    if (this._elt !== undefined) {
      this.root.unmount();
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
