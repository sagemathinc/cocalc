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
  show_announcement?: string; // announcement id
  have_next: boolean;
  have_previous: boolean;
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
        show_announcement: rtypes.string,
        have_next: rtypes.bool,
        have_previous: rtypes.bool,
        announcements: rtypes.immutable.Map,
        notifications: rtypes.immutable.Map
      }
    };
  }

  shouldComponentUpdate(next) {
    return is_different(this.props, next, [
      "notifications",
      "announcements",
      "show_announcement",
      "loading",
      "have_next",
      "have_previous"
    ]);
  }

  dismiss = (): void => {
    this.props.actions.dismiss();
  };

  previous = (): void => {
    this.props.actions.previous();
  };

  next = (): void => {
    this.props.actions.next();
  };

  render_controls(): Rendered {
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
          <Button bsStyle={"success"} onClick={this.dismiss}>
            <Icon name={"check-circle"} /> <VisibleMDLG>Read</VisibleMDLG>
          </Button>
        </ButtonGroup>
      </div>
    );
  }

  render(): Rendered | null {
    if (
      this.props.announcements == null ||
      this.props.show_announcement == null
    ) {
      return null;
    }
    const announcement = this.props.announcements.get(
      this.props.show_announcement
    );

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
