/*
X11 Window frame.
*/

import { Map } from "immutable";

import {
  React,
  Component,
  ReactDOM,
  Rendered,
  rclass,
  rtypes
} from "../../app-framework";

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
      this.update(next);
      return true;
    }
    return is_different(this.props, next, ["id", "windows", "is_current"]);
  }

  componentDidMount(): void {
    this.update(this.props);
  }

  update(props): void {
    const client = props.actions.client;
    if (client == null) {
      return;
    }
    const wid = props.desc.get("wid");
    if (wid == null) {
      return;
    }
    const node: any = ReactDOM.findDOMNode(this.refs.window);
    client.render_window(wid, node);
    client.resize_window(wid);
    if (props.is_current) {
      client.focus(wid);
    }
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
          info={info}
          actions={this.props.actions}
        />
      );
    });
    return v;
  }

  render(): Rendered {
    return (
      <div>
        <div>{this.render_window_tabs()}</div>
        <div className="smc-vfill" ref="window" />
      </div>
    );
  }
}

const X110 = rclass(X11Component);
export { X110 as X11 };
