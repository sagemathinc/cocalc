/*
A single terminal frame.
*/

import { Map } from "immutable";
import { Terminal } from "xterm";
require("xterm/lib/xterm.css");
import { ResizeObserver } from "resize-observer";
import { proposeGeometry } from "xterm/lib/addons/fit/fit";
import * as webLinks from "xterm/lib/addons/webLinks/webLinks";
webLinks.apply(Terminal);

import { throttle } from "underscore";

import { background_color } from "./themes";

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
  terminal: Map<string, any>;
}

export class TerminalFrame extends Component<Props, {}> {
  static displayName = "TerminalFrame";

  private terminal: any;
  private is_mounted: boolean = false;

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
    (this.terminal as any).is_mounted = true;
    this.measure_size = this.measure_size.bind(this);
    this.terminal.on("reconnect", this.measure_size);
  }

  componentWillUnmount(): void {
    this.is_mounted = false;
    if (this.terminal !== undefined) {
      this.terminal.off("reconnect", this.measure_size);
      this.terminal.element.remove();
      (this.terminal as any).is_mounted = false;
      // Ignore size for this terminal.
      (this.terminal as any).conn_write({ cmd: "size", rows: 0, cols: 0 });
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
      node.appendChild(this.terminal.element);
    } else {
      this.terminal = new Terminal();
      this.terminal.open();
      node.appendChild(this.terminal.element);
      this.terminal.webLinksInit();
      await this.props.actions.set_terminal(this.props.id, this.terminal);
      if (!this.is_mounted) {
        return;
      }
    }
    this.set_font_size(this.props.font_size);
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
    (this.terminal as any).conn_write({ cmd: "size", rows, cols });
  }

  render(): Rendered {
    const color = background_color(this.props.terminal.get("color_scheme"));
    return (
      <div
        className={"smc-vfill"}
        style={{ backgroundColor: color, padding: "3px" }}
      >
        <div className={"smc-vfill"} ref={"terminal"} />
      </div>
    );
  }
}
