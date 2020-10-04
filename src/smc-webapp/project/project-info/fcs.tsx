/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */
import { React, CSS } from "../../app-framework";
import {
  Descriptions,
  Progress,
  Button,
  Space as AntdSpace,
  Form,
  Popconfirm,
  Grid,
} from "antd";
import { QuestionCircleOutlined, PauseCircleOutlined } from "@ant-design/icons";
import { Tip, TimeElapsed, Icon } from "../../r_misc";
import { CGroupInfo, DUState } from "./types";
import { warning_color, filename } from "./utils";
import { State, ProjectInfoCmds, Signal } from "smc-project/project-info/types";
import { Channel } from "../../project/websocket/types";
import { unreachable } from "smc-util/misc2";
import { COLORS } from "smc-util/theme";
import { plural } from "smc-util/misc2";
import * as humanizeList from "humanize-list";

export const CodeWhite: React.FC = ({ children }) => (
  <code style={{ color: "white" }}>{children}</code>
);

export const ProcState: React.FC<{ state: State }> = ({ state }) => {
  function render_state() {
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
        return [9417, "Paused (trace)", undefined];
      case "W":
        return [9420, "Paging", undefined];
      default:
        unreachable(state);
    }
  }

  function render() {
    const [char, title, style] = render_state();
    if (typeof char === "number" && typeof title === "string") {
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
  }
  return React.useMemo(render, [state]);
};

export const LabelQuestionmark: React.FC<{ text: string; style?: CSS }> = ({
  text,
  style,
}) => {
  const s: CSS = { ...style, ...{ whiteSpace: "nowrap" } };
  return (
    <span style={s}>
      {text} <QuestionCircleOutlined />
    </span>
  );
};

const CGroupTip: React.FC<{
  children;
  cg_info: CGroupInfo;
  disk_usage: DUState;
  type: "mem" | "disk" | "cpu";
}> = ({ children, type, cg_info, disk_usage }) => {
  function render_text(): JSX.Element {
    switch (type) {
      case "mem":
        return (
          <span>
            Current memory usage of the project's container:{" "}
            <CodeWhite>{cg_info.mem_rss.toFixed(0)}MiB</CodeWhite> of a maximum
            of <CodeWhite>{cg_info.mem_tot.toFixed(0)}MiB</CodeWhite>. This
            might diverge from the processes individual usages and this value
            also includes the in-memory <CodeWhite>/tmp</CodeWhite> directory.
            The remaining free memory is usually shared with other projects on
            the underlying machine and hence you might not be able to fully
            attain it.
          </span>
        );
      case "disk":
        return (
          <span>
            Currently, the files stored in this project use{" "}
            <CodeWhite>{disk_usage.usage.toFixed(0)}MiB</CodeWhite> of a maximum
            of <CodeWhite>{disk_usage.total.toFixed(0)}MiB</CodeWhite>. Please
            be aware that a project might not work properly if that limit is
            reached.
          </span>
        );
      case "cpu":
        return (
          <span>
            This shows your current CPU usage. Right now, this project is using{" "}
            <CodeWhite>{cg_info.cpu_usage_rate.toFixed(2)}secs</CodeWhite> CPU
            time per second with a limit of{" "}
            <CodeWhite>{cg_info.cpu_usage_limit.toFixed(2)}secs/s</CodeWhite>.
            Since this project shares the CPU power of the underlying machine
            with other projects, you might not be able to fully attain the
            limit.
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
};

const format = (val) => `${val.toFixed(0)}%`;
const prog_small = { format, size: "small" as "small" } as const;
const prog_medium = { format } as const;
const prog_large = { format, steps: 20 } as const;

function useProgressProps() {
  const [props, set_props] = React.useState<any>({});
  const screens = Grid.useBreakpoint();

  function set(prop) {
    if (prop != props) set_props(prop);
  }

  if (screens["xxl"]) {
    set(prog_large);
  } else if (screens["md"]) {
    set(prog_medium);
  } else {
    set(prog_small);
  }
  return props;
}

export const CGroupFC: React.FC<{
  info;
  cg_info: CGroupInfo;
  disk_usage: DUState;
  pt_stats;
  start_ts;
}> = ({ info, cg_info, disk_usage, pt_stats, start_ts }) => {
  const progprops = useProgressProps();
  const row1: CSS = { fontWeight: "bold", fontSize: "110%" };
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
  function render() {
    if (info?.cgroup == null) return null;
    return (
      <Descriptions bordered={true} column={3} size={"middle"}>
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

        <Descriptions.Item label={cpu_label}>
          <CGroupTip type={"cpu"} cg_info={cg_info} disk_usage={disk_usage}>
            <Progress
              percent={cg_info.cpu_pct}
              strokeColor={warning_color(cg_info.cpu_pct)}
              {...progprops}
            />
          </CGroupTip>
        </Descriptions.Item>
        <Descriptions.Item label={memory_label}>
          <CGroupTip type={"mem"} cg_info={cg_info} disk_usage={disk_usage}>
            <Progress
              percent={cg_info.mem_pct}
              strokeColor={warning_color(cg_info.mem_pct)}
              {...progprops}
            />
          </CGroupTip>
        </Descriptions.Item>
        <Descriptions.Item label={disk_label}>
          <CGroupTip type={"disk"} cg_info={cg_info} disk_usage={disk_usage}>
            <Progress
              percent={disk_usage.pct}
              strokeColor={warning_color(disk_usage.pct)}
              {...progprops}
            />
          </CGroupTip>
        </Descriptions.Item>
      </Descriptions>
    );
  }

  // don't depend on "info"
  return React.useMemo(render, [cg_info, disk_usage, pt_stats, start_ts]);
};

interface CoCalcFileProps {
  icon: string;
  path: string;
  project_actions;
}

export const CoCalcFile: React.FC<CoCalcFileProps> = (
  props: CoCalcFileProps
) => {
  const { icon, path, project_actions } = props;
  function render() {
    return (
      <Button
        shape="round"
        icon={<Icon name={icon} />}
        onClick={() =>
          project_actions?.open_file({
            path: path,
            foreground: true,
          })
        }
      >
        <Tip
          title={
            <span>
              Click to open <CodeWhite>{path}</CodeWhite>
            </span>
          }
          style={{ paddingLeft: "1rem" }}
        >
          {filename(path)}
        </Tip>
      </Button>
    );
  }
  // don't depend on project_actions
  return React.useMemo(render, [icon, path]);
};

interface SignalButtonsProps {
  chan: Channel | null;
  selected: number[];
  set_selected: Function;
  loading: boolean;
}

export const SignalButtons: React.FC<SignalButtonsProps> = ({
  chan,
  selected,
  set_selected,
  loading,
}: SignalButtonsProps) => {
  function render_signal_icon(signal: number) {
    const style: CSS = { marginRight: "5px" };
    switch (signal) {
      case 2: // Interrupt (ctrl-c like)
        return <Icon name="hand-paper" style={style} />;
      case 15:
        return <Icon name="times-circle" style={style} />;
      case 9:
        return <Icon unicode={0x2620} style={style} />;
      case 19: // STOP
        return <Icon name="pause-circle" style={style} />;
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
        return "Killing a process can't be ignored by it and will cause it to exit right away. Try terminating it first!";
      case Signal.Pause:
        return "'Pause' means to hold all operations. The process won't use any CPU and only keep  its memory. Use 'Resume' to let it run again.";
      case Signal.Resume:
        return "This will continue running a possibly paused process.";
    }
    return "";
  }

  function onConfirm(signal: Signal) {
    if (chan == null) return;
    const payload: ProjectInfoCmds = {
      cmd: "signal",
      signal,
      pids: selected,
    };
    chan.write(payload);
    set_selected([]);
  }

  function render_signal(signal: Signal) {
    const n = selected.length;
    const name = Signal[signal];
    const pn = plural(n, "process", "processes");
    const pids = humanizeList(selected);
    const extra = signal_extra(signal);
    const poptitle = `Are you sure to send signal ${name} (${signal}) to ${pn} ${pids}? ${extra}`.trim();
    const icon = render_signal_icon(signal);
    const dangerous = [
      Signal.Kill,
      Signal.Interrupt,
      Signal.Terminate,
    ].includes(signal);
    const button = (
      <Button
        type={signal === 2 ? "primary" : signal === 9 ? "dashed" : undefined}
        danger={dangerous}
        icon={icon}
        disabled={chan == null || selected.length == 0}
        loading={loading}
      >
        {name}
      </Button>
    );
    return (
      <Popconfirm
        title={<div style={{ maxWidth: "300px" }}>{poptitle}</div>}
        onConfirm={() => onConfirm(signal)}
        okText="Yes"
        cancelText="No"
      >
        {button}
      </Popconfirm>
    );
  }

  function render() {
    return (
      <Form.Item label="Send signal:">
        <AntdSpace>
          {render_signal(Signal.Interrupt)}
          {render_signal(Signal.Terminate)}
          {render_signal(Signal.Kill)}
          {render_signal(Signal.Pause)}
          {render_signal(Signal.Resume)}
        </AntdSpace>
      </Form.Item>
    );
  }

  // don't depend on set_selected
  return React.useMemo(render, [chan, selected, loading]);
};
