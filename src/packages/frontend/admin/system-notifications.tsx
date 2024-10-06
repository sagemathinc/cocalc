/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Map } from "immutable";
import { Alert, Button, Card, Input, Popconfirm, Space } from "antd";
import {
  Component,
  rclass,
  redux,
  rtypes,
} from "@cocalc/frontend/app-framework";
import { Icon, Loading, Title } from "@cocalc/frontend/components";
import { plural } from "@cocalc/util/misc";

interface Props {
  notifications?: Map<string, any>;
}

interface State {
  state: "view" | "edit";
  mesg?: string;
}

class SystemNotifications extends Component<Props, State> {
  constructor(props, state) {
    super(props, state);
    this.state = { state: "view" };
  }

  static reduxProps(): any {
    return {
      system_notifications: { notifications: rtypes.immutable },
    };
  }

  render_mark_done() {
    if (!this.props.notifications) return;
    let open = 0;
    this.props.notifications.map((mesg: Map<string, any>) => {
      if (mesg && !mesg.get("done")) {
        open += 1;
      }
    });
    if (open > 0) {
      return (
        <Button onClick={() => this.mark_all_done()}>
          Mark {open} {plural(open, "Notification")} Done
        </Button>
      );
    } else {
      return <Button disabled={true}>No Outstanding Notifications</Button>;
    }
  }

  render_buttons() {
    return (
      <Space>
        <Button onClick={() => this.setState({ state: "edit", mesg: "" })}>
          Compose...
        </Button>
        {this.render_mark_done()}
      </Space>
    );
  }

  render_editor() {
    return (
      <Card>
        <Input.TextArea
          autoFocus
          value={this.state.mesg}
          rows={3}
          onChange={(e) =>
            this.setState({
              mesg: e.target.value,
            })
          }
        />
        <Space style={{ marginTop: "15px" }}>
          <Button onClick={() => this.setState({ state: "view" })}>
            Cancel
          </Button>
          <Popconfirm
            title="Send notification?"
            description={
              <div style={{ width: "400px" }}>
                Everyone that uses CoCalc will see the following notification
                once in the upper right until you explicitly mark it done (they
                can dismiss it).
                <hr />
                <Alert message={this.state.mesg} />
              </div>
            }
            onConfirm={() => {
              this.send();
            }}
          >
            <Button danger>
              <Icon name="paper-plane" /> Send
            </Button>
          </Popconfirm>
        </Space>
      </Card>
    );
  }

  send(): void {
    this.setState({ state: "view" });
    if (!this.state.mesg) return;
    (redux.getActions("system_notifications") as any).send_message({
      text: this.state.mesg.trim(),
      priority: "high",
    });
  }

  mark_all_done(): void {
    (redux.getActions("system_notifications") as any).mark_all_done();
  }

  render_body() {
    if (this.props.notifications == null) {
      return <Loading />;
    }
    switch (this.state.state) {
      case "view":
        return this.render_buttons();
      case "edit":
        return this.render_editor();
    }
  }

  render() {
    return (
      <div>
        <Title level={4}>System Notifications</Title>
        {this.render_body()}
      </div>
    );
  }
}

const SystemNotifications0 = rclass(SystemNotifications);
export { SystemNotifications0 as SystemNotifications };
