import * as React from "react";
import { Rendered } from "smc-webapp/app-framework";
import { Icon } from "./icon";
import * as misc from "smc-util/misc";
import * as feature from "../feature";

const { Popover } = require("react-bootstrap");
import { Tooltip } from "cocalc-ui";

interface Props {
  title: string | JSX.Element | JSX.Element[]; // not checked for update
  placement?: "top" | "right" | "bottom" | "left";
  tip?: string | JSX.Element | JSX.Element[]; // not checked for update
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
    delayHide: 100, // was 0, but .1 is the Antd default
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

  private render_title() {
    return (
      <span>
        {this.props.icon && <Icon name={this.props.icon} />} {this.props.title}
      </span>
    );
  }

  //  private overlay_onMouseLeave = () => {
  //   this.setState({ display_trigger: false });
  // };

  private render_tip(): Rendered {
    return (
      <Popover
        bsSize={this.props.size}
        placement={this.props.placement}
        title={this.render_title()}
        style={this.props.popover_style}
      >
        <span style={{ wordWrap: "break-word" }}>{this.props.tip}</span>
      </Popover>
    );
  }

  private render_tooltip(): Rendered {
    // NOTE: It's inadvisable to use "hover" or "focus" triggers for popovers, because they have poor
    // accessibility from keyboard and on mobile devices. -- from https://react-bootstrap.github.io/components/popovers/
    // return (
    //   <OverlayTrigger
    //     placement={this.props.placement}
    //     overlay={this.render_popover()}
    //     delayShow={this.props.delayShow}
    //     delayHide={this.props.delayHide}
    //     rootClose={this.props.rootClose}
    //     trigger={feature.IS_TOUCH ? "click" : undefined}
    //   >
    //     <span style={this.props.style} onMouseLeave={this.overlay_onMouseLeave}>
    //       {this.props.children}
    //     </span>
    //   </OverlayTrigger>
    // );

    if (this.props.delayShow == null || this.props.delayHide == null) return;

    const props: { [key: string]: any } = {
      overlayStyle: this.props.popover_style,
      placement: this.props.placement,
      trigger: "hover",
      mouseEnterDelay: this.props.delayShow / 1000,
      mouseLeaveDelay: this.props.delayHide / 1000
    };

    if (this.props.tip) {
      return (
        <Tooltip overlayClassName="" title={this.render_tip()} {...props}>
          <span style={this.props.style}>{this.props.children}</span>
        </Tooltip>
      );
    } else {
      return (
        <Tooltip title={this.render_title()} {...props}>
          <span style={this.props.style}>{this.props.children}</span>
        </Tooltip>
      );
    }
  }

  render() {
    if (feature.IS_TOUCH) {
      // Tooltips are very frustrating and pointless on mobile or tablets, and cause a lot of trouble; also,
      // our assumption is that mobile users will also use the desktop version at some point, where
      // they can learn what the tooltips say.  We do optionally allow a way to use them.
      if (this.props.allow_touch) {
        return this.render_tooltip();
      } else {
        return <span style={this.props.style}>{this.props.children}</span>;
      }
    }

    return this.render_tooltip();
  }
}
