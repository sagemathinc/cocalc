/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";

import { alert_message } from "@cocalc/frontend/alerts";
import {
  A,
  Icon,
  Paragraph,
  SettingBox,
  Text,
} from "@cocalc/frontend/components";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { COLORS } from "@cocalc/util/theme";
import { Button } from "react-bootstrap";

interface Props {
  project_id: string;
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
    this._mounted = true;
  }

  componentWillUnmount() {
    this._mounted = false;
  }

  restart_worksheet = async () => {
    this.setState({ loading: true });
    try {
      await webapp_client.project_client.exec({
        project_id: this.props.project_id,
        command: "smc-sage-server stop; sleep 1; smc-sage-server start",
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
          "Error trying to restart worksheet server. Try restarting the entire project instead.",
      });
    }
    if (this._mounted) {
      // see https://github.com/sagemathinc/cocalc/issues/1684
      this.setState({ loading: false });
    }
  };

  render() {
    return (
      <SettingBox title="Restart Sage Worksheet Server" icon="refresh">
        <Paragraph>
          This restarts the underlying{" "}
          <A href={"https://doc.cocalc.com/sagews.html"}>Sage Worksheet</A>{" "}
          server. You have to do this, if you customized your{" "}
          <Text code>$HOME/bin/sage</Text>.
        </Paragraph>
        <Paragraph style={{ color: COLORS.GRAY_D }}>
          Existing worksheet sessions are unaffected. This means you have to
          restart your worksheet as well to use the new version of Sage.
        </Paragraph>
        <Paragraph style={{ textAlign: "center" }}>
          <Button
            bsStyle="warning"
            disabled={this.state.loading}
            onClick={this.restart_worksheet}
          >
            <Icon name="refresh" spin={this.state.loading} /> Restart SageWS
            Server
          </Button>
        </Paragraph>
      </SettingBox>
    );
  }
}
