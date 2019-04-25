import { React, redux, Rendered } from "./app-framework";
import { Button, Col, Row } from "react-bootstrap";
import { COLORS } from "smc-util/theme";
import { Map as iMap } from "immutable";

interface GlobalInformationMessageProps {
  announcement: iMap;
}

interface GlobalInformationMessageState {}

// This is used in the "desktop_app" to show a global announcement on top of CoCalc.
// 2019: upgraded to display system messages and information announcements, driven by to "system_announcements" table
export class GlobalInformationMessage extends React.Component<
  GlobalInformationMessageProps,
  GlobalInformationMessageState
> {
  constructor(props) {
    super(props);
    this.state = {};
  }

  static defaultProps = {};

  shouldComponentUpdate(next) {
    return this.props.announcement != next.announcement;
  }

  dismiss = (): void => {
    const priority = this.props.announcement.get("priority");
    const time = this.props.announcement.get("time");
    redux
      .getTable("account")
      .set({ other_settings: { [`announcement_${priority}`]: time } });
  };

  render(): Rendered {
    const priority = this.props.announcement.get("priority");
    const bgcol = (function() {
      switch (priority) {
        case "high":
          return COLORS.YELL_L;
        case "info":
          return COLORS.BLUE_LL;
      }
    })();

    const style: React.CSSProperties = {
      padding: "5px 0 5px 5px",
      backgroundColor: bgcol,
      fontSize: "18px",
      position: "fixed" as "fixed",
      zIndex: 101,
      right: 0,
      left: 0,
      height: "36px"
    };

    const text = this.props.announcement.get("text");

    return (
      <Row style={style}>
        <Col sm={9} style={{ paddingTop: 3 }}>
          <p>
            <b>Global announcement: {text}</b>
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
