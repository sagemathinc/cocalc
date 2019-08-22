import { React, /*redux,*/ rtypes, Rendered, rclass } from "./app-framework";
import { Button, Col, Row } from "react-bootstrap";
import { COLORS } from "smc-util/theme";
import { is_different } from "smc-util/misc2";
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
    // if (this.props.announcements == null) return;
    // this.props.actions.dismiss(this.props.show);
  };

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
      flex: "0 0 auto",
      padding: "5px 0 5px 5px",
      backgroundColor: bgcol,
      fontSize: "18px",
      right: 0,
      left: 0
    };

    const text = announcement.get("text");

    return (
      <Row style={style}>
        <Col sm={9} style={{ paddingTop: 3 }}>
          <p>
            <b>Global notification: {text}</b>
          </p>
        </Col>
        <Col sm={3}>
          <Button
            bsStyle="danger"
            bsSize={"small"}
            className={"pull-right"}
            style={{ marginRight: "10px" }}
            onClick={this.dismiss}
          >
            Close
          </Button>
        </Col>
      </Row>
    );
  }
}

export const GlobalInformationMessage = rclass(
  GlobalInformationMessageComponent
);
