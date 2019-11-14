import { React, rtypes, Rendered, rclass, redux } from "./app-framework";
import { Button, ButtonGroup, NavItem } from "react-bootstrap";
import { COLORS } from "smc-util/theme";
import { is_different, unreachable } from "smc-util/misc2";
const { Markdown, Icon, VisibleMDLG, Tip, TimeAgo } = require("./r_misc");
//import { Map as iMap } from "immutable";
import {
  Messages,
  Message,
  NotificationsActions,
  NAME_SYSTEM as NotificationsName,
  Priority
} from "./system_notifications";

interface GlobalInformationToggleProps {
  open: boolean;
}

export class GlobalInformationToggle extends React.Component<
  GlobalInformationToggleProps
> {
  constructor(props, state) {
    super(props, state);
  }

  private static tip_style: React.CSSProperties = {
    display: "block",
    fontSize: "15pt",
    padding: "10px"
  };

  private static outer_style: React.CSSProperties = {
    position: "relative",
    float: "left"
  };

  private toggle = (): void => {
    (redux.getActions("page") as any).toggle_global_information();
  };

  render(): Rendered {
    const icon = this.props.open ? "far fa-envelope-open" : "far fa-envelope";
    const icon_style: React.CSSProperties = {
      color: this.props.open ? COLORS.BLUE : COLORS.GRAY,
      cursor: "pointer"
    };
    return (
      <NavItem
        ref={"fullscreen"}
        style={GlobalInformationToggle.outer_style}
        onClick={this.toggle}
      >
        <Tip
          style={GlobalInformationToggle.tip_style}
          title={
            "Show global announcements, system notifications and application alerts."
          }
          placement={"bottom"}
        >
          <Icon style={icon_style} name={icon} />
        </Tip>
      </NavItem>
    );
  }
}

const TIMEAGO_STYLE: React.CSSProperties = {
  fontSize: "10pt"
};

interface GlobalInformationMessageProps {
  actions: NotificationsActions;
  loading: boolean;
  messages?: Messages;
  current_message?: Message;
  have_next: boolean;
  have_previous: boolean;
  notifications?: Messages;
}

interface GlobalInformationMessageState {}

// This is used in the "desktop_app" to show a global announcement on top of CoCalc.
// 2019: upgraded to display system messages and information announcements, driven by to "system_announcements" table
class GlobalInformationMessageComponent extends React.Component<
  GlobalInformationMessageProps,
  GlobalInformationMessageState
> {
  constructor(props) {
    super(props);
    this.state = {};
  }

  static defaultProps = {};

  public static reduxProps() {
    return {
      [NotificationsName]: {
        loading: rtypes.bool,
        current_message: rtypes.immutable.Map,
        have_next: rtypes.bool,
        have_previous: rtypes.bool,
        messages: rtypes.immutable.Map
      }
    };
  }

  shouldComponentUpdate(next) {
    return is_different(this.props, next, [
      "notifications",
      "announcements",
      "current_message",
      "loading",
      "have_next",
      "have_previous"
    ]);
  }

  dismiss_all = (priority): void => {
    this.props.actions.dismiss_all(priority);
  };

  previous = (): void => {
    this.props.actions.previous();
  };

  next = (): void => {
    this.props.actions.next();
  };

  render_controls(priority): Rendered {
    return (
      <div className={"cc-announcement-control"}>
        <ButtonGroup style={{ marginRight: "10px" }}>
          <Button
            bsStyle={"default"}
            onClick={this.previous}
            disabled={!this.props.have_previous}
          >
            <Icon name={"step-backward"} /> <VisibleMDLG>Previous</VisibleMDLG>
          </Button>

          <Button
            bsStyle={"default"}
            onClick={this.next}
            disabled={!this.props.have_next}
          >
            <Icon name={"step-forward"} /> <VisibleMDLG>Next</VisibleMDLG>
          </Button>
        </ButtonGroup>

        <ButtonGroup>
          <Button
            bsStyle={"success"}
            onClick={() => this.dismiss_all(priority)}
          >
            <Icon name={"check-circle"} />{" "}
            <VisibleMDLG>Mark all read</VisibleMDLG>
          </Button>
        </ButtonGroup>
      </div>
    );
  }

  private color_and_icon(priority: Priority): [string, string] {
    switch (priority) {
      case "high":
        return [COLORS.BS_BG_DANGER, "info-circle"];
      case "info":
        return [COLORS.BS_BG_INFO, "far fa-lightbulb"];
      case "alert":
        return [COLORS.BS_BG_WARNING, "exclamation-triangle"];
      default:
        unreachable(priority);
        return ["", ""];
    }
  }

  render(): Rendered | null {
    if (this.props.current_message == null) {
      return null;
    }
    const message = this.props.current_message;

    const priority: Priority = message.get("priority") as Priority;
    const [bgcol, info_icon] = this.color_and_icon(priority);

    const style: React.CSSProperties = {
      backgroundColor: bgcol
    };

    const text = message.get("text");

    return (
      <div style={style} className={"cc-announcement-banner"}>
        <div className={"cc-announcement-control"}>
          <Icon name={info_icon} />
        </div>
        <div className={"cc-announcement-message"}>
          <Markdown value={text} />
        </div>
        <div className={"cc-announcement-control"}>
          <TimeAgo
            date={message.get("time")}
            placement={"bottom"}
            style={TIMEAGO_STYLE}
          />
        </div>
        {this.render_controls(priority)}
      </div>
    );
  }
}

export const GlobalInformationMessage = rclass(
  GlobalInformationMessageComponent
);
