/*
A single terminal frame.
*/

declare const Terminal: any;

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
      this.terminal.destroy();
    }
  }

  init_terminal(): void {
    const node: any = ReactDOM.findDOMNode(this.refs.terminal);
    if (node == null) {
      return;
    }
    this.terminal = new Terminal({ row: 40, col: 80 });
    this.terminal.open();
    $(this.terminal.element).appendTo($(node));
    this.terminal.element.className = "webapp-console-terminal";
    this.props.actions.set_terminal(this.props.id, this.terminal);
  }

  async restore_scroll(): Promise<void> {
    const scroll = this.props.editor_state.get("scroll");
    const elt = $(ReactDOM.findDOMNode(this.refs.scroll));
    if (elt.length === 0) return;
    elt.scrollTop(scroll);
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
        className={
          "cocalc-editor-div"
        } /* this cocalc-editor-div class is needed for a safari hack only */
      >
        <div
          ref={"terminal"}
          style={{
            margin: "10px auto",
            padding: "0 10px"
          }}
        />
      </div>
    );
  }
}
