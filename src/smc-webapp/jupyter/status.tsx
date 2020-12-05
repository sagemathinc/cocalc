/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Kernel display

import { React, useRedux, CSS } from "../app-framework";
import * as immutable from "immutable";
import { Progress } from "antd";
import { COLORS } from "smc-util/theme";
import { Icon } from "../r_misc/icon";
import { Loading } from "../r_misc/loading";
import { Tip } from "../r_misc/tip";
import { closest_kernel_match, rpad_html } from "smc-util/misc";
import { Logo } from "./logo";
import { JupyterActions } from "./browser-actions";
import { ImmutableUsageInfo } from "../../smc-project/usage-info/types";
import {
  ALERT_HIGH_PCT,
  ALERT_MEDIUM_PCT,
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
};

const KERNEL_USAGE_STYLE: CSS = {
  margin: "0px 5px",
  color: COLORS.GRAY,
  borderRight: `1px solid ${COLORS.GRAY}`,
  paddingRight: "5px",
};

const KERNEL_USAGE_STYLE_NUM: CSS = { fontFamily: "monospace" };

const KERNEL_ERROR_STYLE: CSS = {
  margin: "5px",
  color: "#fff",
  padding: "5px",
  backgroundColor: "red",
};

const BACKEND_STATE_STYLE: CSS = {
  display: "flex",
  marginRight: "5px",
  color: KERNEL_NAME_STYLE.color,
};

type BackendState = "init" | "ready" | "spawning" | "starting" | "running";

interface Usage {
  mem: number; // MiB
  mem_limit: number;
  mem_level: "low" | "mid" | "high" | "none";
  mem_pct: number; // %
  cpu: number; // 1 core = 100%
  cpu_limit: number;
  cpu_level: "low" | "mid" | "high" | "none";
  cpu_pct: number; // 100% full container quota
}

function useEvalStats(cells?: immutable.Map<string, any>) {
  const [q90, set_q90] = React.useState(10);

  if (cells != null) {
    const timings = cells
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
      .sort();
    console.log(timings?.toJS());
    const last = timings?.toJS();
    if (last != null && last.length > 0) set_q90(last[last.length - 1]);
  }
  return q90;
}

interface KernelProps {
  // OWN PROPS
  actions: JupyterActions;
  is_fullscreen?: boolean;
  name: string;
  cells?: immutable.Map<string, any>;
}

export const Kernel: React.FC<KernelProps> = React.memo(
  (props: KernelProps) => {
    const { actions, is_fullscreen, name, cells } = props;
    const q90 = useEvalStats(cells);
    console.log("q90", q90);

    // redux section
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
    const trust: undefined | boolean = useRedux([name, "trust"]);
    const read_only: undefined | boolean = useRedux([name, "read_only"]);

    const usage: Usage | undefined = React.useMemo(() => {
      // not using resources, set to zero and sane defaults
      if (
        kernel_usage == null ||
        backend_state == null ||
        !["running", "starting"].includes(backend_state)
      ) {
        return {
          mem: 0,
          mem_limit: 1000,
          cpu: 0,
          cpu_limit: 1,
          mem_level: "none",
          cpu_level: "none",
          mem_pct: 0,
          cpu_pct: 0,
        };
      }

      const mem_limit = kernel_usage.get("mem_limit") ?? 1000;
      const cpu_limit = kernel_usage.get("cpu_limit") ?? 1;
      const cpu_mid = ALERT_MEDIUM_PCT * cpu_limit;
      const cpu_high = ALERT_HIGH_PCT * cpu_limit;
      const mem_mid = (ALERT_MEDIUM_PCT / 100) * mem_limit;
      const mem_high = (ALERT_HIGH_PCT / 100) * mem_limit;
      const mem_low = Math.min(500, 0.5 * mem_mid);
      const mem = kernel_usage.get("mem") ?? 0;
      const cpu = kernel_usage.get("cpu") ?? 0;
      const cpu_level =
        cpu > cpu_high
          ? "high"
          : cpu > cpu_mid
          ? "mid"
          : cpu > 10
          ? "low"
          : "none";
      const mem_level =
        mem > mem_high
          ? "high"
          : mem > mem_mid
          ? "mid"
          : mem > mem_low
          ? "low"
          : "none";
      return {
        mem,
        mem_limit,
        cpu,
        cpu_limit,
        cpu_level,
        mem_level,
        mem_pct: (100 * mem) / mem_limit,
        cpu_pct: (100 * cpu) / cpu_limit,
      };
    }, [kernel_usage, backend_state]);

    const [cpu_start, set_cpu_start] = React.useState<number | undefined>();
    const [cpu_runtime, set_cpu_runtime] = React.useState<number>(0);
    const timer1 = React.useRef<ReturnType<typeof setInterval> | undefined>();

    React.useEffect(() => {
      if (cpu_start == null && usage.cpu_pct >= 10) {
        set_cpu_start(Date.now());
      }
      if (cpu_start != null && usage.cpu_pct < 10) {
        set_cpu_runtime(0);
        set_cpu_start(undefined);
      }
    }, [usage.cpu_pct]);

    React.useEffect(() => {
      if (cpu_start != null) {
        timer1.current = setInterval(() => {
          // this resets the bar earlier, avoids laggy behavior
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
          Usage of the kernel process updated while your kernel runs.
          <br />
          Does NOT include subprocesses.
          <br />
          You can clear all cpu and memory usage by restarting your kernel.
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

    function render_usage_graphical() {
      // unknown, e.g, not reporting/working or old backend.
      if (usage == null) return;

      const style: CSS = { display: "flex" };
      const style2: CSS = {
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
      const usage2: CSS = { height: "5px", marginBottom: "4px", width: "5em" };

      const lvl2col = {
        none: COLORS.ANTD_GREEN,
        low: COLORS.ANTD_YELL_M,
        mid: COLORS.ANTD_ORANGE,
        high: COLORS.ANTD_RED_WARN,
      };

      // const status = usage.cpu > 50 ? "active" : undefined
      const status = cpu_runtime != null ? "active" : undefined;
      const cpu_val = Math.min(100, 10 * cpu_runtime); // Math.min(100, cpu_runtime * 10)

      if (is_fullscreen) {
        return (
          <div style={style}>
            <span style={KERNEL_USAGE_STYLE}>
              CPU:{" "}
              <Progress
                style={pstyle}
                showInfo={false}
                percent={cpu_val}
                size="small"
                trailColor="white"
                status={status}
                strokeColor={lvl2col[usage.cpu_level]}
              />
            </span>
            <span style={KERNEL_USAGE_STYLE}>
              Memory:{" "}
              <Progress
                style={pstyle}
                showInfo={false}
                percent={usage.mem_pct}
                size="small"
                trailColor="white"
                strokeColor={lvl2col[usage.mem_level]}
              />
            </span>
          </div>
        );
      } else {
        return (
          <div style={style2}>
            <span style={usage2}>
              <Progress
                style={pstyle}
                showInfo={false}
                percent={usage.cpu_pct}
                size="small"
                trailColor="white"
                status={usage.cpu > 50 ? "active" : undefined}
                strokeColor={lvl2col[usage.cpu_level]}
              />
            </span>
            <span style={usage2}>
              <Progress
                style={pstyle}
                showInfo={false}
                percent={usage.mem_pct}
                size="small"
                trailColor="white"
                strokeColor={lvl2col[usage.mem_level]}
              />
            </span>
          </div>
        );
      }
    }

    function usage_text_style(usage) {
      let cpu_style, memory_style;
      cpu_style = memory_style = KERNEL_USAGE_STYLE_NUM;
      switch (usage.cpu_level) {
        case "low":
          cpu_style = { ...cpu_style, backgroundColor: "yellow" };
          break;
        case "mid":
          cpu_style = { ...cpu_style, backgroundColor: "orange" };
          break;
        case "high":
          cpu_style = {
            ...cpu_style,
            backgroundColor: COLORS.BS_RED_BGRND,
            color: "white",
          };
          break;
      }
      switch (usage.mem_level) {
        case "low":
          memory_style = { ...memory_style, backgroundColor: "yellow" };
          break;
        case "high":
          memory_style = {
            ...memory_style,
            backgroundColor: COLORS.BS_RED_BGRND,
            color: "white",
          };
          break;
      }

      return { cpu_style, memory_style };
    }

    function render_usage_text() {
      if (usage == null) return;
      const { cpu_style, memory_style } = usage_text_style(usage);
      const { cpu, mem } = usage;
      const cpu_disp = `${rpad_html(cpu, 3)}%`;
      const mem_disp = `${rpad_html(mem, 4)}MB`;
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
            {" "}
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

    function render() {
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

    return render();
  }
);
