declare const $: any;

import { React, Component } from "../app-framework"; // TODO: this will move
import { Map as ImmutableMap } from "immutable";

interface CompleteProps {
  actions: any;
  id: string;
  complete: ImmutableMap<any, any>; // TODO: types
}

// WARNING: Complete closing when clicking outside the complete box
// is handled in cell-list on_click.  This is ugly code (since not localized),
// but seems to work well for now.  Could move.
export class Complete extends Component<CompleteProps> {
  private node: HTMLElement;
  select = (item: any) =>
    this.props.actions.select_complete(this.props.id, item);

  render_item = (item: any) => {
    return (
      <li key={item}>
        <a role="menuitem" tabIndex={-1} onClick={() => this.select(item)}>
          {item}
        </a>
      </li>
    );
  };

  keypress = (evt: any) =>
    this.props.actions.complete_handle_key(this.props.id, evt.keyCode);

  componentDidMount() {
    $(window).on("keypress", this.keypress);
    $(this.node)
      .find("a:first")
      .focus();
  }

  componentDidUpdate() {
    $(this.node)
      .find("a:first")
      .focus();
  }

  componentWillUnmount() {
    $(window).off("keypress", this.keypress);
  }

  key = (e: any) => {
    if (e.keyCode === 27 && this.props.actions.close_complete != null) {
      this.props.actions.close_complete(this.props.id);
    }
    if (e.keyCode !== 13) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const item = $(this.node)
      .find("a:focus")
      .text();
    this.select(item);
  };

  get_style = (): React.CSSProperties => {
    const top = this.props.complete.getIn(["offset", "top"], 0);
    const left = this.props.complete.getIn(["offset", "left"], 0);
    const gutter = this.props.complete.getIn(["offset", "gutter"], 0);
    return {
      cursor: "pointer",
      top: top + "px",
      left: left + gutter + "px",
      opacity: 0.95,
      zIndex: 10,
      width: 0,
      height: 0
    };
  };

  get_items = () => {
    return this.props.complete.get("matches", []).map(this.render_item);
  };

  render() {
    return (
      <div
        className="dropdown open"
        style={this.get_style()}
        ref={(node: any) => (this.node = node)}
      >
        <ul
          className="dropdown-menu cocalc-complete"
          style={{ maxHeight: "40vh" }}
          onKeyDown={this.key}
        >
          {this.get_items()}
        </ul>
      </div>
    );
  }
}
