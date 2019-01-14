import * as React from "react";
import { Icon } from "./icon";
import * as misc from "smc-util/misc";
import * as feature from "../feature";

const { OverlayTrigger, Popover, Tooltip } = require("react-bootstrap");

interface Props {
  title: string | React.Component; // not checked for update
  placement?: "top" | "right" | "bottom" | "left";
  tip?: string | React.Component; // not checked for update
  size?: "xsmall" | "small" | "medium" | "large";
  delayShow?: number;
  delayHide?: number;
  rootClose?: boolean;
  icon?: string;
  id?: string; // can be used for screen readers
  style?: object; // changing not checked when updating if stable is true
  popover_style?: object; // changing not checked ever (default={zIndex:1000})
  stable?: boolean; // if true, children assumed to never change
  allow_touch?: boolean;
}

interface State {
  display_trigger: boolean;
}

export class Tip extends React.Component<Props, State> {
  constructor(props) {
    super(props);
    this.state = { display_trigger: false };
  }

  static defaultProps = {
    placement: "right",
    delayShow: 500,
    delayHide: 0,
    rootClose: false,
    popover_style: { zIndex: 1000 },
    allow_touch: false,
    id: "tip"
  };

  shouldComponentUpdate(props, state) {
    return (
      !this.props.stable ||
      this.state.display_trigger !== state.display_trigger ||
      misc.is_different(this.props, props, [
        "placement",
        "size",
        "delayShow",
        "delayHide",
        "rootClose",
        "icon",
        "id"
      ])
    );
  }

  render_title() {
    return (
      <span>
        {this.props.icon ? <Icon name={this.props.icon} /> : undefined}{" "}
        {this.props.title}
      </span>
    );
  }

  render_popover() {
    if (this.props.tip) {
      return (
        <Popover
          bsSize={this.props.size}
          title={this.render_title()}
          id={this.props.id}
          style={this.props.popover_style}
        >
          <span style={{ wordWrap: "break-word" }}>{this.props.tip}</span>
        </Popover>
      );
    } else {
      return (
        <Tooltip
          bsSize={this.props.size}
          id={this.props.id}
          style={this.props.popover_style}
        >
          {this.render_title()}
        </Tooltip>
      );
    }
  }

  render_overlay() {
    // NOTE: It's inadvisable to use "hover" or "focus" triggers for popovers, because they have poor
    // accessibility from keyboard and on mobile devices. -- from https://react-bootstrap.github.io/components/popovers/
    return (
      <OverlayTrigger
        placement={this.props.placement}
        overlay={this.render_popover()}
        delayShow={this.props.delayShow}
        delayHide={this.props.delayHide}
        rootClose={this.props.rootClose}
        trigger={feature.IS_TOUCH ? "click" : undefined}
      >
        <span
          style={this.props.style}
          onMouseLeave={() => this.setState({ display_trigger: false })}
        >
          {this.props.children}
        </span>
      </OverlayTrigger>
    );
  }

  render() {
    if (feature.IS_TOUCH) {
      // Tooltips are very frustrating and pointless on mobile or tablets, and cause a lot of trouble; also,
      // our assumption is that mobile users will also use the desktop version at some point, where
      // they can learn what the tooltips say.  We do optionally allow a way to use them.
      if (this.props.allow_touch) {
        return this.render_overlay();
      } else {
        return <span style={this.props.style}>{this.props.children}</span>;
      }
    }

    // display_trigger is just an optimization;
    // if delayHide is set we have to use the full overlay; if not, then using the display_trigger business is faster.
    if (this.props.delayHide || this.state.display_trigger) {
      return this.render_overlay();
    } else {
      // when there are tons of tips, this is faster.
      return (
        <span
          style={this.props.style}
          onMouseEnter={() => this.setState({ display_trigger: true })}
        >
          {this.props.children}
        </span>
      );
    }
  }
}
