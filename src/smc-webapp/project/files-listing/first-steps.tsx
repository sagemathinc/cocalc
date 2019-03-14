import * as React from "react";

import { ProjectActions } from "../../project_actions";
import { AppRedux } from "../../app-framework";

const { COLORS, Space } = require("../../r_misc");
const { Row, Col } = require("react-bootstrap");
const { SiteName } = require("../../customize");

interface Props {
  actions: ProjectActions;
  redux: AppRedux;
}

const row_style: React.CSSProperties = {
  textAlign: "center",
  padding: "10px",
  color: COLORS.GRAY_L,
  position: "absolute",
  bottom: 0,
  fontSize: "110%"
};

const link_style: React.CSSProperties = {
  cursor: "pointer",
  color: COLORS.GRAY
};

const library_comment_style: React.CSSProperties = {
  fontSize: "80%"
};

export class FirstSteps extends React.PureComponent<Props> {
  get_first_steps() {
    this.props.actions.copy_from_library({ entry: "first_steps" });
  }

  dismiss_first_steps() {
    this.props.redux
      .getTable("account")
      .set({ other_settings: { first_steps: false } });
  }

  render() {
    return (
      <Col sm={12} style={row_style}>
        <Row>
          <span>
            Are you new to <SiteName />?
          </span>
          <Space />
          <span>
            <a onClick={this.get_first_steps} style={link_style}>
              Click to start the <strong>First Steps</strong> guide!
            </a>
          </span>
          <Space />
          <span>or</span>
          <Space />
          <span>
            <a onClick={this.dismiss_first_steps} style={link_style}>
              dismiss this message
            </a>
            .
          </span>
          <br />
          <span style={library_comment_style}>
            You can also load it via "Library" → "First Steps in <SiteName />"
          </span>
        </Row>
      </Col>
    );
  }
}
