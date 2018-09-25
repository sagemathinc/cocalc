/*
A single terminal frame.
*/

import { Terminal } from "xterm";
require("xterm/dist/xterm.css");
import { ResizeObserver } from "resize-observer";
import { proposeGeometry } from "xterm/lib/addons/fit/fit";
import * as webLinks from "xterm/lib/addons/webLinks/webLinks";
webLinks.apply(Terminal);

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
  is_current: boolean;
}

export class TerminalFrame extends Component<Props, {}> {
  static displayName = "TerminalFrame";

  private terminal: any;
  private is_mounted: boolean = false;
  private last_rows: number = 0;
  private last_cols: number = 0;

  shouldComponentUpdate(next): boolean {
    return is_different(this.props, next, [
      "id",
      "project_id",
      "path",
      "font_size"
    ]);
  }

  componentWillReceiveProps(next: Props): void {
    if (this.props.font_size !== next.font_size) {
      this.set_font_size(next.font_size);
    }
    if (!this.props.is_current && next.is_current) {
      this.terminal.focus();
    }
  }

  componentDidMount(): void {
    this.is_mounted = true;
    this.set_font_size = throttle(this.set_font_size, 500);
    this.init_terminal();
  }

  componentWillUnmount(): void {
    this.is_mounted = false;
    if (this.terminal !== undefined) {
      this.terminal.element.remove();
      // Ignore size for this terminal.
      (this.terminal as any).conn.write({ cmd: "size", rows: 0, cols: 0 });
      delete this.terminal;
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
      this.terminal.webLinksInit();
      this.terminal.open();
      await this.props.actions.set_terminal(this.props.id, this.terminal);
    }
    this.set_font_size(this.props.font_size);
    node.appendChild(this.terminal.element);
    this.measure_size();
    new ResizeObserver(() => this.measure_size()).observe(node);
    if (this.props.is_current) {
      this.terminal.focus();
    }
  }

  async set_font_size(font_size: number): Promise<void> {
    if (this.terminal == null || !this.is_mounted) {
      return;
    }
    if (this.terminal.getOption("fontSize") !== font_size) {
      this.terminal.setOption("fontSize", font_size);
      this.measure_size();
    }
  }

  measure_size(): void {
    if (this.terminal == null || !this.is_mounted) {
      return;
    }
    const geom = proposeGeometry(this.terminal);
    if (geom == null) return;
    const { rows, cols } = geom;
    if (rows !== this.last_rows || cols !== this.last_cols) {
      this.last_rows = rows;
      this.last_cols = cols;
      (this.terminal as any).conn.write({ cmd: "size", rows, cols });
    }
  }

  render(): Rendered {
    return <div ref={"terminal"} className={"smc-vfill"} />;
  }
}
