import { React, rtypes, Rendered, rclass } from "./app-framework";
import { Button, ButtonGroup } from "react-bootstrap";
import { COLORS } from "smc-util/theme";
import { is_different } from "smc-util/misc2";
const { Markdown, Icon, VisibleMDLG } = require("./r_misc");
//import { Map as iMap } from "immutable";
import {
  Notifications,
  Notification,
  NotificationsActions,
  NAME as NotificationsName
} from "./system_notifications";

interface GlobalInformationMessageProps {
  actions: NotificationsActions;
  loading: boolean;
  announcements?: Notification;
  show?: string; // announcement id
  notifications?: Notifications;
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
        show: rtypes.string,
        announcements: rtypes.immutable.Map,
        notifications: rtypes.immutable.Map
      }
    };
  }

  shouldComponentUpdate(next) {
    return is_different(this.props, next, [
      "notifications",
      "announcements",
      "show",
      "loading"
    ]);
  }

  dismiss = (): void => {
    if (this.props.show != null) this.props.actions.dismiss(this.props.show);
  };

  previous = (): void => {};

  next = (): void => {};

  render_controls(): Rendered {
    return (
      <div className={"cc-announcement-control"}>
        <ButtonGroup style={{ marginRight: "10px" }}>
          <Button bsStyle={"default"} onClick={this.previous}>
            <Icon name={"step-backward"} /> <VisibleMDLG>Previous</VisibleMDLG>
          </Button>

          <Button bsStyle={"default"} onClick={this.next}>
            <Icon name={"step-forward"} /> <VisibleMDLG>Next</VisibleMDLG>
          </Button>
        </ButtonGroup>
        <ButtonGroup>
          <Button bsStyle={"danger"} onClick={this.dismiss}>
            <Icon name={"times-circle"} /> <VisibleMDLG>Close</VisibleMDLG>
          </Button>
        </ButtonGroup>
      </div>
    );
  }

  render(): Rendered | null {
    if (this.props.announcements == null || this.props.show == null)
      return null;

    const announcement = this.props.announcements.get(this.props.show);

    const priority = announcement.get("priority");
    const bgcol = (function() {
      switch (priority) {
        case "high":
          return COLORS.YELL_L;
        case "info":
          return COLORS.BLUE_LL;
      }
    })();

    const style: React.CSSProperties = {
      backgroundColor: bgcol
    };

    const text = announcement.get("text");

    return (
      <div style={style} className={"cc-announcement-banner"}>
        <div className={"cc-announcement-control"}>
          <Icon name={"exclamation-triangle"} />
        </div>
        <div className={"cc-announcement-message"}>
          <Markdown value={text} />
        </div>
        {this.render_controls()}
      </div>
    );
  }
}

export const GlobalInformationMessage = rclass(
  GlobalInformationMessageComponent
);
