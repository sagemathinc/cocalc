/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";
import { Popconfirm } from "antd";

import { ProjectActions } from "@cocalc/frontend/project_actions";
import { redux } from "@cocalc/frontend/app-framework";

import { Space } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";
const { Row, Col } = require("react-bootstrap");
import { SiteName } from "@cocalc/frontend/customize";

interface Props {
  actions: ProjectActions;
}

const row_style: React.CSSProperties = {
  textAlign: "center",
  padding: "5px",
  color: "#666",
  bottom: 0,
  fontSize: "110%",
  background: "#fafafa",
  borderTop: "1px solid #eee",
};

const library_comment_style: React.CSSProperties = {
  fontSize: "80%",
};

export default class FirstSteps extends React.PureComponent<Props> {
  get_first_steps = () => {
    this.props.actions.copy_from_library({ entry: "first_steps" });
  };

  dismiss_first_steps = () => {
    redux.getTable("account").set({ other_settings: { first_steps: false } });
  };

  render() {
    if (!redux.getStore("account").getIn(["other_settings", "first_steps"])) {
      return null;
    }
    return (
      <Col sm={12} style={row_style}>
        <Row>
          <span>
            Are you new to <SiteName />?
          </span>
          <Space />
          <span>
            <a onClick={this.get_first_steps}>
              Start the <strong>First Steps Guide!</strong>
            </a>
          </span>
          <Space />
          <span>or</span>
          <Space />
          <span>
            <Popconfirm
              title="Don't Show First Steps Banner"
              description={
                <span>
                  You can always re-enable First Steps via "Offer the First
                  Steps guide" in{" "}
                  <a
                    onClick={() => {
                      redux.getActions("page").set_active_tab("account");
                      redux.getActions("account").set_active_tab("account");
                    }}
                  >
                    Account Preferences
                  </a>
                  .
                </span>
              }
              onConfirm={this.dismiss_first_steps}
              okText="Dismiss message"
              cancelText="No"
            >
              <a>dismiss this message</a>.
            </Popconfirm>
          </span>
        </Row>
      </Col>
    );
  }
}
