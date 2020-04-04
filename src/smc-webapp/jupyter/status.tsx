/*
Kernel display
*/

import { React, Component, rclass, rtypes } from "../app-framework";
import * as immutable from "immutable";
import { Icon } from "../r_misc/icon";
import { Loading } from "../r_misc/loading";
import { Tip } from "../r_misc/tip";
import { closest_kernel_match } from "smc-util/misc";
import { Logo } from "./logo";
import { trunc } from "smc-util/misc2";
import { JupyterActions } from "./browser-actions";

interface ModeProps {
  mode?: string;
  name: string;
}

class Mode0 extends Component<ModeProps> {
  public static reduxProps({ name }) {
    return {
      [name]: {
        mode: rtypes.string,
      },
    };
  }

  shouldComponentUpdate(nextProps) {
    return nextProps.mode !== this.props.mode;
  }

  render() {
    if (this.props.mode !== "edit") {
      return <span />;
    }
    return (
      <div
        className="pull-right"
        style={{ color: "#666", margin: "5px", paddingRight: "5px" }}
      >
        <Icon name="pencil" />
      </div>
    );
  }
}

export const Mode = rclass(Mode0);

const KERNEL_NAME_STYLE: React.CSSProperties = {
  margin: "5px",
  color: "rgb(33, 150, 243)",
  borderLeft: "1px solid #666",
  paddingLeft: "5px",
};

const KERNEL_USAGE_STYLE: React.CSSProperties = {
  margin: "5px",
  color: "#666",
  borderRight: "1px solid #666",
  paddingRight: "5px",
};

const KERNEL_ERROR_STYLE: React.CSSProperties = {
  margin: "5px",
  color: "#fff",
  padding: "5px",
  backgroundColor: "red",
};

const BACKEND_STATE_STYLE: React.CSSProperties = {
  marginRight: "5px",
  color: KERNEL_NAME_STYLE.color,
};

interface KernelProps {
  // OWN PROPS
  actions: JupyterActions;
  is_fullscreen?: boolean;
  name: string;

  // REDUX PROPS
  kernel?: string;
  kernels?: immutable.List<any>;
  project_id?: string;
  kernel_info?: immutable.Map<string, any>;
  backend_state?: string;
  kernel_state?: string;
  kernel_usage?: immutable.Map<string, any>;
  trust?: boolean;
  read_only?: boolean;
}

class Kernel0 extends Component<KernelProps> {
  public static reduxProps({ name }) {
    return {
      [name]: {
        kernel: rtypes.string,
        kernels: rtypes.immutable.List,
        project_id: rtypes.string,
        kernel_info: rtypes.immutable.Map,
        backend_state: rtypes.string,
        kernel_state: rtypes.string,
        kernel_usage: rtypes.immutable.Map,
        trust: rtypes.bool,
        read_only: rtypes.bool,
      },
    };
  }

  shouldComponentUpdate(nextProps) {
    return (
      nextProps.kernel !== this.props.kernel ||
      (nextProps.kernels != null) !== (this.props.kernels != null) || // yes, only care about defined state\
      nextProps.project_id !== this.props.project_id ||
      nextProps.kernel_info !== this.props.kernel_info ||
      nextProps.backend_state !== this.props.backend_state ||
      nextProps.kernel_state !== this.props.kernel_state ||
      nextProps.kernel_usage !== this.props.kernel_usage ||
      nextProps.trust !== this.props.trust ||
      nextProps.read_only !== this.props.read_only
    );
  }

  render_logo() {
    if (this.props.project_id == null || this.props.kernel == null) {
      return;
    }
    return (
      <span className="pull-right">
        <Logo
          project_id={this.props.project_id}
          kernel={this.props.kernel}
          kernel_info_known={this.props.kernel_info != null}
        />
      </span>
    );
  }

  render_name() {
    let display_name =
      this.props.kernel_info != null
        ? this.props.kernel_info.get("display_name")
        : undefined;
    if (display_name == null && this.props.kernels != null) {
      // Definitely an unknown kernel
      const closestKernel = closest_kernel_match(
        this.props.kernel,
        this.props.kernels
      );
      if (closestKernel == null) {
        return <span style={KERNEL_ERROR_STYLE}>Unknown kernel</span>;
      } else {
        const closestKernelDisplayName = closestKernel.get("display_name");
        const closestKernelName = closestKernel.get("name");
        return (
          <span
            style={KERNEL_ERROR_STYLE}
            onClick={() => this.props.actions.set_kernel(closestKernelName)}
          >
            Unknown kernel{" "}
            <span style={{ fontWeight: "bold" }}>{this.props.kernel}</span>,
            click here to use {closestKernelDisplayName} instead.
          </span>
        );
      }
    } else {
      // List of known kernels just not loaded yet.
      if (display_name == null) {
        display_name = this.props.kernel;
      }
      return (
        <span
          style={KERNEL_NAME_STYLE}
          onClick={() => this.props.actions.show_select_kernel("user request")}
        >
          {display_name != null
            ? trunc(display_name, this.props.is_fullscreen ? 16 : 8)
            : "No Kernel"}
        </span>
      );
    }
  }

  render_backend_state_icon() {
    if (this.props.read_only) {
      return;
    }
    const { backend_state } = this.props;
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
        switch (this.props.kernel_state) {
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
      <span style={BACKEND_STATE_STYLE}>
        <Icon name={name} spin={spin} style={{ color }} />
      </span>
    );
  }

  render_trust() {
    if (this.props.trust) {
      if (!this.props.is_fullscreen) return;
      return <span style={{ color: "#888" }}>Trusted</span>;
    } else {
      return (
        <span
          title={"Notebook is not trusted"}
          style={{
            background: "#5bc0de",
            color: "white",
            cursor: "pointer",
            padding: "3px",
            borderRadius: "3px",
          }}
          onClick={() => this.props.actions.trust_notebook()}
        >
          Not Trusted
        </span>
      );
    }
  }

  render_tip(title: any, body: any) {
    let kernel_name;
    if (this.props.kernel_info != null) {
      kernel_name = (
        <div>
          <b>Kernel: </b>
          {this.props.kernel_info.get("display_name", "No Kernel")}
        </div>
      );
    } else {
      kernel_name = <span />;
    }
    let kernel_tip;
    const { backend_state } = this.props;
    const backend_tip = `Backend is ${backend_state}.`;
    if (backend_state === "running") {
      switch (this.props.kernel_state) {
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

    const tip = (
      <span>
        {kernel_name}
        {backend_tip}
        {kernel_tip ? <br /> : undefined}
        {kernel_tip}
      </span>
    );
    return (
      <Tip title={title} tip={tip} placement={"leftTop"}>
        {body}
      </Tip>
    );
  }

  render_usage() {
    let cpu, cpu_style, memory, memory_style;
    if (this.props.kernel_usage == null) {
      // unknown, e.g, not reporting/working or old backend.
      return;
    }
    if (
      this.props.backend_state !== "running" &&
      this.props.backend_state !== "starting"
    ) {
      // not using resourcesw
      memory = cpu = 0;
    } else {
      memory = this.props.kernel_usage.get("memory");
      if (memory == null) {
        return;
      }
      cpu = this.props.kernel_usage.get("cpu");
      if (cpu == null) {
        return;
      }
      memory = Math.round(memory / 1000000);
      cpu = Math.round(cpu);
      cpu_style = memory_style = undefined;
      if (cpu > 10 && cpu < 50) {
        cpu_style = { backgroundColor: "yellow" };
      }
      if (cpu > 50) {
        cpu_style = { backgroundColor: "rgb(92,184,92)", color: "white" };
      }
      if (memory > 500) {
        memory_style = { backgroundColor: "yellow" };
      }
      if (memory > 800) {
        // TODO: depend on upgrades...?
        memory_style = { backgroundColor: "red", color: "white" };
      }
    }
    const tip = (
      <div>
        Usage of the kernel process updated every few seconds.
        <br />
        Does NOT include subprocesses.
        <br />
        You can clear all memory by selecting Close and Halt from the File menu
        or restarting your kernel.
      </div>
    );
    return (
      <Tip title="Kernel CPU and Memory Usage" tip={tip} placement={"bottom"}>
        {this.render_usage_text(cpu, memory, cpu_style, memory_style)}
      </Tip>
    );
  }

  render_usage_text(cpu, memory, cpu_style, memory_style) {
    if (this.props.is_fullscreen) {
      return (
        <span>
          <span style={KERNEL_USAGE_STYLE}>
            CPU: <span style={cpu_style}>{cpu}%</span>
          </span>
          <span style={KERNEL_USAGE_STYLE}>
            Memory:{" "}
            <span style={memory_style}>
              {memory}
              MB
            </span>
          </span>
        </span>
      );
    } else {
      return (
        <span>
          <span style={cpu_style}>{cpu}%</span>{" "}
          <span style={memory_style}>
            {memory}
            MB
          </span>
        </span>
      );
    }
  }

  render() {
    if (this.props.kernel == null) {
      return <span />;
    }
    const title = (
      <span>
        {this.render_usage()}
        {this.render_trust()}
        {this.render_name()}
      </span>
    );
    const body = (
      <div
        className="pull-right"
        style={{ color: "#666", cursor: "pointer", marginTop: "7px" }}
      >
        {title}
        {this.render_backend_state_icon()}
      </div>
    );
    return (
      <span>
        {this.render_logo()}
        {this.render_tip(title, body)}
      </span>
    );
  }
}

export const Kernel = rclass(Kernel0);
