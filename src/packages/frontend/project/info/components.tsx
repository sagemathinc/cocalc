/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { PauseCircleOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import {
  Button,
  Descriptions,
  Form,
  Grid,
  Popconfirm,
  Progress,
  Space,
  //Badge,
  Switch,
  Tooltip,
} from "antd";
import humanizeList from "humanize-list";
import * as immutable from "immutable";
import { Alert } from "@cocalc/frontend/antd-bootstrap";
import { CSS, React } from "@cocalc/frontend/app-framework";
import { Icon, IconName, TimeElapsed, Tip } from "@cocalc/frontend/components";
import { FLYOUT_PADDING } from "@cocalc/frontend/project/page/flyouts/consts";
import {
  Process,
  Processes,
  Signal,
  State,
} from "@cocalc/util/types/project-info/types";
import { AlertType, ComponentName } from "@cocalc/comm/project-status/types";
import { plural, seconds2hms, unreachable } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { CGroupInfo, DUState } from "./types";
import { filename, warning_color_disk, warning_color_pct } from "./utils";
import { useProjectContext } from "../context";
import ShowError from "@cocalc/frontend/components/error";
import { useState } from "react";

interface AboutContentProps {
  proc?: Process;
  buttons?: React.ReactNode;
  mode?: "full" | "flyout";
  closePid?: (pid: number) => void;
}

export const AboutContent: React.FC<AboutContentProps> = ({
  proc,
  buttons,
  mode = "full",
  closePid,
}: AboutContentProps) => {
  const isFlyout = mode === "flyout";
  const [raw, set_raw] = React.useState<boolean>(false);

  const style: CSS = isFlyout
    ? { paddingTop: FLYOUT_PADDING }
    : { maxHeight: "35vw", height: "35vw", overflow: "auto" };

  function render_raw() {
    const style: CSS = {
      fontSize: "85%",
      whiteSpace: "pre-wrap",
      fontFamily: "monospace",
      maxHeight: "50vh",
      overflow: "auto",
    };
    return <div style={style}>{JSON.stringify(proc, null, 2)}</div>;
  }

  function render_nice() {
    if (proc == null) {
      return (
        <Descriptions.Item label="Error" span={2}>
          No such process
        </Descriptions.Item>
      );
    }
    const cpu_time = proc.stat.stime + proc.stat.utime;
    const mem = proc.stat.mem.rss.toFixed(1);
    const cpu_time_ch = proc.stat.cstime + proc.stat.cutime;
    return (
      <>
        <Descriptions.Item label="Executable" span={2}>
          <strong>
            <code>{proc.exe}</code>
          </strong>
        </Descriptions.Item>
        <Descriptions.Item label="Command line" span={2}>
          <code>{proc.cmdline.join(" ")}</code>
        </Descriptions.Item>
        <Descriptions.Item label="Uptime">
          <code>{seconds2hms(proc.uptime)}</code>
        </Descriptions.Item>
        <Descriptions.Item label="Memory">
          <code>{mem} MiB</code>
        </Descriptions.Item>
        <Descriptions.Item label="CPU time">
          <code>{seconds2hms(cpu_time)}</code>
        </Descriptions.Item>
        <Descriptions.Item label="CPU children">
          <code>{seconds2hms(cpu_time_ch)}</code>
        </Descriptions.Item>
        <Descriptions.Item label="Nice">
          <code>{proc.stat.nice}</code>
        </Descriptions.Item>
        <Descriptions.Item label="Threads">
          <code>{proc.stat.num_threads}</code>
        </Descriptions.Item>
      </>
    );
  }

  function renderTitle() {
    return (
      <>
        <div style={{ padding: FLYOUT_PADDING }}>
          Process {proc?.pid ?? "<none>"}
        </div>
        {buttons ? buttons : undefined}
      </>
    );
  }

  return (
    <>
      <Descriptions
        bordered
        className={
          isFlyout
            ? "cc-project-info-about-flyout"
            : "cc-project-info-about-full"
        }
        style={style}
        title={renderTitle()}
        size={"small"}
        column={2}
        extra={
          isFlyout ? (
            <Tooltip title="Close expanded process info panel">
              <Button
                onClick={() => closePid?.(proc?.pid ?? -1)}
                icon={<Icon name="times" />}
                size="small"
                type="text"
                style={{ color: COLORS.GRAY_M }}
              />
            </Tooltip>
          ) : (
            <>
              Raw view:{" "}
              <Switch checked={raw} onChange={(val) => set_raw(val)} />
            </>
          )
        }
      >
        {raw ? render_raw() : render_nice()}
      </Descriptions>
    </>
  );
};

export const ProcState: React.FC<{ state: State }> = React.memo(({ state }) => {
  function render_state(): [number, string, CSS | undefined] | undefined {
    switch (state) {
      case "S":
        return [9416, "Sleeping (not using CPU)", { color: COLORS.GRAY_L }];
      case "R":
        return [
          9415,
          "Running  (actively uses CPU)",
          { color: COLORS.ANTD_GREEN_D, fontWeight: "bold" },
        ];
      case "D":
        return [9401, "Waiting on data from disk/network", undefined];
      case "Z":
        return [9423, "Zombie", undefined];
      case "T":
        return [9417, "Paused (trace)", { fontWeight: "bold" }];
      case "W":
        return [9420, "Paging", undefined];
      default:
        unreachable(state);
    }
    // theoretically, there might be other states which we do not know
    return undefined;
  }

  const displayed = render_state();
  if (displayed != null) {
    const [char, title, style] = displayed;
    // at this point, we also know that style is CSS|undefined
    const icon =
      char === 9417 ? <PauseCircleOutlined /> : String.fromCharCode(char);
    return (
      <Tip title={title} trigger={["hover", "click"]}>
        <span style={style as CSS}>{icon}</span>
      </Tip>
    );
  } else {
    return <span>{state}</span>;
  }
});

export const LabelQuestionmark: React.FC<{
  text: string;
  style?: CSS;
}> = React.memo(({ text, style }) => {
  const s: CSS = { ...style, ...{ whiteSpace: "nowrap" } };
  return (
    <span style={s}>
      {text}{" "}
      <span style={{ color: COLORS.GRAY }}>
        <QuestionCircleOutlined />
      </span>
    </span>
  );
});

interface CGroupTipProps {
  children;
  cg_info: CGroupInfo;
  disk_usage: DUState;
  type: "mem" | "disk" | "cpu";
}

const CGroupTip: React.FC<CGroupTipProps> = React.memo(
  (props: CGroupTipProps) => {
    const { children, type, cg_info, disk_usage } = props;
    function render_text(): JSX.Element {
      switch (type) {
        case "mem":
          return (
            <span>
              Current memory usage of the project's container:{" "}
              <code>{cg_info.mem_rss.toFixed(0)} MiB</code> of a maximum of{" "}
              <code>{cg_info.mem_tot.toFixed(0)} MiB</code>. This might diverge
              from the processes individual usages and this value also includes
              the in-memory <code>/tmp</code> directory. The remaining free
              memory is usually shared with other projects on the underlying
              machine and hence you might not be able to fully attain it.
            </span>
          );
        case "disk":
          return (
            <span>
              Currently, the files stored in this project use{" "}
              <code>{disk_usage.usage.toFixed(0)} MiB</code> of a maximum of{" "}
              <code>{disk_usage.total.toFixed(0)} MiB</code>. Please be aware
              that a project might not work properly if that limit is reached.
            </span>
          );
        case "cpu":
          return (
            <span>
              This shows your current CPU usage. Right now, this project is
              using <code>{cg_info.cpu_usage_rate.toFixed(2)}secs</code> CPU
              time per second with a limit of{" "}
              <code>{cg_info.cpu_usage_limit.toFixed(2)}secs/s</code>. Since
              this project shares the CPU power of the underlying machine with
              other projects, you might not be able to fully attain the limit.
            </span>
          );
      }
    }

    return (
      <Tip
        placement={"bottom"}
        title={render_text()}
        trigger={["hover", "click"]}
      >
        {children}
      </Tip>
    );
  },
);

const format = (val) => `${val.toFixed(0)}%`;
const prog_small = { format, size: "small" as "small" } as const;
const prog_medium = { format } as const;
const prog_large = { format, steps: 20 } as const;

function useProgressProps(mode: "full" | "flyout" = "full") {
  const [props, set_props] = React.useState<any>({});
  const screens = Grid.useBreakpoint();

  function set(prop) {
    if (prop != props) set_props(prop);
  }

  if (mode === "flyout") {
    set(prog_small);
  } else {
    if (screens["xxl"]) {
      set(prog_large);
    } else if (screens["md"]) {
      set(prog_medium);
    } else {
      set(prog_small);
    }
  }
  return props;
}

interface ProjectProblemsProps {
  project_status?: immutable.Map<string, any>;
}

export const ProjectProblems: React.FC<ProjectProblemsProps> = React.memo(
  (props: ProjectProblemsProps) => {
    const { project_status } = props;
    const all_alerts = project_status?.get("alerts") ?? immutable.Map();

    const component_alerts: ComponentName[] = [];
    for (const a of all_alerts) {
      if (a.get("type") === "component") {
        component_alerts.push(...a.get("names")?.toJS());
      }
    }

    function explanation(name: ComponentName) {
      switch (name) {
        case "BlobStore":
          return "This component manages locally stored binary data and it is currently broken. This means for example, images in Jupyter Notebooks will not show up. Most likely the file storage is full. Please delete some files or increase the quota limit.";
        default:
          return `Unknown problem "${name}"`;
      }
    }

    function render_problem(name: ComponentName) {
      return (
        <div key={name}>
          <strong>{name}</strong>: {explanation(name)}
        </div>
      );
    }

    if (component_alerts.length == 0) return null;

    return (
      <Alert bsStyle="danger" banner={true}>
        {component_alerts.map(render_problem)}
      </Alert>
    );
  },
);

interface CGroupProps {
  have_cgroup: boolean;
  cg_info: CGroupInfo;
  disk_usage: DUState;
  pt_stats;
  start_ts;
  project_status?: immutable.Map<string, any>;
  mode?: "full" | "flyout";
  style?: CSS;
}

export const CGroup: React.FC<CGroupProps> = React.memo(
  (props: CGroupProps) => {
    const {
      have_cgroup,
      cg_info,
      disk_usage,
      pt_stats,
      start_ts,
      project_status,
      mode = "full",
      style,
    } = props;
    const isFlyout = mode === "flyout";
    const { onCoCalcDocker } = useProjectContext();
    const progprops = useProgressProps(mode);
    const all_alerts = project_status?.get("alerts") ?? immutable.Map();
    const status_alerts: Readonly<string[]> = all_alerts.map((a) =>
      a.get("type"),
    );

    const row1: CSS = { fontWeight: "bold", fontSize: "110%" };

    // we're essentially checking the type of @cocalc/comm/project-status/types
    // (but it is immutable js)
    const alert = {
      cpu: status_alerts.includes("cpu-cgroup" as AlertType),
      memory: status_alerts.includes("memory" as AlertType),
      disk: status_alerts.includes("disk" as AlertType),
    } as const;

    const alert_style: CSS = {
      backgroundColor: COLORS.ATND_BG_RED_L,
      borderColor: COLORS.ANTD_RED_WARN,
    } as const;

    const cpu_label = (
      <CGroupTip type={"cpu"} cg_info={cg_info} disk_usage={disk_usage}>
        <LabelQuestionmark text={"CPU"} />
      </CGroupTip>
    );

    const memory_label = (
      <CGroupTip type={"mem"} cg_info={cg_info} disk_usage={disk_usage}>
        <LabelQuestionmark text={"Memory"} />
      </CGroupTip>
    );

    const disk_label = (
      <CGroupTip type={"disk"} cg_info={cg_info} disk_usage={disk_usage}>
        <LabelQuestionmark text={"Disk"} />
      </CGroupTip>
    );

    function render_row1() {
      return (
        <>
          <Descriptions.Item label={"Processes"}>
            <span style={row1}>{pt_stats.nprocs}</span>
          </Descriptions.Item>
          <Descriptions.Item label="Threads">
            <span style={row1}>{pt_stats.threads}</span>
          </Descriptions.Item>
          <Descriptions.Item label="Uptime">
            <span style={row1}>
              {start_ts != null ? <TimeElapsed start_ts={start_ts} /> : "?"}
            </span>{" "}
          </Descriptions.Item>
        </>
      );
    }

    function render_row2() {
      return (
        <>
          <Descriptions.Item
            label={cpu_label}
            style={alert.cpu ? alert_style : undefined}
          >
            <CGroupTip type={"cpu"} cg_info={cg_info} disk_usage={disk_usage}>
              <Progress
                percent={cg_info.cpu_pct}
                strokeColor={warning_color_pct(cg_info.cpu_pct)}
                {...progprops}
              />
            </CGroupTip>
          </Descriptions.Item>
          <Descriptions.Item
            label={memory_label}
            style={alert.memory ? alert_style : undefined}
          >
            <CGroupTip type={"mem"} cg_info={cg_info} disk_usage={disk_usage}>
              <Progress
                percent={cg_info.mem_pct}
                strokeColor={warning_color_pct(cg_info.mem_pct)}
                {...progprops}
              />
            </CGroupTip>
          </Descriptions.Item>
          <Descriptions.Item
            label={disk_label}
            style={alert.disk ? alert_style : undefined}
          >
            <CGroupTip type={"disk"} cg_info={cg_info} disk_usage={disk_usage}>
              <Progress
                percent={disk_usage.pct}
                strokeColor={warning_color_disk(disk_usage)}
                {...progprops}
              />
            </CGroupTip>
          </Descriptions.Item>
        </>
      );
    }

    // explicitly get rid of cgroup related info from the project. it's defined but not correct.
    // there is no quota management at all.
    // https://github.com/sagemathinc/cocalc/issues/7077
    if (!have_cgroup || onCoCalcDocker) {
      return null;
    } else {
      // for now, we only show row 2
      return (
        <Descriptions
          className={
            isFlyout
              ? "cc-project-info-cgroup-table-flyout"
              : "cc-project-info-cgroup-table-page"
          }
          bordered={true}
          column={isFlyout ? 1 : 3}
          size={isFlyout ? "small" : "middle"}
          style={style}
        >
          {false && render_row1()}
          {render_row2()}
        </Descriptions>
      );
    }
  },
);

interface CoCalcFileProps {
  icon: IconName;
  path: string;
  project_actions;
}

export const CoCalcFile: React.FC<CoCalcFileProps> = React.memo(
  (props: CoCalcFileProps) => {
    const { icon, path, project_actions } = props;

    function click() {
      project_actions?.open_file({
        path: path,
        foreground: true,
      });
    }

    function render_tip() {
      return (
        <Tip
          title={
            <span>
              Click to open <code>{path}</code>
            </span>
          }
          style={{ paddingLeft: "1rem" }}
        >
          {filename(path)}
        </Tip>
      );
    }

    return (
      <Button shape="round" icon={<Icon name={icon} />} onClick={click}>
        {render_tip()}
      </Button>
    );
  },
);

interface SignalButtonsProps {
  pid?: number;
  selected?: number[];
  set_selected?: Function;
  loading: boolean;
  disabled?: boolean;
  processes: Processes;
  small?: boolean;
  project_actions;
}

export const SignalButtons: React.FC<SignalButtonsProps> = React.memo(
  (props: SignalButtonsProps) => {
    const {
      selected: selected_user,
      set_selected,
      loading,
      disabled = false,
      pid,
      processes,
      small = false,
      project_actions,
    } = props;
    const [error, setError] = useState<string>("");

    // we don't let users send signals to processes classified as "project" or "ssh daemon"
    const dont_kill = ["project", "sshd"];
    const selected: number[] = (selected_user ?? [pid ?? 0]).filter((pid) => {
      const type = processes[pid]?.cocalc?.type;
      if (type == null) return true;
      return !dont_kill.includes(type);
    });

    function render_signal_icon(signal: number) {
      const style: CSS = { marginRight: "5px" };
      switch (signal) {
        case 2: // Interrupt (ctrl-c like)
          return <Icon name="hand-stop" style={style} />;
        case 15: // terminate
          return <Icon name="times-circle" style={style} />;
        case 9: // kill ☠
          return <Icon unicode={0x2620} style={style} />;
        case 19: // STOP
          return <Icon name="pause" style={style} />;
        case 18: // CONT
          return <Icon name="play-circle" style={style} />;
      }
      return null;
    }

    function signal_extra(signal: Signal) {
      switch (signal) {
        case Signal.Interrupt:
          return "This is equivalent to `Ctrl-c` in a Terminal or clicking the 'Stop'-Button in a Jupyter Notebook.";
        case Signal.Terminate:
          return "Terminating a process tells it to properly close everything and exit – it might ignore the orders, though!";
        case Signal.Kill:
          return "Killing a process can't be ignored and will cause the process to exit right away. Try terminating it first!";
        case Signal.Pause:
          return "'Pause' means to hold all operations. The process won't use any CPU but will continue to use memory. Use 'Resume' to let it run again.";
        case Signal.Resume:
          return "This will continue running a possibly paused process.";
      }
      return "";
    }

    async function onConfirm(signal: Signal) {
      try {
        setError("");
        set_selected?.([]);
        await project_actions
          .projectApi()
          .system.signal({ signal, pids: selected });
      } catch (err) {
        setError(`${err}`);
      }
    }

    function render_signal(signal: Signal) {
      const n = selected.length;
      const name = Signal[signal];
      const pn = plural(n, "process", "processes");
      const pids = humanizeList(selected);
      const extra = signal_extra(signal);
      const poptitle =
        `Are you sure you want to send signal ${name} (${signal}) to ${pn} ${pids}? ${extra}`.trim();
      const icon = render_signal_icon(signal);
      const dangerous = [
        Signal.Kill,
        Signal.Interrupt,
        Signal.Terminate,
      ].includes(signal);
      const button = (
        <Button
          key={signal}
          type={signal === 2 ? "primary" : signal === 9 ? "dashed" : undefined}
          danger={dangerous}
          icon={icon}
          disabled={disabled}
          loading={loading}
          size={small ? "small" : undefined}
        >
          {name}
        </Button>
      );
      return (
        <Popconfirm
          key={signal}
          title={<div style={{ maxWidth: "300px" }}>{poptitle}</div>}
          onConfirm={() => onConfirm(signal)}
          okText="Yes"
          cancelText="No"
          disabled={disabled}
        >
          {button}
        </Popconfirm>
      );
    }

    if (selected.length == 0) {
      return null;
    } else {
      const btns = [
        render_signal(Signal.Interrupt),
        render_signal(Signal.Terminate),
        render_signal(Signal.Kill),
        render_signal(Signal.Pause),
        render_signal(Signal.Resume),
      ];
      return small ? (
        <Space size="small" wrap>
          <Space.Compact size={"small"}>{btns.slice(0, 3)}</Space.Compact>
          <Space.Compact size={"small"}>{btns.slice(3)}</Space.Compact>
        </Space>
      ) : (
        <Form.Item label="Send signal:">
          <Space>{btns}</Space>
          <ShowError
            error={error}
            setError={setError}
            style={{ margin: "15px 0" }}
          />
        </Form.Item>
      );
    }
  },
);

export function render_cocalc_btn({ title, onClick }) {
  return (
    <Button shape="round" onClick={onClick}>
      {title}
    </Button>
  );
}
