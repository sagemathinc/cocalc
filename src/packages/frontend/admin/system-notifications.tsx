/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Map } from "immutable";
import { Alert, Button, Card, Input, Popconfirm, Space } from "antd";
import { Icon, Loading, Title } from "@cocalc/frontend/components";
import { plural } from "@cocalc/util/misc";
import { useState } from "react";
import { useActions, useRedux } from "@cocalc/frontend/app-framework";

export function SystemNotifications({}) {
  const [state, setState] = useState<"view" | "edit">("view");
  const [mesg, setMesg] = useState<string>("");
  const notifications = useRedux("system_notifications", "notifications");
  const actions = useActions("system_notifications");

  function render_mark_done() {
    if (!notifications) return;
    let open = 0;
    notifications.map((mesg: Map<string, any>) => {
      if (mesg && !mesg.get("done")) {
        open += 1;
      }
    });
    if (open > 0) {
      return (
        <Button onClick={() => mark_all_done()}>
          Mark {open} {plural(open, "Notification")} Done
        </Button>
      );
    } else {
      return <Button disabled={true}>No Outstanding Notifications</Button>;
    }
  }

  function render_buttons() {
    return (
      <Space>
        <Button
          onClick={() => {
            setState("edit");
            setMesg("");
          }}
        >
          Compose...
        </Button>
        {render_mark_done()}
      </Space>
    );
  }

  function render_editor() {
    return (
      <Card>
        <Input.TextArea
          autoFocus
          value={mesg}
          rows={3}
          onChange={(e) => setMesg(e.target.value)}
        />
        <Space style={{ marginTop: "15px" }}>
          <Button onClick={() => setState("view")}>Cancel</Button>
          <Popconfirm
            title="Send notification?"
            description={
              <div style={{ width: "400px" }}>
                Everyone that uses CoCalc will see the following notification
                once in the upper right until you explicitly mark it done (they
                can dismiss it).
                <hr />
                <Alert message={mesg} />
              </div>
            }
            onConfirm={() => {
              send();
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

  function send(): void {
    setState("view");
    if (!mesg) return;
    actions.send_message({
      text: mesg.trim(),
      priority: "high",
    });
  }

  function mark_all_done(): void {
    actions.mark_all_done();
  }

  function render_body() {
    if (notifications == null) {
      return <Loading />;
    }
    switch (state) {
      case "view":
        return render_buttons();
      case "edit":
        return render_editor();
    }
  }

  return (
    <div>
      <Title level={4}>System Notifications</Title>
      {render_body()}
    </div>
  );
}
