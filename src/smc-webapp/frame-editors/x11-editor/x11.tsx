/*
X11 Window frame.
*/

import { Map } from "immutable";

import { ResizeObserver } from "resize-observer";

import { delay } from "awaiting";

import {
  React,
  Component,
  ReactDOM,
  Rendered,
  rclass,
  rtypes
} from "../../app-framework";

import { debounce } from "underscore";

import { is_different } from "../generic/misc";

import { Actions } from "./actions";

import { WindowTab } from "./window-tab";

interface Props {
  actions: Actions;
  id: string;
  desc: Map<string, any>;
  is_current: boolean;
  // reduxProps:
  windows: Map<string, any>;
}

export class X11Component extends Component<Props, {}> {
  static displayName = "X11";

  static reduxProps({ name }) {
    return {
      [name]: {
        windows: rtypes.immutable.Map
      }
    };
  }

  shouldComponentUpdate(next): boolean {
    if (this.props.desc.get("wid") != next.desc.get("wid")) {
      this.insert_window_in_div(next);
      return true;
    }
    return is_different(this.props, next, ["id", "windows", "is_current"]);
  }

  componentDidMount(): void {
    this.insert_window_in_div(this.props);
    this.init_resize_observer();
    this.measure_size = debounce(this.measure_size.bind(this), 500);
    }

  init_resize_observer(): void {
    const node: any = ReactDOM.findDOMNode(this.refs.window);
    new ResizeObserver(() => this.measure_size()).observe(node);
  }

  async insert_window_in_div(props): Promise<void> {
    const client = props.actions.client;
    if (client == null) {  // to satisfy typescript
      return;
    }
    const node: any = ReactDOM.findDOMNode(this.refs.window);
    const wid = props.desc.get("wid");
    if (wid == null) {
      // nothing focused...
      $(node).empty();
      return;
    }
    client.render_window(wid, node);

    await delay(1);
    client.resize_window(wid);
    if (props.is_current) {
      client.focus(wid);
    }
  }

  measure_size() : void {
    console.log("measure_size");
    const client = this.props.actions.client;
    if (client == null) {  // to satisfy typescript
      return;
    }
    const wid = this.props.desc.get("wid");
    if (wid == null) {
      return;
    }
    client.resize_window(wid);
  }

  componentWillUnmount(): void {
    // TODO: not at all right...
    this.props.actions.blur();
  }

  render_window_tabs(): Rendered[] {
    const v: Rendered[] = [];
    if (this.props.windows == null) {
      return v;
    }
    this.props.windows.forEach((info: Map<string, any>) => {
      v.push(
        <WindowTab
          id={this.props.id}
          key={info.get("wid")}
          is_current={info.get("wid") === this.props.desc.get("wid")}
          info={info}
          actions={this.props.actions}
        />
      );
    });
    return v;
  }

  render_tab_bar(): Rendered {
    return (
      <div
        style={{ borderBottom: "1px solid lightgrey", padding: "5px 0 0 0" }}
      >
        {this.render_window_tabs()}
      </div>
    );
  }

  render(): Rendered {
    return (
      <div className="smc-vfill">
        {this.render_tab_bar()}
        <div className="smc-vfill" ref="window" />
      </div>
    );
  }
}

const X110 = rclass(X11Component);
export { X110 as X11 };
