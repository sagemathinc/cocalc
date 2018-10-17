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
  private is_mounted: boolean = false;
  private is_loaded: boolean = false;

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
    if (!this.is_loaded) {
      // try
      this.insert_window_in_div(next);
    }
    return is_different(this.props, next, ["id", "windows", "is_current"]);
  }

  componentDidMount(): void {
    this.is_mounted = true;
    this.insert_window_in_div(this.props);
    this.init_resize_observer();
    this.measure_size = debounce(this.measure_size.bind(this), 500);
  }

  init_resize_observer(): void {
    const node: any = ReactDOM.findDOMNode(this.refs.window);
    new ResizeObserver(() => this.measure_size()).observe(node);
  }

  /*
  insert_overlay_in_div(props, overlay_id: number) : void {
    console.log("insert_overlay_in_div", overlay_id);
    const node: any = ReactDOM.findDOMNode(this.refs.window);
    const client = props.actions.client;
    if (client == null) {
      // to satisfy typescript
      return;
    }
    const wid = props.desc.get("wid");
    if (wid == null) {
      return;
    }
    client.render_overlay(wid, overlay_id);
  }
  */

  async insert_window_in_div(props): Promise<void> {
    console.log("insert_window_in_div");
    const node: any = ReactDOM.findDOMNode(this.refs.window);
    const client = props.actions.client;
    if (client == null) {
      // to satisfy typescript
      return;
    }
    const wid = props.desc.get("wid");
    if (wid == null) {
      this.is_loaded = false;
      // nothing focused...
      $(node).empty();
      return;
    }
    client.render_window(wid, node);
    this.is_loaded = true;

    await delay(0);
    if (!this.is_mounted) {
      return;
    }
    client.resize_window(wid);
    if (props.is_current) {
      client.focus(wid);
    }
  }

  measure_size(): void {
    console.log("measure_size");
    const client = this.props.actions.client;
    if (client == null) {
      // to satisfy typescript
      return;
    }
    const wid = this.props.desc.get("wid");
    if (wid == null) {
      return;
    }
    client.resize_window(wid);
  }

  componentWillUnmount(): void {
    this.is_mounted = false;
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
        <div
          className="smc-vfill"
          ref="window"
          style={{ position: "relative" }}
        />
      </div>
    );
  }
}

const X110 = rclass(X11Component);
export { X110 as X11 };
