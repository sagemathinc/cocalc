/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useIsMountedRef } from "../../app-framework";
import { Col, Row } from "react-bootstrap";
import { Button } from "../../antd-bootstrap";
// import { ProjectActions } from "../../project_actions";
import { project_websocket } from "../../frame-editors/generic/client";
import { Channel } from "../../project/websocket/types";
import { ProjectInfo, ProjectInfoCmds } from "smc-project/project-info/types";

interface Props {
  name: string;
  project_id: string;
  //  actions: ProjectActions;
}

export function ProjectInfo({ project_id /*, actions*/ }: Props): JSX.Element {
  const isMountedRef = useIsMountedRef();
  const [info, set_info] = React.useState<Partial<ProjectInfo>>({});
  const [chan, set_chan] = React.useState<Channel | null>(null);
  const [status, set_status] = React.useState<string>("initializing…");

  async function connect() {
    set_status("connecting…");
    const ws = await project_websocket(project_id);
    const chan = await ws.api.project_info();
    if (!isMountedRef.current) return;

    chan.on("data", function (data) {
      if (!isMountedRef.current) return;
      set_status("receiving…");
      set_info(data);
    });

    chan.on("close", async function () {
      if (!isMountedRef.current) return;
      set_status("closed. reconnecting in 1 second…");
      set_chan(null);
      await delay(1000);
      if (!isMountedRef.current) return;
      connect();
    });

    set_chan(chan);
  }

  React.useEffect(() => {
    connect();
    return () => {
      if (!isMountedRef.current) return;
      set_status("connection ended");
      chan?.end();
      set_chan(null);
    };
  }, []);

  function render_kill() {
    if (chan == null) return null;
    const payload: ProjectInfoCmds = { cmd: "kill", pid: 12345 };
    return (
      <Button onClick={() => chan.write(payload)}>Kill {payload.pid}</Button>
    );
  }

  return (
    <Row style={{ marginTop: "15px" }}>
      <Col md={12} mdOffset={0} lg={10} lgOffset={1}>
        <h1>Project Info</h1>
        <div>
          timestamp:{" "}
          {info.timestamp != null ? (
            <code>{new Date(info.timestamp).toLocaleString()}</code>
          ) : (
            "no timestamp"
          )}{" "}
          | connected: <code>{`${chan != null}`}</code> | status:{" "}
          <code>{status}</code>
        </div>
        <div>commands: {render_kill()}</div>
        <pre style={{ fontSize: "10px" }}>
          {JSON.stringify(info.processes, null, 2)}
        </pre>
        <pre style={{ fontSize: "10px" }}>{info.ps}</pre>
      </Col>
    </Row>
  );
}
