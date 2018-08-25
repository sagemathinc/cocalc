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
    }
  }

  init_terminal(): void {
    const node: any = ReactDOM.findDOMNode(this.refs.terminal);
    if (node == null) {
      return;
    }
    const terminal = this.props.actions._get_terminal(this.props.id);
    if(terminal != null) {
      this.terminal = terminal;
    } else {
      this.terminal = new Terminal();
      this.terminal.open();
      this.props.actions.set_terminal(this.props.id, this.terminal);
    }
    const elt = $(this.terminal.element)
    elt.css('width', '100%');
    elt.appendTo($(node));
    this.terminal.element.className = "webapp-console-terminal";
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
        />
      </div>
    );
  }
}
