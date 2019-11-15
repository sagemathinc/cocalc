import * as React from "react";
import { Rendered } from "smc-webapp/app-framework";
import { Icon } from "./icon";
import * as misc from "smc-util/misc";
//import { unreachable } from "smc-util/misc2";
import * as feature from "../feature";
import { Tooltip, Popover } from "cocalc-ui";
import { TooltipPlacement } from "cocalc-ui/es/tooltip";

const TIP_STYLE: React.CSSProperties = {
  wordWrap: "break-word",
  maxWidth: "250px"
};

type Size = "xsmall" | "small" | "medium" | "large";

interface Props {
  title: string | JSX.Element | JSX.Element[]; // not checked for update
  placement?: TooltipPlacement;
  tip?: string | JSX.Element | JSX.Element[]; // not checked for update
  size?: Size; // IMPORTANT: this is currently ignored -- see https://github.com/sagemathinc/cocalc/pull/4155
  delayShow?: number;
  delayHide?: number;
  rootClose?: boolean;
  icon?: string;
  id?: string; // can be used for screen readers
  style?: React.CSSProperties; // changing not checked when updating if stable is true
  popover_style?: React.CSSProperties; // changing not checked ever (default={zIndex:1000})
  stable?: boolean; // if true, children assumed to never change
  allow_touch?: boolean;
}

interface State {}

export class Tip extends React.Component<Props, State> {
  constructor(props) {
    super(props);
    this.state = {};
  }

  static defaultProps = {
    placement: "right",
    delayShow: 500, // [ms]
    delayHide: 100, // [ms] this was 0 before switching to Antd – which has 100ms as its default, though.
    rootClose: false,
    popover_style: { zIndex: 1000 },
    allow_touch: false,
    id: "tip"
  };

  shouldComponentUpdate(props) {
    return (
      !this.props.stable ||
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
    if (!this.props.icon) return this.props.title;
    return (
      <span>
        <Icon name={this.props.icon} /> {this.props.title}
      </span>
    );
  }

  // a tip is rendered in a description box below the title
  private render_tip(): Rendered {
    return <div style={TIP_STYLE}>{this.props.tip}</div>;
  }

  // this is the visible element, which gets some information
  private render_wrapped(): Rendered {
    return <span style={this.props.style}>{this.props.children}</span>;
  }

  private get_scale(): React.CSSProperties | undefined {
    return;
    // I'm disabling this since I don't think it's that useful,
    // and this does not work at all.  Plus our current react-bootstrap
    // tip implementation is horribly broken.
    /*
    if (this.props.size == null) return;
    switch (this.props.size) {
      case "xsmall":
        return { transform: "scale(0.75)" };
      case "small":
        return { transform: "scale(0.9)" };
      case "medium":
        return;
      case "large":
        return { transform: "scale(1.2)" };
      default:
        unreachable(this.props.size);
    }
    */
  }

  private render_tooltip(): Rendered {
    if (this.props.delayShow == null || this.props.delayHide == null) return;

    const props: { [key: string]: any } = {
      arrowPointAtCenter: true,
      placement: this.props.placement,
      trigger: "hover",
      mouseEnterDelay: this.props.delayShow / 1000,
      mouseLeaveDelay: this.props.delayHide / 1000
    };

    props.overlayStyle = Object.assign(
      {},
      this.props.popover_style,
      this.get_scale()
    );

    if (this.props.tip) {
      return (
        <Popover
          title={this.render_title()}
          content={this.render_tip()}
          {...props}
        >
          {this.render_wrapped()}
        </Popover>
      );
    } else {
      return (
        <Tooltip title={this.render_title()} {...props}>
          {this.render_wrapped()}
        </Tooltip>
      );
    }
  }

  render() {
    // Tooltips are very frustrating and pointless on mobile or tablets, and cause a lot of trouble; also,
    // our assumption is that mobile users will also use the desktop version at some point, where
    // they can learn what the tooltips say.  We do optionally allow a way to use them.
    if (feature.IS_TOUCH && !this.props.allow_touch) {
      return this.render_wrapped();
    }

    return this.render_tooltip();
  }
}
