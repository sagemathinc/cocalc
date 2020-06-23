/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { Icon, SettingBox } from "smc-webapp/r_misc";
import { Row, Col, Button } from "react-bootstrap";
import { Project } from "./types";
import { alert_message } from "../../alerts";
import { webapp_client } from "../../webapp-client";

interface Props {
  project: Project;
}

interface State {
  loading: boolean;
}

export class SagewsControl extends React.Component<Props, State> {
  private _mounted: boolean;

  constructor(props) {
    super(props);
    this.state = {
      loading: false,
    };
  }

  componentDidMount() {
    return (this._mounted = true);
  }

  componentWillUnmount() {
    return delete this._mounted;
  }

  restart_worksheet = async () => {
    this.setState({ loading: true });
    try {
      await webapp_client.project_client.exec({
        project_id: this.props.project.get("project_id"),
        command: "smc-sage-server stop; smc-sage-server start",
        timeout: 30,
      });
      if (!this._mounted) return;
      alert_message({
        type: "info",
        message:
          "Worksheet server restarted. Restarted worksheets will use a new Sage session.",
      });
    } catch (err) {
      if (!this._mounted) return;
      alert_message({
        type: "error",
        message:
          "Error trying to restart worksheet server. Try restarting the project server instead.",
      });
    }
    if (this._mounted) {
      // see https://github.com/sagemathinc/cocalc/issues/1684
      this.setState({ loading: false });
    }
  };

  render() {
    return (
      <SettingBox title="Sage worksheet server" icon="refresh">
        <Row>
          <Col sm={8}>
            Restart this Sage Worksheet server. <br />
            <span style={{ color: "#666" }}>
              Existing worksheet sessions are unaffected; restart this server if
              you customize $HOME/bin/sage, so that restarted worksheets will
              use the new version of Sage.
            </span>
          </Col>
          <Col sm={4}>
            <Button
              bsStyle="warning"
              disabled={this.state.loading}
              onClick={this.restart_worksheet}
            >
              <Icon name="refresh" spin={this.state.loading} /> Restart Sage
              Worksheet Server
            </Button>
          </Col>
        </Row>
      </SettingBox>
    );
  }
}
