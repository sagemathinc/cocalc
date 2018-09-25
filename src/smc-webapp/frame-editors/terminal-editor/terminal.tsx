/*
A single terminal frame.
*/

import { Terminal } from "xterm";
require("xterm/dist/xterm.css");
import { delay } from "awaiting";
import { ResizeObserver } from "resize-observer";
import { proposeGeometry } from "xterm/lib/addons/fit/fit";
import * as webLinks from "xterm/lib/addons/webLinks/webLinks";
webLinks.apply(Terminal);

//import { throttle } from "underscore";

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
      this.set_font_size();
    }
    if (!this.props.is_current && next.is_current) {
      this.terminal.focus();
    }
  }

  componentDidMount(): void {
    this.is_mounted = true;
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
    this.set_font_size();
    node.appendChild(this.terminal.element);
    this.measure_size();
    new ResizeObserver(() => this.measure_size()).observe(node);
    /* uncomment for grey box around actual terminal size... is kind of annoying.
    // Wait until in DOM and add a border:
    await delay(0);
    $(this.terminal.element)
      .find(".xterm-viewer") // would use xterm-text-layer if this were canvas renderer
      .css({
        borderRight: "1px solid lightgrey",
        borderBottom: "1px solid lightgrey"
      });
    */
    await delay(0);
    const elt = $(this.terminal.element);
    // Hack so doesn't look stupid:
    const bg = (this.terminal as any)._core.renderer.colorManager.colors
      .background;
    elt.find(".xterm-screen").css({ backgroundColor: bg });
    if (this.props.is_current) {
      this.terminal.focus();
    }
  }

  async set_font_size(): Promise<void> {
    if (this.terminal == null || !this.is_mounted) {
      return;
    }
    if (this.terminal.getOption("fontSize") != this.props.font_size) {
      this.terminal.setOption("fontSize", this.props.font_size);
      await delay(0);
      this.measure_size();
      await delay(50);
      this.measure_size();
    }
  }

  measure_size(): void {
    if (this.terminal == null || !this.is_mounted) {
      return;
    }
    const geom = proposeGeometry(this.terminal);
    if (geom == null) return;
    geom.cols += 2; // it's always wrong by this amount... (for dom renderer, not canvas)
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
