/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Kernel display

import { React, useRedux, CSS } from "../app-framework";
import * as immutable from "immutable";
import { Progress, Typography } from "antd";
import { COLORS } from "smc-util/theme";
import { A, Icon, Loading, Tip } from "../r_misc";
import { closest_kernel_match, rpad_html } from "smc-util/misc";
import { Logo } from "./logo";
import { JupyterActions } from "./browser-actions";
import { ImmutableUsageInfo } from "../../smc-project/usage-info/types";
import {
  ALERT_HIGH_PCT,
  ALERT_MEDIUM_PCT,
  ALERT_LOW_PCT,
} from "../../smc-project/project-status/const";

const KERNEL_NAME_STYLE: CSS = {
  margin: "0px 5px",
  display: "block",
  color: COLORS.BS_BLUE_TEXT,
  borderLeft: `1px solid ${COLORS.GRAY}`,
  paddingLeft: "5px",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
} as const;

const KERNEL_USAGE_STYLE: CSS = {
  margin: "0px 5px",
  color: COLORS.GRAY,
  borderRight: `1px solid ${COLORS.GRAY}`,
  paddingRight: "5px",
} as const;

const KERNEL_USAGE_STYLE_SMALL: CSS = {
  height: "5px",
  marginBottom: "4px",
  width: "5em",
} as const;

const KERNEL_USAGE_STYLE_NUM: CSS = { fontFamily: "monospace" } as const;

const KERNEL_ERROR_STYLE: CSS = {
  margin: "5px",
  color: "white",
  padding: "5px",
  backgroundColor: COLORS.ATND_BG_RED_M,
} as const;

const BACKEND_STATE_STYLE: CSS = {
  display: "flex",
  marginRight: "5px",
  color: KERNEL_NAME_STYLE.color,
} as const;

type BackendState = "init" | "ready" | "spawning" | "starting" | "running";

type AlertLevel = "low" | "mid" | "high" | "none";

const ALERT_COLS: { [key in AlertLevel]: string } = {
  none: COLORS.ANTD_GREEN,
  low: COLORS.ANTD_YELL_M,
  mid: COLORS.ANTD_ORANGE,
  high: COLORS.ANTD_RED_WARN,
} as const;

interface Usage {
  mem: number; // MiB
  mem_limit: number;
  mem_alert: AlertLevel;
  mem_pct: number; // %
  cpu: number; // 1 core = 100%
  cpu_limit: number;
  cpu_alert: AlertLevel;
  cpu_pct: number; // 100% full container quota
  time_alert: AlertLevel;
}

// derive sorted list of timings from all cells
function calc_cell_timings(cells?: immutable.Map<string, any>): number[] {
  if (cells == null) return [];
  return cells
    .toList()
    .map((v) => {
      const start = v.get("start");
      const end = v.get("end");
      if (start != null && end != null) {
        return (end - start) / 1000;
      } else {
        return null;
      }
    })
    .filter((v) => v != null)
    .sort()
    .toJS();
}

// for the sorted list of cell timing, get the median or quantile.
// a quick approximation is good enough for us!
// we basically want to ignore long running cells, treat them as outliers.
// Using the 75% quantile is quick and easy, avoids working with inter quantile differences
// and proper outlier detection – like for boxplots, etc.
// we also cap the lower end with a reasonable minimum.
// Maybe another choice of quantile works better, something for later …
function calc_quantile(data: number[], min_val = 3, q = 0.75): number {
  if (data.length == 0) return min_val;
  const idx_last = data.length - 1;
  const idx_q = Math.floor(q * idx_last);
  const idx = Math.min(idx_last, idx_q);
  return Math.max(min_val, data[idx]);
}

interface KernelProps {
  actions: JupyterActions;
  is_fullscreen?: boolean;
  name: string;
  cells?: immutable.Map<string, any>;
}

export const Kernel: React.FC<KernelProps> = React.memo(
  (props: KernelProps) => {
    const { actions, is_fullscreen, name, cells } = props;

    // redux section
    const trust: undefined | boolean = useRedux([name, "trust"]);
    const read_only: undefined | boolean = useRedux([name, "read_only"]);
    const kernel: undefined | string = useRedux([name, "kernel"]);
    const kernels: undefined | immutable.List<any> = useRedux([
      name,
      "kernels",
    ]);
    const project_id: string = useRedux([name, "project_id"]);
    const kernel_info: undefined | immutable.Map<string, any> = useRedux([
      name,
      "kernel_info",
    ]);
    const backend_state: undefined | BackendState = useRedux([
      name,
      "backend_state",
    ]);
    const kernel_state: undefined | string = useRedux([name, "kernel_state"]);
    const kernel_usage: undefined | ImmutableUsageInfo = useRedux([
      name,
      "kernel_usage",
    ]);

    // cell timing statistic
    const cell_timings = React.useMemo(() => calc_cell_timings(cells), [cells]);
    const timings_q = React.useMemo(() => calc_quantile(cell_timings), [
      cell_timings,
    ]);
    console.log("timings_q", timings_q);

    // state of UI, derived from usage, timing stats, etc.
    const [cpu_start, set_cpu_start] = React.useState<number | undefined>();
    const [cpu_runtime, set_cpu_runtime] = React.useState<number>(0);
    const timer1 = React.useRef<ReturnType<typeof setInterval> | undefined>();

    // reset cpu_start time when state changes
    React.useEffect(() => {
      if (kernel_state == "busy") {
        set_cpu_start(Date.now());
      } else if (cpu_start != null) {
        set_cpu_start(undefined);
      }
    }, [kernel_state]);

    // count seconds when kernel is busy & reset counter
    React.useEffect(() => {
      if (cpu_start != null) {
        timer1.current = setInterval(() => {
          if (kernel_state == "busy") {
            set_cpu_runtime((Date.now() - cpu_start) / 1000);
          } else {
            set_cpu_runtime(0);
          }
        }, 100);
      } else if (timer1.current != null) {
        set_cpu_runtime(0);
        clearInterval(timer1.current);
      }
      return () => {
        if (timer1.current != null) clearInterval(timer1.current);
      };
    }, [cpu_start, kernel_state]);

    // based on the info we know, we derive the "usage" object – the remainder of this component is to visualize it
    const usage: Usage | undefined = React.useMemo(() => {
      // not using resources, return sane "zero" defaults
      if (
        kernel_usage == null ||
        backend_state == null ||
        !["running", "starting"].includes(backend_state)
      ) {
        return {
          mem: 0,
          mem_limit: 1000, // 1 GB
          cpu: 0, // 1 core
          cpu_limit: 1,
          mem_alert: "none",
          cpu_alert: "none",
          mem_pct: 0,
          cpu_pct: 0,
          time_alert: "none",
        };
      }

      // NOTE: cpu/mem usage of this and all subprocesses are just added up
      // in the future, we could do something more sophisticated, the information is available

      // cpu numbers
      const cpu_self = kernel_usage.get("cpu") ?? 0;
      const cpu_chld = kernel_usage.get("cpu_chld") ?? 0;
      const cpu = cpu_self + cpu_chld;
      const cpu_limit: number = kernel_usage?.get("cpu_limit") ?? 1;

      // memory numbers
      // the main idea here is to show how much more memory the kernel could use
      // the basis is the remaining free memory + it's memory usage
      const mem_self = kernel_usage.get("mem") ?? 0;
      const mem_chld = kernel_usage.get("mem_chld") ?? 0;
      const mem = mem_self + mem_chld;
      const mem_free = kernel_usage?.get("mem_free");
      const mem_limit: number = mem_free != null ? mem_free + mem : 1000;

      const cpu_alert =
        cpu > ALERT_HIGH_PCT * cpu_limit
          ? "high"
          : cpu > ALERT_MEDIUM_PCT * cpu_limit
          ? "mid"
          : cpu > 1 // indicate any usage at all, basically
          ? "low"
          : "none";
      const mem_alert =
        mem > (ALERT_HIGH_PCT / 100) * mem_limit
          ? "high"
          : mem > (ALERT_MEDIUM_PCT / 100) * mem_limit
          ? "mid"
          : mem > (ALERT_LOW_PCT / 100) * mem_limit
          ? "low"
          : "none";
      const time_alert =
        cpu_runtime > 8 * timings_q
          ? "high"
          : cpu_runtime > 4 * timings_q
          ? "mid"
          : cpu_runtime > 2 * timings_q
          ? "low"
          : "none";
      return {
        mem,
        mem_limit,
        cpu,
        cpu_limit,
        cpu_alert,
        mem_alert,
        time_alert,
        mem_pct: (100 * mem) / mem_limit,
        cpu_pct: (100 * cpu) / cpu_limit,
      };
    }, [kernel_usage, backend_state, cpu_runtime]);

    // render functions start there

    // wrap "Logo" component
    function render_logo() {
      if (project_id == null || kernel == null) {
        return;
      }
      return (
        <div style={{ display: "flex" }} className="pull-right">
          <Logo
            project_id={project_id}
            kernel={kernel}
            kernel_info_known={kernel_info != null}
          />
        </div>
      );
    }

    // this renders the name of the kernel, if known, or a button to change to a similar but known one
    function render_name() {
      let display_name = kernel_info?.get("display_name");
      if (display_name == null && kernel != null && kernels != null) {
        // Definitely an unknown kernel
        const closestKernel = closest_kernel_match(
          kernel,
          kernels as any // TODO
        );
        if (closestKernel == null) {
          return <span style={KERNEL_ERROR_STYLE}>Unknown kernel</span>;
        } else {
          const closestKernelDisplayName = closestKernel.get("display_name");
          const closestKernelName = closestKernel.get("name");
          return (
            <span
              style={KERNEL_ERROR_STYLE}
              onClick={() => actions.set_kernel(closestKernelName)}
            >
              Unknown kernel{" "}
              <span style={{ fontWeight: "bold" }}>{kernel}</span>, click here
              to use {closestKernelDisplayName} instead.
            </span>
          );
        }
      } else {
        // List of known kernels just not loaded yet.
        if (display_name == null) {
          display_name = kernel ?? "No Kernel";
        }
        const chars = is_fullscreen ? 16 : 8;
        const style = { ...KERNEL_NAME_STYLE, maxWidth: `${chars}em` };
        return (
          <div
            style={style}
            onClick={() => actions.show_select_kernel("user request")}
          >
            {display_name}
          </div>
        );
      }
    }

    // at the very right, an icon to indicate at a quick glance if the kernel is active or not
    function render_backend_state_icon() {
      if (read_only) {
        return;
      }
      if (backend_state == null) {
        return <Loading />;
      }
      /*
      The backend_states are:
         'init' --> 'ready'  --> 'spawning' --> 'starting' --> 'running'

      When the backend_state is 'running', then the kernel_state is either
          'idle' or 'running'
      */
      let spin = false;
      let name: string | undefined;
      let color: string | undefined;
      switch (backend_state) {
        case "init":
          name = "unlink";
          break;
        case "ready":
          name = "circle-o-notch";
          break;
        case "spawning":
          name = "circle-o-notch";
          spin = true;
          break;
        case "starting":
          name = "circle-o-notch";
          spin = true;
          break;
        case "running":
          switch (kernel_state) {
            case "busy":
              name = "circle";
              color = "#5cb85c";
              break;
            case "idle":
              name = "circle-o";
              break;
            default:
              name = "circle-o";
          }
          break;
      }

      return (
        <div style={BACKEND_STATE_STYLE}>
          <Icon name={name} spin={spin} style={{ color }} />
        </div>
      );
    }

    function render_trust() {
      if (trust) {
        if (!is_fullscreen) return;
        return <div style={{ display: "flex", color: "#888" }}>Trusted</div>;
      } else {
        return (
          <div
            title={"Notebook is not trusted"}
            style={{
              display: "flex",
              background: "#5bc0de",
              color: "white",
              cursor: "pointer",
              padding: "3px",
              borderRadius: "3px",
            }}
            onClick={() => actions.trust_notebook()}
          >
            Not Trusted
          </div>
        );
      }
    }

    // a popover information, containin more in depth details about the kernel
    function render_tip(title: any, body: any) {
      let kernel_name;
      if (kernel_info != null) {
        kernel_name = (
          <div>
            <b>Kernel: </b>
            {kernel_info.get("display_name", "No Kernel")}
          </div>
        );
      } else {
        kernel_name = <span />;
      }
      let kernel_tip;
      const backend_tip = `Backend is ${backend_state}.`;
      if (backend_state === "running") {
        switch (kernel_state) {
          case "busy":
            kernel_tip = " Kernel is busy.";
            break;
          case "idle":
            kernel_tip = " Kernel is idle.";
            break;
          default:
            kernel_tip = " Kernel will start when you run code.";
        }
      } else {
        kernel_tip = "";
      }

      const usage_tip = (
        <div>
          Resource usage updates while the kernel runs. The memory limit is
          determined by the remining "free" memory of this project.
          <br />
          <Typography.Text type="secondary">
            Keep in mind that "shared memory" could compete with other projects
            on the same machine and hence you might not be able to fully attain
            it.
          </Typography.Text>
          <br />
          <Typography.Text type="warning">
            You can clear all cpu and memory usage by{" "}
            <em>restarting your kernel</em>. Learn more about{" "}
            <A href={"https://doc.cocalc.com/howto/low-memory.html"}>
              Low Memory
            </A>{" "}
            mitigations.
          </Typography.Text>
        </div>
      );

      const tip = (
        <span>
          {kernel_name}
          {backend_tip}
          {kernel_tip ? <br /> : undefined}
          {kernel_tip}
          <hr />
          {render_usage_text()}
          {usage_tip}
        </span>
      );
      return (
        <Tip
          title={title}
          tip={tip}
          placement={"bottom"}
          tip_style={{ maxWidth: "400px" }}
        >
          {body}
        </Tip>
      );
    }

    // show progress bar indicators for memory usage and the progress of the current cell (expected time)
    // if not fullscreen, i.e. smaller, pack this into two small bars.
    // the main use case is to communicate to the user if there is a cell that takes extraordinarily long to run,
    // or if the memory usage is eating up almost all of the reminining (shared) memory.

    function render_usage_graphical() {
      // unknown, e.g, not reporting/working or old backend.
      if (usage == null) return;

      const style: CSS = is_fullscreen
        ? { display: "flex" }
        : {
            display: "flex",
            flexFlow: "column",
            marginTop: "-6px",
          };
      const pstyle: CSS = {
        margin: "2px",
        width: "5em",
        position: "relative",
        top: "-1px",
      };
      const usage_style: CSS = is_fullscreen
        ? KERNEL_USAGE_STYLE
        : KERNEL_USAGE_STYLE_SMALL;

      // const status = usage.cpu > 50 ? "active" : undefined
      const status = cpu_runtime != null ? "active" : undefined;
      // we calibrate "100%" at the median – color changes at 2 x timings_q
      const cpu_val = Math.min(100, 100 * (cpu_runtime / timings_q));

      return (
        <div style={style}>
          <span style={usage_style}>
            {is_fullscreen && "CPU: "}
            <Progress
              style={pstyle}
              showInfo={false}
              percent={cpu_val}
              size="small"
              trailColor="white"
              status={status}
              strokeColor={ALERT_COLS[usage.time_alert]}
            />
          </span>
          <span style={usage_style}>
            {is_fullscreen && "Memory: "}
            <Progress
              style={pstyle}
              showInfo={false}
              percent={usage.mem_pct}
              size="small"
              trailColor="white"
              strokeColor={ALERT_COLS[usage.mem_alert]}
            />
          </span>
        </div>
      );
    }

    // helper for render_usage_text
    function usage_text_style_level(level: AlertLevel) {
      // ATTN for text, the high background color is different, with white text
      const style = KERNEL_USAGE_STYLE_NUM;
      switch (level) {
        case "low":
          return { ...style, backgroundColor: ALERT_COLS.low };
        case "mid":
          return { ...style, backgroundColor: ALERT_COLS.mid };
        case "high":
          return {
            ...style,
            backgroundColor: ALERT_COLS.high,
            color: "white",
          };
        case "none":
        default:
          return style;
      }
    }

    // this ends up in the popover tip. it contains the actual values and the same color coded usage levels
    function render_usage_text() {
      if (usage == null) return;
      const cpu_style = usage_text_style_level(usage.cpu_alert);
      const memory_style = usage_text_style_level(usage.mem_alert);
      const time_style = usage_text_style_level(usage.time_alert);
      const { cpu, mem } = usage;
      const cpu_disp = `${rpad_html(cpu, 3)}%`;
      const mem_disp = `${rpad_html(mem, 4)}MB`;
      const round = (val) => val.toFixed(1);
      const time_disp = `${rpad_html(cpu_runtime, 5, round)}s`;
      const style: CSS = { display: "flex" };
      return (
        <div style={style}>
          <span>
            CPU:{" "}
            <span
              className={"cocalc-jupyter-usage-info"}
              style={cpu_style}
              dangerouslySetInnerHTML={{ __html: cpu_disp }}
            />
          </span>
          <span>
            Time:{" "}
            <span
              className={"cocalc-jupyter-usage-info"}
              style={time_style}
              dangerouslySetInnerHTML={{ __html: time_disp }}
            />
          </span>
          <span>
            Memory:{" "}
            <span
              className={"cocalc-jupyter-usage-info"}
              style={memory_style}
              dangerouslySetInnerHTML={{ __html: mem_disp }}
            />
          </span>
        </div>
      );
    }

    if (kernel == null) {
      return <span />;
    }

    const info = (
      <div
        style={{
          display: "flex",
          flex: "1 0",
          flexDirection: "row",
          flexWrap: "nowrap",
        }}
      >
        {render_usage_graphical()}
        {render_trust()}
        {render_name()}
        {render_backend_state_icon()}
      </div>
    );
    const body = (
      <div
        className="pull-right"
        style={{ color: COLORS.GRAY, cursor: "pointer", marginTop: "7px" }}
      >
        {info}
      </div>
    );
    const tip_title = "Details";
    return (
      <span>
        {render_logo()}
        {render_tip(tip_title, body)}
      </span>
    );
  }
);
