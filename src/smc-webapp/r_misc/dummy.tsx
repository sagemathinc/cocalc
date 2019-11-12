// a fallback component, which does nothing

import { React } from "../app-framework";

export class Dummy extends React.Component {
  render() {
    return this.props.children;
  }
}
