/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

declare let DEBUG;

import { ScheduleOutlined } from "@ant-design/icons";
import { Alert, Form, Table } from "antd";

import { Col, Row } from "@cocalc/frontend/antd-bootstrap";
import { CSS } from "@cocalc/frontend/app-framework";
import { Loading, Tip } from "@cocalc/frontend/components";
import { field_cmp } from "@cocalc/util/misc";
import {
  CGroup,
  LabelQuestionmark,
  ProcState,
  ProjectProblems,
} from "./components";
import { ProcessRow } from "./types";

export function Flyout(_: Readonly<any>): JSX.Element {
  const {
    wrap,
    cg_info,
    disconnected,
    disk_usage,
    error,
    info,
    loading,
    project_state,
    project_status,
    pt_stats,
    ptree,
    start_ts,
    render_disconnected,
    render_cocalc,
    render_val,
  } = _;

  // mimic a table of processes program like htop – with tailored descriptions for cocalc
  function render_top() {
    if (ptree == null) {
      if (project_state === "running" && error == null) {
        return <Loading />;
      } else {
        return null;
      }
    }

    const cocalc_title = (
      <Tip
        title={"The role of these processes in this project."}
        trigger={["hover", "click"]}
      >
        <LabelQuestionmark text={"Project"} />
      </Tip>
    );

    const state_title = (
      <Tip
        title={
          "Process state: running means it is actively using CPU, while sleeping means it waits for input."
        }
        trigger={["hover", "click"]}
      >
        <ScheduleOutlined />
      </Tip>
    );

    const table_style: CSS = { marginBottom: "2rem" };

    return (
      <>
        <Row style={{ marginBottom: "10px", marginTop: "20px" }}>
          <Col md={9}>
            <Form layout="inline">
              <Form.Item label="Table of Processes" />
              {render_disconnected()}
            </Form>
          </Col>
        </Row>
        <Row>
          <Table<ProcessRow>
            dataSource={ptree}
            size={"small"}
            pagination={false}
            scroll={{ y: "65vh" }}
            style={table_style}
            loading={disconnected || loading}
          >
            <Table.Column<ProcessRow>
              key="process"
              title="Process"
              width="40%"
              align={"left"}
              ellipsis={true}
              render={(proc) => (
                <span>
                  <b>{proc.name}</b> <span>{proc.args}</span>
                </span>
              )}
              sorter={field_cmp("name")}
            />
            <Table.Column<ProcessRow>
              key="cocalc"
              title={cocalc_title}
              width="15%"
              align={"left"}
              render={(proc) => (
                <div style={{ width: "100%", overflow: "hidden" }}>
                  {render_cocalc(proc)}
                </div>
              )}
              sorter={field_cmp("cocalc")}
            />
            <Table.Column<ProcessRow>
              key="cpu_state"
              title={state_title}
              width="5%"
              align={"right"}
              render={(proc) => <ProcState state={proc.state} />}
              sorter={field_cmp("state")}
            />
            <Table.Column<ProcessRow>
              key="cpu_pct"
              title="CPU%"
              width="10%"
              dataIndex="cpu_pct"
              align={"right"}
              render={render_val("cpu_pct", (val) => `${val.toFixed(1)}%`)}
              sorter={field_cmp("cpu_pct")}
            />
            <Table.Column<ProcessRow>
              key="mem"
              title="Memory"
              dataIndex="mem"
              width="10%"
              align={"right"}
              render={render_val("mem", (val) => `${val.toFixed(0)}MiB`)}
              sorter={field_cmp("mem")}
            />
          </Table>
        </Row>
      </>
    );
  }

  function body() {
    return (
      <>
        <ProjectProblems project_status={project_status} />
        <CGroup
          have_cgroup={info?.cgroup != null}
          cg_info={cg_info}
          disk_usage={disk_usage}
          pt_stats={pt_stats}
          start_ts={start_ts}
          project_status={project_status}
        />
        {render_top()}
      </>
    );
  }

  function renderError() {
    if (error == null) return;
    return <Alert message={error} type="error" />;
  }

  return (
    <div style={{ paddingRight: "5px" }}>
      {renderError()}
      {wrap(body())}
    </div>
  );
}
