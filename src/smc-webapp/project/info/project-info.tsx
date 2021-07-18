/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

declare let DEBUG;

import { delay } from "awaiting";
import {
  React,
  CSS,
  redux,
  Rendered,
  useState,
  useRef,
  useTypedRedux,
  useIsMountedRef,
  useActions,
} from "../../app-framework";
import { Col, Row } from "../../antd-bootstrap";
import { Alert, Table, Button, Form, Popconfirm, Modal, Switch } from "antd";
import { InfoCircleOutlined, ScheduleOutlined } from "@ant-design/icons";
import { webapp_client } from "../../webapp-client";
import { seconds2hms, unreachable } from "smc-util/misc";
import { A, Tip, Loading } from "../../r_misc";
import { RestartProject } from "../settings/restart-project";
import { Channel } from "../../project/websocket/types";
import { ProjectInfo as WSProjectInfo } from "../websocket/project-info";
import { ProjectInfo as ProjectInfoType, Process } from "smc-project/project-info/types";
import { cgroup_stats } from "smc-project/project-status/utils";
import {
  CGroupFC,
  CoCalcFile,
  LabelQuestionmark,
  ProcState,
  AboutContent,
  SignalButtons,
} from "./components";
import { ProcessRow, PTStats, CGroupInfo, DUState } from "./types";
import { connect_ws, process_tree, sum_children, grid_warning } from "./utils";
import { COLORS } from "smc-util/theme";
import { SiteName } from "../../customize";

const SSH_KEYS_DOC = "https://doc.cocalc.com/project-settings.html#ssh-keys";
const DETAILS_BTN_TEXT = "Details";

interface Props {
  name: string;
  project_id: string;
}

const gc_info_init: CGroupInfo = {
  mem_rss: NaN,
  mem_tot: NaN,
  cpu_pct: NaN, // 0 to 100
  mem_pct: NaN,
  cpu_usage_rate: NaN,
  cpu_usage_limit: NaN,
} as const;

const du_init: DUState = {
  pct: NaN, // 0 to 100
  usage: NaN,
  total: NaN,
} as const;

const pt_stats_init = {
  threads: 0,
  nprocs: 0,
  sum_cpu_time: 0,
  sum_cpu_pct: 0,
  sum_memory: 0,
} as const;

export const ProjectInfo: React.FC<Props> = React.memo(
  ({ project_id }: Props) => {
    const isMountedRef = useIsMountedRef();
    const project_actions = useActions({ project_id });
    const [idle_timeout, set_idle_timeout] = useState<number>(30 * 60);
    const show_explanation =
      useTypedRedux({ project_id }, "show_project_info_explanation") ?? false;
    // this is smc-project/project-status/types::ProjectStatus
    const project_status = useTypedRedux({ project_id }, "status");
    const project_map = useTypedRedux("projects", "project_map");
    const [project, set_project] = useState(project_map?.get(project_id));
    const [project_state, set_project_state] = useState<string | undefined>();
    const [start_ts, set_start_ts] = useState<number | undefined>(undefined);
    const [info, set_info] = useState<ProjectInfoType | undefined>(undefined);
    const [ptree, set_ptree] = useState<ProcessRow[] | undefined>(undefined);
    const [pt_stats, set_pt_stats] = useState<PTStats>(pt_stats_init);
    // chan: websocket channel to send commands to the project (for now)
    const [chan, set_chan] = useState<Channel | null>(null);
    const chanRef = useRef<Channel | null>(null);
    // sync-object sending us the real-time data about the project
    const [sync, set_sync] = useState<WSProjectInfo | null>(null);
    const syncRef = useRef<WSProjectInfo | null>(null);
    const [status, set_status] = useState<string>("initializing…");
    const [loading, set_loading] = useState<boolean>(true);
    const [disconnected, set_disconnected] = useState<boolean>(true);
    const [selected, set_selected] = useState<number[]>([]);
    const [expanded, set_expanded] = useState<React.ReactText[]>([]);
    const [have_children, set_have_children] = useState<string[]>([]);
    const [cg_info, set_cg_info] = useState<CGroupInfo>(gc_info_init);
    const [disk_usage, set_disk_usage] = useState<DUState>(du_init);
    const [error, set_error] = useState<JSX.Element | null>(null);
    const [modal, set_modal] = useState<string | Process | undefined>(
      undefined
    );
    const [show_bug, set_show_bug] = useState(false);

    React.useMemo(() => {
      if (project_map == null) return;
      set_project(project_map.get(project_id));
    }, [project_map]);

    React.useEffect(() => {
      if (project == null) return;
      const next_start_ts = project.getIn(["status", "start_ts"]);
      if (next_start_ts != start_ts) {
        set_start_ts(next_start_ts);
      }
      const next_state = project.getIn(["state", "state"]);
      if (next_state != project_state) {
        set_project_state(next_state);
      }
    }, [project]);

    React.useEffect(() => {
      chanRef.current = chan;
    }, [chan]);

    React.useEffect(() => {
      syncRef.current = sync;
    }, [sync]);

    React.useEffect(() => {
      set_disconnected(chan == null || sync == null);
    }, [sync, chan]);

    // used in render_not_loading_info()
    React.useEffect(() => {
      const timer = setTimeout(() => set_show_bug(true), 5000);
      return () => clearTimeout(timer);
    }, []);

    async function connect() {
      set_status("connecting…");
      try {
        // the synctable for the project info
        const info_sync = webapp_client.project_client.project_info(project_id);

        // this might fail if the project is not updated
        const chan = await connect_ws(project_id);
        if (!isMountedRef.current) return;

        const update = () => {
          if (!isMountedRef.current) return;
          const data = info_sync.get();
          if (data != null) {
            set_info(data.toJS() as ProjectInfoType);
          } else {
            console.warn("got no data from info_sync.get()");
          }
        };

        info_sync.once("change", function () {
          if (!isMountedRef.current) return;
          set_loading(false);
          set_status("receiving…");
        });

        info_sync.on("change", update);
        info_sync.once("ready", update);

        chan.on("close", async function () {
          if (!isMountedRef.current) return;
          set_status("websocket closed: reconnecting in 3 seconds…");
          set_chan(null);
          await delay(3000);
          if (!isMountedRef.current) return;
          set_status("websocket closed: reconnecting now…");
          const new_chan = await connect_ws(project_id);
          if (!isMountedRef.current) {
            // well, we got one but now we don't need it
            new_chan.end();
            return;
          }
          set_status("websocket closed: got new connection…");
          set_chan(new_chan);
        });

        set_chan(chan);
        set_sync(info_sync);
      } catch (err) {
        set_error(
          <>
            <strong>Project information setup problem:</strong> {`${err}`}
          </>
        );
        return;
      }
    }

    // once when mounted
    function get_idle_timeout() {
      const ito = redux.getStore("projects").get_idle_timeout(project_id);
      set_idle_timeout(ito);
    }

    // each time the project state changes (including when mounted) we connect/reconnect
    React.useEffect(() => {
      if (project_state !== "running") return;
      try {
        connect();
        get_idle_timeout();
        return () => {
          if (isMountedRef.current) {
            set_status("closing connection");
          }
          if (chanRef.current != null) {
            if (chanRef.current.readyState === chanRef.current.OPEN) {
              chanRef.current.end();
            }
          }
          if (syncRef.current != null) {
            syncRef.current.close();
          }
        };
      } catch (err) {
        if (isMountedRef.current) {
          set_status(`ERROR: ${err}`);
        }
      }
    }, [project_state]);

    function update_top(info: ProjectInfoType) {
      // this shouldn't be the case, but somehow I saw this happening once
      // the ProjectInfoType type is updated to refrect this edge case and here we bail out
      // and wait for the next update of "info" to get all processes…
      if (info.processes == null) return;
      const pchildren: string[] = [];
      const pt_stats = { ...pt_stats_init };
      const new_ptree =
        process_tree(info.processes, 1, pchildren, pt_stats) ?? [];
      sum_children(new_ptree);
      set_ptree(new_ptree);
      set_pt_stats(pt_stats);
      set_have_children(pchildren);
    }

    // when "info" changes, we compute a few derived values and the data for the process table
    React.useEffect(() => {
      if (info == null) return;
      update_top(info);
      const cg = info.cgroup;
      const du = info.disk_usage;

      if (cg != null && du?.tmp != null) {
        const { mem_rss, mem_tot, mem_pct, cpu_pct } = cgroup_stats(cg, du.tmp);
        set_cg_info({
          mem_rss,
          mem_tot,
          mem_pct,
          cpu_pct,
          cpu_usage_rate: cg.cpu_usage_rate,
          cpu_usage_limit: cg.cpu_cores_limit,
        });
      }

      if (du?.project != null) {
        const p = du.project;
        // usage could be higher than available, i.e. when quotas aren't quick enough
        // or it has been changed at a later point in time
        const total = p.usage + p.available;
        const pct = 100 * Math.min(1, p.usage / total);
        set_disk_usage({ pct, usage: p.usage, total });
      }
    }, [info]);

    function select_proc(pids: number[]) {
      set_selected(pids);
    }

    function val_max_value(index): number {
      switch (index) {
        case "cpu_pct":
          return 100;
        case "cpu_tot":
          return idle_timeout;
        case "mem":
          const hml = info?.cgroup?.mem_stat.hierarchical_memory_limit;
          if (hml != null) {
            // 50% of max memory
            return hml / 2;
          } else {
            1000; // 1 gb
          }
      }
      return 1;
    }

    // if collapsed, we sum up the values of the children
    // to avoid misunderstandings due to data not being shown…
    function render_val(
      index: string,
      to_str: (val) => Rendered | React.ReactText
    ) {
      const cell_val = (val, proc): number => {
        // we have to check for length==0, because initally rows are all expanded but
        // onExpandedRowsChange isn't triggered
        if (
          expanded.length == 0 ||
          expanded.includes(proc.key) ||
          !have_children.includes(proc.key)
        ) {
          return val;
        } else {
          const cs = proc.chldsum;
          return val + (cs != null ? cs[index] : 0);
        }
      };

      const max_val = val_max_value(index);

      return (val: number, proc: ProcessRow) => {
        const display_val = cell_val(val, proc);
        return {
          props: { style: grid_warning(display_val, max_val) },
          children: to_str(display_val),
        };
      };
    }

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

    function any_alerts(): boolean {
      return project_status?.get("alerts").size > 0;
    }

    function render_restart_project() {
      const style = any_alerts() ? "danger" : "default";
      return (
        <Form.Item>
          <RestartProject
            project_id={project_id}
            text={"Restart…"}
            bsStyle={style}
            bsSize={"small"}
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

    function render_disconnected() {
      if (!disconnected) return;
      return <Alert type={"warning"} message={"Warning: disconnected …"} />;
    }

    function render_action_buttons() {
      const disabled = disconnected || selected.length == 0;
      if (disabled || info?.processes == null) return;

      return (
        <>
          {render_details()}
          <SignalButtons
            chan={chan}
            selected={selected}
            set_selected={set_selected}
            loading={loading}
            disabled={disabled}
            processes={info.processes}
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

    function render_cocalc_btn({ title, onClick }) {
      return (
        <Button shape="round" onClick={onClick}>
          {title}
        </Button>
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
              visible={modal === "ssh"}
              footer={render_modal_footer()}
              onCancel={() => set_modal(undefined)}
            >
              <div>
                This process allows to SSH into this project. Do not terminate
                it!
                <br />
                Learn more: <A href={SSH_KEYS_DOC}>SSH keys documentation</A>
              </div>
            </Modal>
          );
        case "project":
          return (
            <Modal
              title="Project's process"
              visible={modal === "project"}
              footer={render_modal_footer()}
              onCancel={() => set_modal(undefined)}
            >
              <div>
                This is the project's own management process. Do not terminate
                it! If it uses too much resources, you can {restart_project()}.
              </div>
            </Modal>
          );
        default:
          if (modal != null && typeof modal !== "string") {
            return (
              <Modal
                title="Process info"
                visible={true}
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

    function render_cocalc({ cocalc }: ProcessRow) {
      if (cocalc == null) return;
      switch (cocalc.type) {
        case "project":
          return render_cocalc_btn({
            title: "Project",
            onClick: () => set_modal("project"),
          });

        case "sshd":
          return render_cocalc_btn({
            title: "SSH",
            onClick: () => set_modal("ssh"),
          });

        case "terminal":
          return (
            <CoCalcFile
              icon={"terminal"}
              path={cocalc.path}
              project_actions={project_actions}
            />
          );

        case "jupyter":
          return (
            <CoCalcFile
              icon={"ipynb"}
              path={cocalc.path}
              project_actions={project_actions}
            />
          );

        case "x11":
          return (
            <CoCalcFile
              icon={"window-restore"}
              path={cocalc.path}
              project_actions={project_actions}
            />
          );

        default:
          unreachable(cocalc);
      }
    }

    // TODO remove this after https://github.com/sagemathinc/cocalc/issues/5081 is fixed
    function render_not_loading_info() {
      return (
        <>
          <div>
            <Loading />
          </div>
          {show_bug && (
            <Alert
              type="info"
              message={
                <div>
                  <p>
                    If the Table of Processes does not load, you probably hit{" "}
                    <A
                      href={"https://github.com/sagemathinc/cocalc/issues/5081"}
                    >
                      Issue #5081
                    </A>
                    . You have to restart the project to make it work again.
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
          <Row>{render_explanation()}</Row>
          <Row>
            <Table<ProcessRow>
              dataSource={ptree}
              size={"small"}
              pagination={false}
              scroll={{ y: "65vh" }}
              style={table_style}
              expandable={expandable}
              rowSelection={rowSelection}
              loading={disconnected || loading}
            >
              <Table.Column<ProcessRow>
                key="process"
                title="Process"
                width="58%"
                align={"left"}
                ellipsis={true}
                render={(proc) => (
                  <span>
                    <b>{proc.name}</b> <span>{proc.args}</span>
                  </span>
                )}
              />
              <Table.Column<ProcessRow>
                key="cocalc"
                title={cocalc_title}
                width="10%"
                align={"left"}
                render={(proc) => render_cocalc(proc)}
              />
              <Table.Column<ProcessRow>
                key="cpu_state"
                title={state_title}
                width="2%"
                align={"right"}
                render={(proc) => <ProcState state={proc.state} />}
              />
              <Table.Column<ProcessRow>
                key="cpu_pct"
                title="CPU%"
                width="10%"
                dataIndex="cpu_pct"
                align={"right"}
                render={render_val("cpu_pct", (val) => `${val.toFixed(1)}%`)}
              />
              <Table.Column<ProcessRow>
                key="cpu_tot"
                title="CPU Time"
                dataIndex="cpu_tot"
                width="10%"
                align={"right"}
                render={render_val("cpu_tot", (val) => seconds2hms(val))}
              />
              <Table.Column<ProcessRow>
                key="mem"
                title="Memory"
                dataIndex="mem"
                width="10%"
                align={"right"}
                render={render_val("mem", (val) => `${val.toFixed(0)}MiB`)}
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
            running, and if available, also get a button to <SiteName />{" "}
            specific information or links to the associated file.
          </p>
          <p>
            By selecting a process via the checkbox on the left hand side, you
            can obtain more detailed information via the "{DETAILS_BTN_TEXT}"
            button or even issue commands like sending a signal to the selected
            job(s).
          </p>
          <p>
            Sub-processes are shown as a tree. When you collapse a branch, the
            values you see are the sum of that particular process and all its
            children.
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
          | Connections sync=<code>{`${sync != null}`}</code> chan=
          <code>{`${chan != null}`}</code> | Status: <code>{status}</code>
        </Col>
      );
    }

    function render_body() {
      return (
        <>
          <CGroupFC
            have_cgroup={info?.cgroup != null}
            cg_info={cg_info}
            disk_usage={disk_usage}
            pt_stats={pt_stats}
            start_ts={start_ts}
            project_status={project_status}
          />
          {render_top()}
          {render_modals()}
          {DEBUG && render_general_status()}
        </>
      );
    }

    function render_error() {
      if (error == null) return;
      return (
        <Row>
          <Alert message={error} type="error" />
        </Row>
      );
    }

    function render_not_running() {
      if (project_state === "running") return;
      return (
        <Row>
          <Alert type="warning" message={"Project is not running."} />
        </Row>
      );
    }

    return (
      <Row style={{ padding: "15px 15px 0 15px" }}>
        <Col md={12}>
          {render_not_running()}
          {render_error()}
          {render_body()}
        </Col>
      </Row>
    );
  }
);
