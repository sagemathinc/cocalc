/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  React,
  CSS,
  redux,
  Rendered,
  useState,
  useRedux,
  useTypedRedux,
  useIsMountedRef,
  useActions,
} from "../../app-framework";
import { Col, Row } from "../../antd-bootstrap";
import {
  Alert,
  Table,
  Button,
  Form,
  Popconfirm,
  Space as AntdSpace,
  Modal,
  Switch,
} from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";
import { webapp_client } from "../../webapp-client";
import { seconds2hms } from "smc-util/misc";
import { A, Loading, Icon } from "../../r_misc";
import { Channel } from "../../project/websocket/types";
import { ProjectInfo as WSProjectInfo } from "../websocket/project-info";
import {
  ProjectInfo,
  ProjectInfoCmds,
  Process,
  // Processes,
  // CoCalcInfo,
} from "smc-project/project-info/types";
import { CGroupFC, CoCalcFile } from "./fcs";
import { ProcessRow, PTStats, CGroupInfo, DUState } from "./types";
import { connect_ws, process_tree, sum_children, grid_warning } from "./utils";
import { COLORS } from "smc-util/theme";
import { SiteName } from "../../customize";
import { plural } from "smc-util/misc2";

const SSH_KEYS_DOC = "https://doc.cocalc.com/project-settings.html#ssh-keys";

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
};

const du_init: DUState = {
  pct: NaN, // 0 to 100
  usage: NaN,
  total: NaN,
};

export const ProjectInfoFC: React.FC<Props> = ({ project_id }: Props) => {
  const isMountedRef = useIsMountedRef();
  const project_actions = useActions({ project_id });
  const [idle_timeout, set_idle_timeout] = useState<number>(30 * 60);
  const show_explanation =
    useTypedRedux({ project_id }, "show_project_info_explanation") ?? false;
  const project = useRedux(["projects", "project_map", project_id]);
  const [start_ts, set_start_ts] = useState<number | null>(null);
  const [info, set_info] = useState<Partial<ProjectInfo>>({});
  const [ptree, set_ptree] = useState<ProcessRow[] | null>(null);
  const [pt_stats, set_pt_stats] = useState<PTStats>({ threads: 0, nprocs: 0 });
  // chan: websocket channel to send commands to the project (for now)
  const [chan, set_chan] = useState<Channel | null>(null);
  // sync-object sending us the real-time data about the project
  const [sync, set_sync] = useState<WSProjectInfo | null>(null);
  const [status, set_status] = useState<string>("initializing…");
  const [loading, set_loading] = useState<boolean>(true);
  const [selected, set_selected] = useState<number[]>([]);
  const [expanded, set_expanded] = useState<React.ReactText[]>([]);
  const [have_children, set_have_children] = useState<string[]>([]);
  const [cg_info, set_cg_info] = useState<CGroupInfo>(gc_info_init);
  const [disk_usage, set_disk_usage] = useState<DUState>(du_init);

  function set_data(data: ProjectInfo) {
    set_info(data);
    const pchildren: string[] = [];
    const pt_stats = { threads: 0, nprocs: 0 };
    const new_ptree =
      process_tree(data.processes, 1, pchildren, pt_stats) ?? [];
    sum_children(new_ptree);
    set_ptree(new_ptree);
    set_pt_stats(pt_stats);
    set_have_children(pchildren);
  }

  async function connect() {
    set_status("connecting…");
    const info_sync = webapp_client.project_client.project_info(project_id);
    const chan = await connect_ws(project_id);
    if (!isMountedRef.current) return;

    info_sync.once("change", function () {
      if (!isMountedRef.current) return;
      set_loading(false);
      set_status("receiving…");
    });

    info_sync.on("change", function () {
      if (!isMountedRef.current) return;
      const data = info_sync.get();
      if (data != null) {
        const payload = JSON.parse(data.get("payload"));
        set_data(payload as ProjectInfo);
      } else {
        console.warn("got no data from info_sync.get()");
      }
    });

    chan.on("close", async function () {
      if (!isMountedRef.current) return;
      set_status("websocket closed: reconnecting in 3 seconds…");
      set_chan(null);
      await delay(3000);
      set_status("websocket closed: reconnecting now…");
      if (!isMountedRef.current) return;
      const new_chan = await connect_ws(project_id);
      set_status("websocket closed: got new connection…");
      if (!isMountedRef.current) return;
      set_chan(new_chan);
    });

    set_chan(chan);
    set_sync(info_sync);
  }

  // once when mounted
  function get_idle_timeout() {
    const ito = redux.getStore("projects").get_idle_timeout(project_id);
    set_idle_timeout(ito);
  }

  React.useEffect(() => {
    connect();
    get_idle_timeout();
    return () => {
      if (isMountedRef.current) {
        set_status("closing connection");
      }
      chan?.end();
      set_chan(null);
      sync?.close();
      set_sync(null);
    };
  }, []);

  React.useEffect(() => {
    const cg = info?.cgroup;
    const du = info?.disk_usage;

    if (cg != null && du?.tmp != null) {
      // why? /tmp is a memory disk in kucalc

      const mem_rss = cg.mem_stat.total_rss + du.tmp.usage;
      const mem_tot = cg.mem_stat.hierarchical_memory_limit;
      const mem_pct = 100 * Math.min(1, mem_rss / mem_tot);
      const cpu_pct = 100 * Math.min(1, cg.cpu_usage_rate / cg.cpu_cores_limit);
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
      // or it changed at a later point in time
      const total = p.usage + p.available;
      const pct = 100 * Math.min(1, p.usage / total);
      set_disk_usage({ pct, usage: p.usage, total });
    }
  }, [info]);

  React.useEffect(() => {
    const next_start_ts = project.getIn(["status", "start_ts"]);
    if (next_start_ts != start_ts) {
      set_start_ts(next_start_ts);
    }
  }, [project]);

  function select_proc(pids: number[]) {
    set_selected(pids);
  }

  function val_max_value(index): number {
    switch (index) {
      case "cpu_pct":
        return 1;
      case "cpu_tot":
        return idle_timeout;
      case "mem":
        if (info?.cgroup?.mem_stat.hierarchical_memory_limit != null) {
          // 50% of max memory
          return info.cgroup.mem_stat.hierarchical_memory_limit / 2;
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

  function render_signal_icon(signal: number) {
    switch (signal) {
      case 15:
        return <Icon name="times-circle" />;
      case 9:
        return <Icon unicode={0x2620} />;
    }
    return null;
  }

  function render_signal(name: string, signal: number) {
    const n = selected.length;
    const pn = plural(n, "process", "processes");
    const poptitle = `Are you sure to send signal ${name} (${signal}) to ${n} ${pn}?`;
    const icon = render_signal_icon(signal);
    const button = (
      <Button
        type={signal == 15 ? "primary" : undefined}
        danger={true}
        icon={icon}
        disabled={chan == null || selected.length == 0}
        loading={loading}
      >
        {name}
      </Button>
    );
    return (
      <Popconfirm
        title={poptitle}
        onConfirm={() => {
          if (chan == null) return;
          const payload: ProjectInfoCmds = {
            cmd: "kill",
            signal,
            pids: selected,
          };
          chan.write(payload);
          set_selected([]);
        }}
        okText="Yes"
        cancelText="No"
      >
        {button}
      </Popconfirm>
    );
  }

  function render_signals() {
    return (
      <Form.Item label="Send signal:">
        <AntdSpace>
          {render_signal("Terminate", 15)}
          {render_signal("Kill", 9)}
        </AntdSpace>
      </Form.Item>
    );
  }

  function show_about(proc_about?: Process) {
    // from render_about we already know it will not be null
    if (proc_about == null) return;
    const style: CSS = { fontSize: "85%", maxHeight: "35vw" };
    Modal.info({
      title: "Process info",
      width: "75vw",
      maskClosable: true,
      content: <pre style={style}>{JSON.stringify(proc_about, null, 2)}</pre>,
      onOk() {},
    });
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

  function render_about() {
    const proc =
      selected.length === 1 ? info?.processes?.[selected[0]] : undefined;
    return (
      <Form.Item label="Information:">
        <Button
          type={"primary"}
          icon={<InfoCircleOutlined />}
          disabled={proc == null}
          onClick={() => show_about(proc)}
        >
          About
        </Button>
      </Form.Item>
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

  function render_cocalc({ cocalc }: ProcessRow) {
    if (cocalc == null) return;
    switch (cocalc.type) {
      case "project":
        return render_cocalc_btn({
          title: "Project",
          onClick: () =>
            Modal.info({
              title: "Project's SSH Daemon",
              maskClosable: true,
              content: (
                <div>
                  This is the project's own management process. Do not terminate
                  it! If it uses too much resources, you can {restart_project()}
                  .
                </div>
              ),
            }),
        });
      case "sshd":
        return render_cocalc_btn({
          title: "SSH",
          onClick: () =>
            Modal.info({
              title: "Project's SSH Daemon",
              maskClosable: true,
              content: (
                <div>
                  This process allows to SSH into this project. Do not terminate
                  it!
                  <br />
                  Learn more: <A href={SSH_KEYS_DOC}>SSH keys documentation</A>
                </div>
              ),
            }),
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
            icon={"cc-icon-ipynb"}
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
        console.warn(
          `project-info/cocalc: no code to deal with ${cocalc.type}`
        );
    }
  }

  // mimic a table of processes program like htop – with tailored descriptions for cocalc
  function render_top() {
    if (ptree == null) return <Loading />;

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

    return (
      <Row>
        <Form
          layout="inline"
          style={{ marginBottom: "10px", marginTop: "10px" }}
        >
          <Form.Item label="Table of Processes" />
          {render_help()}
          {render_about()}
          {render_signals()}
        </Form>

        {render_explanation()}

        <Table<ProcessRow>
          dataSource={ptree}
          size={"small"}
          pagination={false}
          scroll={{ y: "65vh" }}
          style={{ marginBottom: "2rem" }}
          expandable={expandable}
          rowSelection={rowSelection}
          loading={loading}
        >
          <Table.Column<ProcessRow>
            key="process"
            title="Process"
            width="60%"
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
            title="CoCalc"
            width="10%"
            align={"left"}
            render={(proc) => render_cocalc(proc)}
          />
          <Table.Column<ProcessRow>
            key="cpu_pct"
            title="CPU%"
            width="10%"
            dataIndex="cpu_pct"
            align={"right"}
            render={render_val(
              "cpu_pct",
              (val) => `${(100 * val).toFixed(1)}%`
            )}
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
    );
  }

  function render_explanation() {
    if (!show_explanation) return;
    const msg = (
      <span>
        This panel shows real-time information about this project and its
        resource usage. You can see which processes are running, and if
        available, also get a button to <SiteName /> specific information or
        links to the associated file. By selecting a process via the checkbox on
        the left, you can obtain more detailed information via the "About"
        button or even issue commands like sending a signal to the selected
        job(s).
      </span>
    );
    return (
      <Col md={12}>
        <Alert
          message={msg}
          style={{ margin: "10px 0" }}
          type={"info"}
          closable
          onClose={() =>
            project_actions?.setState({ show_project_info_explanation: false })
          }
        />
      </Col>
    );
  }

  function render_general_status() {
    return (
      <Col md={12} style={{ color: COLORS.GRAY }}>
        Timestamp:{" "}
        {info.timestamp != null ? (
          <code>{new Date(info.timestamp).toISOString()}</code>
        ) : (
          "no timestamp"
        )}{" "}
        | Connections sync=<code>{`${sync != null}`}</code> chan=
        <code>{`${chan != null}`}</code> | Status: <code>{status}</code>
      </Col>
    );
  }

  function render() {
    return (
      <Row style={{ padding: "15px 15px 0 15px" }}>
        <Col md={12}>
          <CGroupFC
            info={info}
            cg_info={cg_info}
            disk_usage={disk_usage}
            pt_stats={pt_stats}
            start_ts={start_ts}
          />
          {render_top()}
        </Col>
        {render_general_status()}
      </Row>
    );
  }

  return React.useMemo(render, [
    info,
    ptree,
    status,
    loading,
    selected,
    expanded,
    show_explanation,
    start_ts,
    pt_stats,
    cg_info,
    disk_usage,
  ]);
};
