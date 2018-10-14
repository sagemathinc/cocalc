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
    const node: any = ReactDOM.findDOMNode(this.refs.x11);
    this.props.actions.client.render_window(4, node);
    this.props.actions.client.resize_window(4, node);
    this.props.actions.client.focus(4);
  }

  componentWillUnmount() : void {
    this.props.actions.client.blur();
  }

  render(): Rendered {
    return <div className="smc-vfill" ref='x11' id="x11" />;
  }
}
