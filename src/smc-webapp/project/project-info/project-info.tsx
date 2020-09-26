/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useIsMountedRef } from "../../app-framework";
import { Col, Row } from "react-bootstrap";
import { basename } from "path";
import { Table } from "antd";
import { Loading } from "../../r_misc";
import { Button } from "../../antd-bootstrap";
// import { ProjectActions } from "../../project_actions";
import { project_websocket } from "../../frame-editors/generic/client";
import { Channel } from "../../project/websocket/types";
import {
  ProjectInfo,
  ProjectInfoCmds,
  Processes,
} from "smc-project/project-info/types";

// for the Table, derived from "Process"
interface ProcessRow {
  key: number; // pid
  pid: number;
  ppid: number;
  name: string;
  mem: number;
  cpu_tot: number;
  cpu_pct: number;
  children?: ProcessRow[];
}

interface Props {
  name: string;
  project_id: string;
  //  actions: ProjectActions;
}

// convert the flat raw data into nested rows for the table
// I bet there are better algos, but our usual case is less than 10 procs with little nesting
// we intentionally ignore PID 1 (tini)
function procs2data(procs: Processes, ppid = 1): ProcessRow[] {
  const data: ProcessRow[] = [];
  Object.values(procs).forEach((proc) => {
    if (proc.ppid == ppid) {
      data.push({
        key: proc.pid,
        pid: proc.pid,
        ppid: proc.ppid,
        name: basename(proc.exe),
        mem: proc.stat.mem.rss,
        cpu_tot: proc.cpu.secs,
        cpu_pct: proc.cpu.pct,
        children: procs2data(procs, proc.pid),
      });
    }
  });
  return data;
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

  function render_top(procs) {
    if (procs == null) return <Loading />;
    const data: ProcessRow[] = procs2data(procs);

    return (
      <Table<ProcessRow>
        dataSource={data}
        size="small"
        pagination={false}
        defaultExpandAllRows={true}
      >
        <Table.Column<ProcessRow> key="pid" title="PID" dataIndex="pid" />
        <Table.Column<ProcessRow> key="name" title="Name" dataIndex="name" />
        <Table.Column<ProcessRow>
          key="cpu_pct"
          title="CPU%"
          dataIndex="cpu_pct"
          align={"right"}
          render={(val) => `${(100 * val).toFixed(1)}%`}
        />
        <Table.Column<ProcessRow>
          key="cpu_tot"
          title="CPU Time"
          dataIndex="cpu_tot"
          align={"right"}
          render={(val) => `${val.toFixed(2)}s`}
        />
        <Table.Column<ProcessRow>
          key="mem"
          title="Memory"
          dataIndex="mem"
          align={"right"}
          render={(val) => `${val.toFixed(0)}MiB`}
        />
        <Table.Column<ProcessRow>
          key="actions"
          title="Actions"
          render={(text, record) => (
            <span>
              {text.pid} – {record.pid}
            </span>
          )}
        />
      </Table>
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
        {render_top(info.processes)}
        {false && (
          <pre style={{ fontSize: "10px" }}>
            {JSON.stringify(info.processes, null, 2)}
          </pre>
        )}
        {false && <pre style={{ fontSize: "10px" }}>{info.ps}</pre>}
      </Col>
    </Row>
  );
}
