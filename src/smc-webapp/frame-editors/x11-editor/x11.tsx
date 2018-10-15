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

import { Actions } from "./actions";

import { WindowTab } from "./window-tab";

interface Props {
  actions: Actions;
  id: string;
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

  componentDidMount(): void {
    const client = this.props.actions.client;
    if (client == null) {
      return;
    }
    const node: any = ReactDOM.findDOMNode(this.refs.x11);
    const wid = 4;
    client.render_window(wid, node);
    client.resize_window(wid);
    client.focus(wid);
  }

  componentWillUnmount(): void {
    this.props.actions.blur();
  }

  render_window_tabs(): Rendered[] {
    const v: Rendered[] = [];
    if (this.props.windows == null) {
      return v;
    }
    this.props.windows.forEach((info: Map<string, any>, id: string) => {
      v.push(<WindowTab key={id} id={id} info={info} actions={this.props.actions} />);
    });
    return v;
  }

  render(): Rendered {
    return (
      <div>
        <div>{this.render_window_tabs()}</div>
        <div className="smc-vfill" ref="x11" />
      </div>
    );
  }
}

const X110 = rclass(X11Component);
export { X110 as X11 };
