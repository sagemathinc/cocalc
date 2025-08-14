/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

declare let DEBUG;

import { Alert, Button, Form, Modal, Popconfirm, Switch, Table } from "antd";
import { useEffect, useRef, useState } from "react";

import { InfoCircleOutlined, ScheduleOutlined } from "@ant-design/icons";
import { Col, Row } from "@cocalc/frontend/antd-bootstrap";
import { CSS, ProjectActions, redux } from "@cocalc/frontend/app-framework";
import { A, Loading, Tip } from "@cocalc/frontend/components";
import { SiteName } from "@cocalc/frontend/customize";
import {
  Process,
  ProjectInfo as ProjectInfoType,
} from "@cocalc/util/types/project-info/types";
import { field_cmp, seconds2hms } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { RestartProject } from "../settings/restart-project";
import {
  AboutContent,
  CGroup,
  LabelQuestionmark,
  ProcState,
  ProjectProblems,
  SignalButtons,
} from "./components";
import { CGroupInfo, DUState, PTStats, ProcessRow } from "./types";
import { DETAILS_BTN_TEXT, SSH_KEYS_DOC } from "./utils";
import { ROOT_STYLE } from "../servers/consts";

interface Props {
  any_alerts: () => boolean;
  cg_info: CGroupInfo;
  render_disconnected: () => React.JSX.Element | undefined;
  disconnected: boolean;
  disk_usage: DUState;
  error: React.JSX.Element | null;
  status: string;
  info: ProjectInfoType | null;
  loading: boolean;
  modal: string | Process | undefined;
  project_actions: ProjectActions | undefined;
  project_id: string;
  project_state: string | undefined;
  project_status: Immutable.Map<string, any> | undefined;
  pt_stats: PTStats;
  ptree: ProcessRow[] | undefined;
  select_proc: (pids: number[]) => void;
  selected: number[];
  set_expanded: (keys: number[]) => void;
  set_modal: (proc: string | Process | undefined) => void;
  set_selected: (pids: number[]) => void;
  show_explanation: boolean;
  show_long_loading: boolean;
  start_ts: number | undefined;
  render_cocalc: (proc: ProcessRow) => React.JSX.Element | undefined;
  onCellProps;
}

export function Full(props: Readonly<Props>): React.JSX.Element {
  const {
    any_alerts,
    cg_info,
    render_disconnected,
    disconnected,
    disk_usage,
    error,
    status,
    info,
    loading,
    modal,
    project_actions,
    project_id,
    project_state,
    project_status,
    pt_stats,
    ptree,
    select_proc,
    selected,
    set_expanded,
    set_modal,
    set_selected,
    show_explanation,
    show_long_loading,
    start_ts,
    render_cocalc,
    onCellProps,
  } = props;

  const problemsRef = useRef<HTMLDivElement>(null);
  const cgroupRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const explanationRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [tableHeight, setTableHeight] = useState<number>(400);

  useEffect(() => {
    const calculateTableHeight = () => {
      // Find the parent container with class "smc-vfill"
      let parentContainer = headerRef.current?.closest(
        ".smc-vfill",
      ) as HTMLElement;
      if (!parentContainer) return;

      const parentHeight = parentContainer.getBoundingClientRect().height;
      let usedHeight = 0;

      // Add height of ProjectProblems component
      if (problemsRef.current) {
        usedHeight += problemsRef.current.offsetHeight;
      }

      // Add height of CGroup component
      if (cgroupRef.current) {
        usedHeight += cgroupRef.current.offsetHeight;
      }

      // Add height of header row
      if (headerRef.current) {
        usedHeight += headerRef.current.offsetHeight;
      }

      // Add height of explanation row if visible
      if (explanationRef.current) {
        usedHeight += explanationRef.current.offsetHeight;
      }

      // Add more buffer for table header, margins, and other spacing
      usedHeight += 120;

      const availableHeight = Math.max(300, parentHeight - usedHeight);
      setTableHeight(availableHeight);
    };

    calculateTableHeight();

    // Recalculate on window resize
    window.addEventListener("resize", calculateTableHeight);
    return () => window.removeEventListener("resize", calculateTableHeight);
  }, [show_explanation, ptree]);

  function render_help() {
    return (
      <Form.Item label="Help:">
        <Switch
          checked={show_explanation}
          onChange={(val) =>
            project_actions?.setState({ show_project_info_explanation: val })
          }
        />
      </Form.Item>
    );
  }

  function render_restart_project() {
    return (
      <Form.Item>
        <RestartProject
          project_id={project_id}
          text={"Restart…"}
          size={"small"}
          danger={any_alerts()}
        />
      </Form.Item>
    );
  }

  function render_details() {
    const proc =
      selected.length === 1 ? info?.processes?.[selected[0]] : undefined;
    return (
      <Form.Item>
        <Button
          type={"primary"}
          icon={<InfoCircleOutlined />}
          disabled={proc == null}
          onClick={() => set_modal(proc)}
        >
          {DETAILS_BTN_TEXT}
        </Button>
      </Form.Item>
    );
  }

  function render_action_buttons() {
    const disabled = disconnected || selected.length == 0;
    if (disabled || info?.processes == null) return;

    return (
      <>
        {render_details()}
        <SignalButtons
          selected={selected}
          set_selected={set_selected}
          loading={loading}
          disabled={disabled}
          processes={info.processes}
          project_actions={project_actions}
        />
      </>
    );
  }

  function has_children(proc: ProcessRow): boolean {
    return proc.children != null && proc.children.length > 0;
  }

  function restart_project() {
    return (
      <Popconfirm
        title="Are you sure to restart this project?"
        onConfirm={() => {
          const actions = redux.getActions("projects");
          actions?.restart_project(project_id);
        }}
        okText="Restart"
        cancelText="No"
      >
        <a href="#">restart this project</a>
      </Popconfirm>
    );
  }

  function render_modal_footer() {
    return (
      <Button type={"primary"} onClick={() => set_modal(undefined)}>
        Ok
      </Button>
    );
  }

  function render_modals() {
    switch (modal) {
      case "ssh":
        return (
          <Modal
            title="Project's SSH Daemon"
            open={modal === "ssh"}
            footer={render_modal_footer()}
            onCancel={() => set_modal(undefined)}
          >
            <div>
              This process allows to SSH into this project. Do not terminate it!
              <br />
              Learn more: <A href={SSH_KEYS_DOC}>SSH keys documentation</A>
            </div>
          </Modal>
        );
      case "project":
        return (
          <Modal
            title="Project's process"
            open={modal === "project"}
            footer={render_modal_footer()}
            onCancel={() => set_modal(undefined)}
          >
            <div>
              This is the project's own management process. Do not terminate it!
              If it uses too much resources, you can {restart_project()}.
            </div>
          </Modal>
        );
      default:
        if (modal != null && typeof modal !== "string") {
          return (
            <Modal
              title="Process info"
              open
              width={"75vw"}
              footer={render_modal_footer()}
              onCancel={() => set_modal(undefined)}
            >
              <AboutContent proc={modal} />;
            </Modal>
          );
        }
    }
  }

  function render_not_loading_info() {
    return (
      <>
        <div>
          <Loading theme="medium" transparent />
        </div>
        {show_long_loading && (
          <Alert
            type="info"
            message={
              <div>
                <p>
                  If the Table of Processes does not load, the project might be
                  malfunctioning or saturated by load. Try restarting the
                  project to make it work again.
                </p>
                {render_restart_project()}
              </div>
            }
          />
        )}
      </>
    );
  }

  // mimic a table of processes program like htop – with tailored descriptions for cocalc
  function render_top() {
    if (ptree == null) {
      if (project_state === "running" && error == null) {
        // return <Loading />;
        return render_not_loading_info();
      } else {
        return null;
      }
    }

    const expandable = {
      defaultExpandAllRows: true,
      onExpandedRowsChange: (keys) => set_expanded(keys),
      rowExpandable: (proc) => has_children(proc),
    };

    const rowSelection = {
      selectedRowKeys: selected,
      onChange: select_proc,
      hideSelectAll: true,
    };

    const cocalc_title = (
      <Tip
        title={"The role of these processes in this project."}
        trigger={["hover", "click"]}
      >
        <LabelQuestionmark text={"Role of Process"} />
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

    const table_style: CSS = {
      marginBottom: "2rem",
    };

    return (
      <>
        <Row
          ref={headerRef}
          style={{ marginBottom: "10px", marginTop: "20px" }}
        >
          <Col md={9}>
            <Form layout="inline">
              <Form.Item label="Table of Processes" />
              {render_action_buttons()}
              {render_disconnected()}
            </Form>
          </Col>
          <Col md={3}>
            <Form layout="inline" style={{ float: "right" }}>
              {render_restart_project()}
              {render_help()}
            </Form>
          </Col>
        </Row>
        <Row ref={explanationRef}>{render_explanation()}</Row>
        <Row>
          <Table<ProcessRow>
            dataSource={ptree}
            size={"small"}
            pagination={false}
            scroll={{ y: tableHeight }}
            style={table_style}
            expandable={expandable}
            rowSelection={rowSelection}
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
              key="pid"
              title={"PID"}
              width="10%"
              align={"left"}
              render={onCellProps("pid", (x) =>
                x.pid == null ? "" : `${x.pid}`,
              )}
              sorter={field_cmp("pid")}
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
              render={onCellProps("cpu_pct", (val) => `${val.toFixed(1)}%`)}
              onCell={onCellProps("cpu_pct")}
              sorter={field_cmp("cpu_pct")}
            />
            <Table.Column<ProcessRow>
              key="cpu_tot"
              title="CPU Time"
              dataIndex="cpu_tot"
              width="10%"
              align={"right"}
              render={onCellProps("cpu_pct", (val) => seconds2hms(val))}
              onCell={onCellProps("cpu_tot")}
              sorter={field_cmp("cpu_tot")}
            />
            <Table.Column<ProcessRow>
              key="mem"
              title="Memory"
              dataIndex="mem"
              width="10%"
              align={"right"}
              render={onCellProps("cpu_pct", (val) => `${val.toFixed(0)} MiB`)}
              onCell={onCellProps("mem")}
              sorter={field_cmp("mem")}
            />
          </Table>
        </Row>
      </>
    );
  }

  function render_explanation() {
    if (!show_explanation) return;
    const msg = (
      <div>
        <p>
          This panel shows{" "}
          <strong>real-time information about this project</strong> and its
          resource usage. In particular, you can see which processes are
          running, and if available, also get a button to <SiteName /> specific
          information or links to the associated file.
        </p>
        <p>
          By selecting a process via the checkbox on the left hand side, you can
          obtain more detailed information via the "{DETAILS_BTN_TEXT}" button
          or even issue commands like sending a signal to the selected job(s).
        </p>
        <p>
          Sub-processes are shown as a tree. When you collapse a branch, the
          values you see are the sum of that particular process and all its
          children. Note that because of this tree structure, sorting happens in
          each branch, since the tree structure must also be preserved.
        </p>
        <p>
          If there are any issues detected, there will be highlights in red.
          They could be caused by individual processes using CPU non-stop, the
          total of all processes hitting the overall memory limit, or even the
          disk space running low. You can use the signals to fix some of these
          issues by interrupting/terminating a job, or restarting the project.
          If you're low on disk space, you either have to delete some files or
          purchase disk space upgrades.
        </p>
      </div>
    );
    return (
      <Col lg={8} lgOffset={2} md={12} mdOffset={0}>
        <Alert
          message={msg}
          style={{ margin: "10px 0" }}
          type={"info"}
          closable
          onClose={() =>
            project_actions?.setState({
              show_project_info_explanation: false,
            })
          }
        />
      </Col>
    );
  }

  function render_general_status() {
    return (
      <Col md={12} style={{ color: COLORS.GRAY }}>
        Timestamp:{" "}
        {info?.timestamp != null ? (
          <code>{new Date(info.timestamp).toISOString()}</code>
        ) : (
          "no timestamp"
        )}{" "}
        | Status: <code>{status}</code>
      </Col>
    );
  }

  function render_body() {
    return (
      <>
        <div ref={problemsRef}>
          <ProjectProblems project_status={project_status} />
        </div>
        <div ref={cgroupRef}>
          <CGroup
            have_cgroup={info?.cgroup != null}
            cg_info={cg_info}
            disk_usage={disk_usage}
            pt_stats={pt_stats}
            start_ts={start_ts}
            project_status={project_status}
          />
        </div>
        {render_top()}
        {render_modals()}
        {DEBUG && render_general_status()}
      </>
    );
  }

  function render_not_running() {
    if (project_state === "running") return;
    return (
      <Row>
        <Alert
          type="warning"
          banner={true}
          message={"Project is not running."}
        />
      </Row>
    );
  }

  return (
    <div style={{ ...ROOT_STYLE, maxWidth: undefined }}>
      {render_not_running()}
      {error}
      {render_body()}
    </div>
  );
}
