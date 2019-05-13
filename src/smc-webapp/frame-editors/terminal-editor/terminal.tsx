/*
A single terminal frame.
*/

import { Map } from "immutable";
import { ResizeObserver } from "resize-observer";

import { Terminal } from "./connected-terminal";

import { throttle } from "underscore";

import { Button } from "react-bootstrap";

import { background_color } from "./themes";

import { is_different } from "smc-util/misc2";

import { React, Component, Rendered, ReactDOM } from "../../app-framework";
import { Icon } from "../../r_misc/icon";

interface Props {
  actions: any;
  id: string;
  path: string;
  project_id: string;
  font_size: number;
  editor_state: any;
  is_current: boolean;
  terminal: Map<string, any>;
  desc: Map<string, any>;
}

export class TerminalFrame extends Component<Props, {}> {
  static displayName = "TerminalFrame";

  private terminal: Terminal;
  private is_mounted: boolean = false;

  shouldComponentUpdate(next): boolean {
    return is_different(this.props, next, [
      "id",
      "project_id",
      "path",
      "font_size",
      "terminal",
      "desc"
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
    this.terminal.is_mounted = true;
    this.measure_size = this.measure_size.bind(this);
  }

  componentWillUnmount(): void {
    this.is_mounted = false;
    if (this.terminal !== undefined) {
      this.terminal.element.remove();
      this.terminal.is_mounted = false;
      // Ignore size for this terminal.
      this.terminal.conn_write({ cmd: "size", rows: 0, cols: 0 });
      delete this.terminal;
    }
  }

  init_terminal(): void {
    const node: any = ReactDOM.findDOMNode(this.refs.terminal);
    if (node == null) {
      throw Error("refs.terminal MUST be defined");
    }
    this.terminal = this.props.actions._get_terminal(this.props.id, node);
    this.set_font_size(this.props.font_size);
    this.measure_size();
    new ResizeObserver(() => this.measure_size()).observe(node);
    if (this.props.is_current) {
      this.terminal.focus();
    }
    // Get rid of browser context menu, which makes no sense on a canvas.
    // See https://stackoverflow.com/questions/10864249/disabling-right-click-context-menu-on-a-html-canvas
    // NOTE: this would probably make sense in DOM mode instead of canvas mode;
    // if we switch, disable this...
    // Well, this context menu is still silly. Always disable it.
    if (true || this.terminal.rendererType != "dom") {
      $(node).bind("contextmenu", function() {
        return false;
      });
    }

    // TODO: Obviously restoring the exact scroll position would be better...
    this.terminal.scroll_to_bottom();
  }

  async set_font_size(font_size: number): Promise<void> {
    if (this.terminal == null || !this.is_mounted) {
      return;
    }
    if (this.terminal.getOption("fontSize") !== font_size) {
      this.terminal.set_font_size(font_size);
      this.measure_size();
    }
  }

  measure_size(): void {
    if (this.terminal == null || !this.is_mounted) {
      return;
    }
    this.terminal.measure_size();
  }

  render_clear_command_button(): Rendered {
    return (
      <Button
        onClick={() => this.props.actions.clear_terminal_command(this.props.id)}
        bsSize="small"
        title="Clear command, switching back to standard terminal"
      >
        <Icon name="times" />
      </Button>
    );
  }

  render_command(): Rendered {
    const command = this.props.desc.get("command");
    if (!command) return;
    return (
      <div
        style={{
          borderBottom: "1px solid grey",
          paddingLeft: "5px",
          background: "#eee",
          height: "32px"
        }}
      >
        {this.render_clear_command_button()} {command}
      </div>
    );
  }

  render(): Rendered {
    const color = background_color(this.props.terminal.get("color_scheme"));
    /* 4px padding is consistent with CodeMirror */
    return (
      <div className={"smc-vfill"}>
        {this.render_command()}
        <div
          className={"smc-vfill"}
          style={{ backgroundColor: color, padding: "0 0 0 4px" }}
          onClick={() => {
            /* otherwise, clicking right outside term defocuses,
             which is confusing */
            this.terminal.focus();
          }}
        >
          <div className={"smc-vfill cocalc-xtermjs"} ref={"terminal"} />
        </div>
      </div>
    );
  }
}
