import * as React from "react";
import { COLORS, Tip } from "../../r_misc"

const Breadcrumb = require("react-bootstrap")

interface Props {
  path?: string,
  display?: string | JSX.Element,
  actions: any,
  full_name?: string,
  history?: boolean,
  active?: boolean
 }

// One segment of the directory links at the top of the files listing.
export class PathSegmentLink extends React.Component<Props> {
  constructor(props) {
    super(props);
  }

  getDefaultProps() {
    return { active: false };
  }

  handle_click() {
    return this.props.actions.open_directory(this.props.path);
  }

  render_content() {
    if (this.props.full_name && this.props.full_name !== this.props.display) {
      return (
        <Tip tip={this.props.full_name} placement="bottom" title="Full name">
          {this.props.display}
        </Tip>
      );
    } else {
      return this.props.display;
    }
  }

  style() {
    if (this.props.history) {
      return { color: "#c0c0c0" };
    } else if (this.props.active) {
      return { color: COLORS.BS_BLUE_BGRND };
    }
    return {};
  }

  render() {
    return (
      <Breadcrumb.Item
        onClick={this.handle_click}
        active={this.props.active}
        style={this.style()}
      >
        {this.render_content()}
      </Breadcrumb.Item>
    );
  }
}
