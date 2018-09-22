/*
A single terminal frame.
*/

import { Terminal } from "xterm";
require("xterm/dist/xterm.css");

import { ResizeObserver } from "resize-observer";
import { proposeGeometry } from "xterm/lib/addons/fit/fit";

import { throttle } from "underscore";

import { is_different } from "../generic/misc";

import { React, Component, Rendered, ReactDOM } from "../../app-framework";

interface Props {
  actions: any;
  id: string;
  path: string;
  project_id: string;
  font_size: number;
  editor_state: any;
}

export class TerminalFrame extends Component<Props, {}> {
  static displayName = "TerminalFrame";

  private terminal: any;

  shouldComponentUpdate(next): boolean {
    return is_different(this.props, next, [
      "id",
      "project_id",
      "path",
      "font_size"
    ]);
  }

  on_scroll(): void {
    const elt = ReactDOM.findDOMNode(this.refs.scroll);
    if (elt == null) {
      return;
    }
    const scroll = $(elt).scrollTop();
    this.props.actions.save_editor_state(this.props.id, { scroll });
  }

  componentDidMount(): void {
    this.restore_scroll();
    this.init_terminal();
  }

  componentWillUnmount(): void {
    if (this.terminal !== undefined) {
      $(this.terminal.element).remove();
    }
  }

  async init_terminal(): Promise<void> {
    const node: any = ReactDOM.findDOMNode(this.refs.terminal);
    if (node == null) {
      return;
    }
    const terminal = this.props.actions._get_terminal(this.props.id);
    if (terminal != null) {
      this.terminal = terminal;
    } else {
      this.terminal = new Terminal();
      this.terminal.open();
      await this.props.actions.set_terminal(this.props.id, this.terminal);
    }
    node.appendChild(this.terminal.element);
    this.measure_size();
    new ResizeObserver(() => this.measure_size()).observe(node);
  }

  async restore_scroll(): Promise<void> {
    const scroll = this.props.editor_state.get("scroll");
    const elt = $(ReactDOM.findDOMNode(this.refs.scroll));
    if (elt.length === 0) return;
    elt.scrollTop(scroll);
  }

  measure_size(): void {
    if (this.terminal == null) return;
    const geom = proposeGeometry(this.terminal);
    if (geom == null) return;
    const { rows, cols } = geom;
    console.log("geom=", rows, cols);
    (this.terminal as any).conn.write({ cmd: "size", rows, cols });
  }

  render(): Rendered {
    return (
      <div
        style={{
          overflowY: "scroll",
          width: "100%"
        }}
        ref={"scroll"}
        onScroll={throttle(() => this.on_scroll(), 250)}
        className={"smc-vfill"}
      >
        <div ref={"terminal"} className={"smc-vfill"} />
      </div>
    );
  }
}
