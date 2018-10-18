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

import { TAB_BAR_GREY } from "./theme";

import { cmp } from "../generic/misc";

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
    if (!this.is_loaded && next.desc.get("wid") != null) {
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

  async insert_window_in_div(props): Promise<void> {
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
    try {
      client.render_window(wid, node);
    } catch(err) {
      // window not available right now.
      this.is_loaded = false;
      $(node).empty();
      return;
    }
    this.is_loaded = true;

    await delay(0);
    if (!this.is_mounted) {
      return;
    }
    this.measure_size();
    if (props.is_current) {
      client.focus(wid);
    }
  }

  measure_size(): void {
    const client = this.props.actions.client;
    if (client == null) {
      // to satisfy typescript
      return;
    }
    const wid = this.props.desc.get("wid");
    if (wid == null) {
      return;
    }
    const node = $(ReactDOM.findDOMNode(this.refs.window));
    const width = node.width(),
      height = node.height();
    if (width == null || height == null) {
      return;
    }
    client.resize_window(wid, width, height);
  }

  componentWillUnmount(): void {
    this.is_mounted = false;
    this.is_loaded = false;
    // TODO: not at all right...
    this.props.actions.blur();
  }

  render_window_tabs(): Rendered[] {
    const v: Rendered[] = [];
    if (this.props.windows == null) {
      return v;
    }
    const wids = this.props.windows.keySeq().toJS();
    wids.sort((a, b) => cmp(parseInt(a), parseInt(b))); // since they are strings.
    for (let wid of wids) {
      v.push(
        <WindowTab
          id={this.props.id}
          key={wid}
          is_current={parseInt(wid) === this.props.desc.get("wid")}
          info={this.props.windows.get(wid)}
          actions={this.props.actions}
        />
      );
    }
    return v;
  }

  render_tab_bar(): Rendered {
    return (
      <div
        style={{
          borderBottom: "1px solid lightgrey",
          background: TAB_BAR_GREY,
          display: "inline-flex"
        }}
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
