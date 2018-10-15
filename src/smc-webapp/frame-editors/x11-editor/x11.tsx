/*
X11 Window frame.
*/

import { React, Component, ReactDOM, Rendered } from "../../app-framework";

interface Props {
  actions: any;
  id: string;
}

export class X11 extends Component<Props, {}> {
  static displayName = "X11";

  componentDidMount(): void {
    const client = this.props.actions.client;
    if (client == null) {
      return;
    }
    const node: any = ReactDOM.findDOMNode(this.refs.x11);
    const wid = 4;
    client.render_window(wid, node);
    client.resize_window(wid, node);
    client.focus(wid);
  }

  componentWillUnmount() : void {
    this.props.actions.blur();
  }

  render(): Rendered {
    return <div className="smc-vfill" ref='x11' id="x11" />;
  }
}
