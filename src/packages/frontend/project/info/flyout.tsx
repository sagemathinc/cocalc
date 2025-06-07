/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

declare let DEBUG;

import { Alert, Table } from "antd";
import { ProjectActions, useState } from "@cocalc/frontend/app-framework";
import { Loading, Paragraph } from "@cocalc/frontend/components";
import {
  Process,
  ProjectInfo as ProjectInfoType,
} from "@cocalc/util/types/project-info/types";
import { field_cmp } from "@cocalc/util/misc";
import {
  AboutContent,
  CGroup,
  ProcState,
  ProjectProblems,
  SignalButtons,
} from "./components";
import { CGroupInfo, DUState, PTStats, ProcessRow } from "./types";

interface Props {
  wrap?: Function;
  cg_info: CGroupInfo;
  render_disconnected: () => JSX.Element | undefined;
  disconnected: boolean;
  disk_usage: DUState;
  error: JSX.Element | null;
  status: string;
  info: ProjectInfoType | null;
  loading: boolean;
  modal: string | Process | undefined;
  project_actions: ProjectActions | undefined;
  project_state: string | undefined;
  project_status: Immutable.Map<string, any> | undefined;
  pt_stats: PTStats;
  ptree: ProcessRow[] | undefined;
  select_proc: (pids: number[]) => void;
  selected: number[];
  set_modal: (proc: string | Process | undefined) => void;
  set_selected: (pids: number[]) => void;
  show_explanation: boolean;
  show_long_loading: boolean;
  start_ts: number | undefined;
  render_cocalc: (proc: ProcessRow) => JSX.Element | undefined;
  onCellProps;
}

export function Flyout(_: Readonly<Props>): JSX.Element {
  const {
    wrap,
    cg_info,
    disconnected,
    disk_usage,
    error,
    info,
    loading,
    project_actions,
    project_state,
    project_status,
    status,
    pt_stats,
    ptree,
    start_ts,
    onCellProps,
  } = _;

  const projectIsRunning = project_state === "running";

  // this is a list of pid strings, used as indices
  const [pidExpanded, setPidExpanded] = useState<string[]>([]);

  function renderExpandedProc(procRow: ProcessRow) {
    if (info?.processes == null) return;
    // pick the process from info.processes, where procRow.pid === proc.pid
    const proc = info.processes[procRow.pid];
    return (
      <AboutContent
        proc={proc}
        mode={"flyout"}
        closePid={(pid: number) => {
          setPidExpanded(pidExpanded.filter((p) => p !== pid.toString()));
        }}
        buttons={
          <SignalButtons
            pid={procRow.pid}
            loading={loading}
            processes={info.processes}
            small={true}
            project_actions={project_actions}
          />
        }
      />
    );
  }

  // mimic a table of processes program like htop – with tailored descriptions for cocalc
  function render_top() {
    if (ptree == null) {
      return null;
    }

    const expandable = {
      expandedRowKeys: pidExpanded,
      onExpandedRowsChange: (expandedRows: string[]) => {
        setPidExpanded(expandedRows);
      },
      showExpandColumn: false,
      expandRowByClick: true,
      expandedRowClassName: () => "cc-project-info-procs-flyout-row-expanded",
      expandedRowRender: (procRow: ProcessRow) => renderExpandedProc(procRow),
    };

    return (
      <Table<ProcessRow>
        dataSource={ptree}
        expandable={expandable}
        rowClassName={() => "cursor-pointer"}
        size={"small"}
        pagination={false}
        style={{
          width: "100%",
          overflowX: "hidden",
          overflowY: "auto",
        }}
        loading={disconnected || loading}
      >
        <Table.Column<ProcessRow>
          key="process"
          title="Process"
          width="50%"
          align={"left"}
          ellipsis={true}
          render={(proc) => {
            const { name, state, args } = proc;
            return (
              <span title={`${name} ${args}`}>
                <ProcState state={state} /> <b>{name}</b> <span>{args}</span>
              </span>
            );
          }}
          sorter={field_cmp("name")}
        />
        <Table.Column<ProcessRow>
          key="cpu_pct"
          title="CPU%"
          width="25%"
          dataIndex="cpu_pct"
          align={"right"}
          render={onCellProps("cpu_pct", (val) => `${Math.round(val)}%`)}
          onCell={onCellProps("cpu_pct")}
          sorter={field_cmp("cpu_pct")}
        />
        <Table.Column<ProcessRow>
          key="mem"
          title="MEM"
          dataIndex="mem"
          width="25%"
          align={"right"}
          render={onCellProps("mem", (val) => `${val.toFixed(0)}M`)}
          onCell={onCellProps("mem")}
          sorter={field_cmp("mem")}
        />
      </Table>
    );
  }

  function renderCgroup() {
    return (
      <CGroup
        have_cgroup={info?.cgroup != null}
        cg_info={cg_info}
        disk_usage={disk_usage}
        pt_stats={pt_stats}
        start_ts={start_ts}
        project_status={project_status}
        mode={"flyout"}
        style={{ flex: "1 0 auto", marginBottom: "10px" }}
      />
    );
  }

  function render_general_status() {
    if (!DEBUG) return null;
    return (
      <Paragraph type="secondary">
        Timestamp:{" "}
        {info?.timestamp != null ? (
          <code>{new Date(info.timestamp).toISOString()}</code>
        ) : (
          "no timestamp"
        )}{" "}
        <br />
        Status: <code>{status}</code>
      </Paragraph>
    );
  }

  function body() {
    return (
      <div
        style={{
          flex: "1 1 auto",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          height: "100%",
        }}
      >
        <ProjectProblems project_status={project_status} />
        {renderCgroup()}
        {wrap ? wrap(render_top()) : render_top()}
        {render_general_status()}
      </div>
    );
  }

  function notRunning() {
    if (!projectIsRunning) {
      return (
        <Alert
          type="warning"
          banner={true}
          message={"Project is not running."}
        />
      );
    }
  }

  if (projectIsRunning && loading) {
    return <Loading theme="medium" transparent />;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        height: "100%",
      }}
    >
      {notRunning()}
      {error}
      {body()}
    </div>
  );
}
