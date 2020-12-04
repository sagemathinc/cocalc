/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Kernel display

import { React, useRedux, CSS } from "../app-framework";
import * as immutable from "immutable";
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
import { COLORS } from "smc-util/theme";

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

interface KernelProps {
  // OWN PROPS
  actions: JupyterActions;
  is_fullscreen?: boolean;
  name: string;
}

export const Kernel: React.FC<KernelProps> = React.memo(
  (props: KernelProps) => {
    const { actions, is_fullscreen, name } = props;

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

    function render_logo() {
      if (project_id == null || kernel == null) {
        return;
      }
      return (
        <div style={{display: "flex"}} className="pull-right">
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
          Usage of the kernel process updated every few seconds.
          <br />
          Does NOT include subprocesses.
          <br />
          You can clear all memory by selecting Close and Halt from the File
          menu or restarting your kernel.
        </div>
      );

      const tip = (
        <span>
          {kernel_name}
          {backend_tip}
          {kernel_tip ? <br /> : undefined}
          {kernel_tip}
          {usage_tip}
        </span>
      );
      return (
        <Tip title={title} tip={tip} placement={"bottom"}>
          {body}
        </Tip>
      );
    }

    function render_usage() {
      let cpu, cpu_style, memory, memory_style, memory_limit, cpu_limit;
      if (kernel_usage == null) {
        // unknown, e.g, not reporting/working or old backend.
        return;
      }
      if (backend_state !== "running" && backend_state !== "starting") {
        // not using resources
        memory = cpu = 0;
      } else {
        memory = kernel_usage.get("mem");
        memory_limit = kernel_usage.get("mem_limit") ?? 1000;
        cpu_limit = kernel_usage.get("cpu_limit") ?? 1;
        if (memory == null) return;
        cpu = kernel_usage.get("cpu");
        if (cpu == null) return;
        cpu_style = memory_style = KERNEL_USAGE_STYLE_NUM;
        const cpu_mid = ALERT_MEDIUM_PCT * cpu_limit;
        const cpu_high = ALERT_HIGH_PCT * cpu_limit;
        if (10 < cpu && cpu <= cpu_mid) {
          cpu_style = { ...cpu_style, backgroundColor: "yellow" };
        } else if (cpu_mid < cpu && cpu <= cpu_high) {
          cpu_style = { ...cpu_style, backgroundColor: "orange" };
        } else if (cpu_high < cpu) {
          cpu_style = {
            ...cpu_style,
            backgroundColor: "rgb(92,184,92)",
            color: "white",
          };
        }
        if (memory > (ALERT_MEDIUM_PCT / 100) * memory_limit) {
          memory_style = { ...memory_style, backgroundColor: "yellow" };
        }
        if (memory > (ALERT_HIGH_PCT / 100) * memory_limit) {
          memory_style = {
            ...memory_style,
            backgroundColor: "red",
            color: "white",
          };
        }
      }
      return render_usage_text(cpu, memory, cpu_style, memory_style);
    }

    function render_usage_text(cpu, memory, cpu_style, memory_style) {
      const cpu_disp = `${rpad_html(cpu, 3)}%`;
      const mem_disp = `${rpad_html(memory, 4)}MB`;
      const style: CSS = { display: "flex" };
      if (is_fullscreen) {
        return (
          <div style={style}>
            <span style={KERNEL_USAGE_STYLE}>
              CPU:{" "}
              <span
                className={"cocalc-jupyter-usage-info"}
                style={cpu_style}
                dangerouslySetInnerHTML={{ __html: cpu_disp }}
              />
            </span>
            <span style={KERNEL_USAGE_STYLE}>
              Memory:{" "}
              <span
                className={"cocalc-jupyter-usage-info"}
                style={memory_style}
                dangerouslySetInnerHTML={{ __html: mem_disp }}
              />
            </span>
          </div>
        );
      } else {
        // we don't set the cocalc-jupyter-usage-info class, to make it more compact
        return (
          <div style={style}>
            <span
              style={cpu_style}
              dangerouslySetInnerHTML={{ __html: cpu_disp }}
            />{" "}
            <span
              style={memory_style}
              dangerouslySetInnerHTML={{ __html: mem_disp }}
            />
          </div>
        );
      }
    }

    function render() {
      if (kernel == null) {
        return <span />;
      }
      const title = (
        <div
          style={{
            display: "flex",
            flex: "1 0",
            flexDirection: "row",
            flexWrap: "nowrap",
          }}
        >
          {render_usage()}
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
          {title}
        </div>
      );
      return (
        <span>
          {render_logo()}
          {render_tip(title, body)}
        </span>
      );
    }

    return render();
  }
);
