/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Kernel display

import { CSS, React, useRedux } from "@cocalc/frontend/app-framework";
import { A, Icon, IconName, Loading } from "@cocalc/frontend/components";
import ComputeServer from "@cocalc/frontend/compute/inline";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import type {
  AlertLevel,
  BackendState,
  KernelState,
  Usage,
} from "@cocalc/jupyter/types";
import { capitalize, closest_kernel_match, rpad_html } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import {
  Button,
  Popconfirm,
  Popover,
  Progress,
  Tooltip,
  Typography,
} from "antd";
import * as immutable from "immutable";
import { ReactNode, useEffect } from "react";
import { FormattedMessage, useIntl } from "react-intl";
import ProgressEstimate from "../components/progress-estimate";
import { labels } from "../i18n";
import { JupyterActions } from "./browser-actions";
import Logo from "./logo";
import { ALERT_COLS } from "./usage";

const KERNEL_NAME_STYLE: CSS = {
  margin: "0px 5px",
  display: "block",
  color: COLORS.BLUE_DD,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
} as const;

const KERNEL_USAGE_STYLE: CSS = {
  margin: "0px 5px",
  color: COLORS.GRAY_M,
  borderRight: `1px solid ${COLORS.GRAY}`,
  paddingRight: "5px",
  display: "flex",
  flex: 1,
} as const;

const KERNEL_USAGE_STYLE_NUM: CSS = {
  fontFamily: "monospace",
} as const;

const KERNEL_ERROR_STYLE: CSS = {
  margin: "5px",
  color: "white",
  padding: "5px",
  backgroundColor: COLORS.ANTD_BG_RED_M,
} as const;

const BACKEND_STATE_STYLE: CSS = {
  display: "flex",
  marginRight: "5px",
  color: KERNEL_NAME_STYLE.color,
  fontSize: "18px",
} as const;

const BACKEND_STATE_HUMAN = {
  init: "Initializing",
  ready: "Ready to start",
  starting: "Starting",
  running: "Running",
} as const;

interface KernelProps {
  actions: JupyterActions;
  usage?: Usage;
  expected_cell_runtime?: number;
  style?: CSS;
  computeServerId?: number;
  is_fullscreen?: boolean;
}

export function Kernel({
  actions,
  expected_cell_runtime,
  style,
  usage,
  computeServerId,
  is_fullscreen,
}: KernelProps) {
  const intl = useIntl();
  const name = actions.name;

  // redux section
  const trust: undefined | boolean = useRedux([name, "trust"]);
  const read_only: undefined | boolean = useRedux([name, "read_only"]);
  const redux_kernel = useRedux([name, "kernel"]);
  const no_kernel = redux_kernel === "";
  // no redux_kernel or empty string (!) means there is no kernel
  const kernel: string | null = !redux_kernel ? null : redux_kernel;
  const kernels: undefined | immutable.List<any> = useRedux([name, "kernels"]);
  const runProgress = useRedux([name, "runProgress"]);
  const project_id: string = useRedux([name, "project_id"]);
  const kernel_info: undefined | immutable.Map<string, any> = useRedux([
    name,
    "kernel_info",
  ]);
  const backend_state: undefined | BackendState = useRedux([
    name,
    "backend_state",
  ]);
  const kernel_state: undefined | KernelState = useRedux([
    name,
    "kernel_state",
  ]);

  const backendIsStarting =
    backend_state === "starting" || backend_state === "spawning";

  const [isSpwarning, setIsSpawarning] = React.useState(false);
  useEffect(() => {
    if (isSpwarning && !backendIsStarting) {
      setIsSpawarning(false);
    } else if (!isSpwarning && backendIsStarting) {
      setIsSpawarning(true);
    }
  }, [backend_state]);

  // render functions start there

  // wrap "Logo" component
  function renderLogo() {
    if (project_id == null) {
      return;
    }
    return <Logo kernel={kernel} />;
  }

  // this renders the name of the kernel, if known, or a button to change to a similar but known one
  function render_name() {
    let display_name = kernel_info?.get("display_name");
    if (display_name == null && kernel != null && kernels != null) {
      // Definitely an unknown kernel
      const closestKernel = closest_kernel_match(
        kernel,
        kernels as any, // TODO
      );
      if (closestKernel == null) {
        return <span style={KERNEL_ERROR_STYLE}>Unknown kernel</span>;
      } else {
        const closestKernelDisplayName = closestKernel.get("display_name");
        const closestKernelName = closestKernel.get("name") as string;
        return (
          <span
            style={KERNEL_ERROR_STYLE}
            onClick={() => actions.set_kernel(closestKernelName)}
          >
            Unknown kernel <span style={{ fontWeight: "bold" }}>{kernel}</span>,
            click here to use {closestKernelDisplayName || "No Kernel"} instead.
          </span>
        );
      }
    } else {
      // List of known kernels just not loaded yet.
      if (display_name == null) {
        display_name = kernel ?? "No Kernel";
      }
      const style = { ...KERNEL_NAME_STYLE, maxWidth: "20em" };
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
    let name: IconName | undefined;
    let color: string | undefined;
    switch (backend_state) {
      case "failed":
        name = "bug";
        break;
      case "off":
      case "closed":
        name = "unlink";
        break;
      case "spawning":
      case "starting":
        name = "cocalc-ring";
        spin = true;
        break;
      case "running":
        switch (kernel_state) {
          case "busy":
            name = "circle";
            color = "#5cb85c";
            break;
          case "idle":
            name = "cocalc-ring";
            break;
          default:
            name = "cocalc-ring";
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
    if (IS_MOBILE) return;
    if (trust) {
      return (
        <div
          style={{
            display: "flex",
            color: COLORS.GRAY_M,
            paddingLeft: "5px",
            borderLeft: "1px solid gray",
          }}
        >
          Trusted
        </div>
      );
    } else {
      return (
        <div
          style={{
            paddingRight: "5px",
            borderRight: "1px solid gray",
          }}
        >
          <Tooltip
            title={intl.formatMessage({
              id: "jupyter.status.trust.no.tooltip",
              defaultMessage: "Notebook is not trusted",
              description: "The Jupyter Notebook content is not trusted",
            })}
          >
            <Button
              style={{ marginTop: "-2.5px" }}
              danger
              onClick={() => actions.trust_notebook()}
              size="small"
            >
              {intl.formatMessage({
                id: "jupyter.status.trust.no",
                defaultMessage: "Not Trusted",
                description: "Jupyter Notebook content is not trusted",
              })}
            </Button>
          </Tooltip>
        </div>
      );
    }
  }

  function kernelState(): ReactNode {
    if (kernel === null) {
      return (
        <>
          {intl.formatMessage({
            id: "jupyter.status.no_kernel",
            defaultMessage: "No kernel",
          })}{" "}
          <Tooltip title={intl.formatMessage(labels.select_a_kernel)}>
            <a
              onClick={() => {
                actions.show_select_kernel("user request");
              }}
            >
              (`${intl.formatMessage(labels.select)}...`)
            </a>
          </Tooltip>
        </>
      );
    }

    if (backend_state === "running") {
      switch (kernel_state) {
        case "busy":
          return (
            <>
              Busy{" "}
              <Tooltip
                title={intl.formatMessage({
                  id: "jupyter.status.interrupt_tooltip",
                  defaultMessage: "Interrupt the running computation",
                })}
              >
                <a
                  onClick={() => {
                    // using actions rather than frame actions, since I want
                    // this to work in places other than Jupyter notebooks.
                    actions.signal("SIGINT");
                  }}
                >
                  (interrupt)
                </a>
              </Tooltip>
            </>
          );
        case "idle":
          const tooltip = intl.formatMessage({
            id: "jupyter.status.halt_idle_tooltip",
            defaultMessage:
              "Terminate the kernel process? All variable state will be lost.",
            description: "Terminating the kernel of a Jupyter Notebook",
          });
          return (
            <>
              Idle{" "}
              <Popconfirm
                title={tooltip}
                onConfirm={() => {
                  actions.shutdown();
                }}
                okText={intl.formatMessage(labels.halt)}
                cancelText={intl.formatMessage(labels.cancel)}
              >
                <Tooltip title={tooltip}>
                  <a>(halt...)</a>
                </Tooltip>
              </Popconfirm>
            </>
          );
      }
    } else if (backendIsStarting) {
      return intl.formatMessage({
        id: "jupyter.status.backend_starting",
        defaultMessage: "Starting",
        description: "The kernel of a Jupyter Notebook is starting",
      });
    }
    return (
      <>
        {computeServerId ? (
          <ComputeServer id={computeServerId} noColor />
        ) : (
          "Home Base"
        )}
      </>
    );
  }

  function get_kernel_name(): React.JSX.Element {
    if (kernel_info != null) {
      const name = kernel_info.get(
        "display_name",
        kernel_info.get("name", "No Kernel"),
      );
      return <div>Kernel: {name}</div>;
    } else {
      return <span />;
    }
  }

  function renderKernelState() {
    if (!backend_state) return <div></div>;
    return (
      <Tooltip title={kernelState()} placement="bottom">
        <div
          style={{
            flex: 1,
            color: COLORS.GRAY_M,
            textAlign: "center",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            marginTop: "2.5px",
            fontSize: IS_MOBILE ? "10pt" : undefined,
          }}
        >
          {kernelState()}
        </div>
      </Tooltip>
    );
  }

  // a popover information, containin more in depth details about the kernel
  function renderTip(title: any, body: any) {
    const backend_tip =
      backend_state == null ? (
        ""
      ) : (
        <>
          Backend is {BACKEND_STATE_HUMAN[backend_state] ?? backend_state} in{" "}
          {computeServerId ? (
            <ComputeServer id={computeServerId} noColor />
          ) : (
            " the project "
          )}
          .
          <br />
        </>
      );
    const kernel_tip = kernelState();

    const usage_tip = computeServerId ? null : (
      <FormattedMessage
        id="jupyter.status.usage_tip"
        defaultMessage={`
        <p>
          This shows this kernel's resource usage. The memory limit is
          determined by the remaining "free" memory of this project.
          Open the "{processes}" tab see all activities of this project.
        </p>
        <p>
          <secondary>
            Keep in mind that "shared memory" could compete with other projects
            on the same machine and hence you might not be able to use all of it.
          </secondary>
        </p>
        <p>
          <secondary>
            You can clear all cpu and memory usage by <em>restarting your kernel</em>.
            Learn more about <A>Low Memory</A> mitigations.
          </secondary>
        </p>`}
        values={{
          processes: intl.formatMessage(labels.project_info_title),
          em: (ch) => <em>{ch}</em>,
          A: (ch) => (
            <A href={"https://doc.cocalc.com/howto/low-memory.html"}>{ch}</A>
          ),
          secondary: (ch) => (
            <Typography.Text type="secondary">{ch}</Typography.Text>
          ),
        }}
      />
    );

    const description = kernel_info?.getIn([
      "metadata",
      "cocalc",
      "description",
    ]);
    const language = capitalize(kernel_info?.get("language", "Unknown"));
    const langTxt = `${language}${description ? ` (${description})` : ""}`;
    const langURL = kernel_info?.getIn(["metadata", "cocalc", "url"]) as
      | string
      | undefined;
    const lang = (
      <>
        Language: {langURL != null ? <A href={langURL}>{langTxt}</A> : langTxt}
        <br />
      </>
    );

    const tip = (
      <span>
        {lang}
        {backend_tip}
        {kernel_tip}
        <hr />
        {render_usage_text()}
        {usage_tip}
      </span>
    );
    return (
      <Popover
        mouseEnterDelay={1}
        title={title}
        content={<div style={{ maxWidth: "400px" }}>{tip}</div>}
        placement={"bottom"}
      >
        {body}
      </Popover>
    );
  }

  // show progress bar indicators for memory usage and the progress of the current cell (expected time)
  // if not fullscreen, i.e. smaller, pack this into two small bars.
  // the main use case is to communicate to the user if there is a cell that takes extraordinarily long to run,
  // or if the memory usage is eating up almost all of the reminining (shared) memory.

  function renderUsage() {
    if (kernel == null) return;

    if (computeServerId) {
      // [ ] TODO: implement usage info for compute servers!
      return;
    }

    const style: CSS = {
      display: "flex",
      borderLeft: `1px solid ${COLORS.GRAY}`,
      cursor: "pointer",
    };
    const pstyle: CSS = {
      margin: "2px",
      width: "100%",
      position: "relative",
      top: "-1px",
    };
    const usage_style: CSS = KERNEL_USAGE_STYLE;

    if (isSpwarning) {
      // we massively overestimate: 15s for python and co, and 30s for sage and julia
      const s =
        kernel.startsWith("sage") || kernel.startsWith("julia") ? 30 : 15;
      return (
        <div style={{ ...usage_style, display: "flex" }}>
          <ProgressEstimate
            style={{ ...pstyle, width: "175px", top: "-3px" }}
            seconds={s}
          />
        </div>
      );
    }

    // unknown, e.g, not reporting/working or old backend.
    if (usage == null || expected_cell_runtime == null) return;

    // const status = usage.cpu > 50 ? "active" : undefined
    // const status = usage.cpu_runtime != null ? "active" : undefined;
    // **WARNING**: Including the status icon (which is computed above,
    // and done via status={status} for cpu below), leads to a MASSIVE
    // RENDERING BUG, where the cpu burns at like 50% anytime a Jupyter
    // notebook is being displayed. See
    //      https://github.com/sagemathinc/cocalc/issues/5185
    // we calibrate "100%" at the median – color changes at 2 x timings_q
    const cpu_val = Math.min(
      100,
      100 * (usage.cpu_runtime / expected_cell_runtime),
    );

    return (
      <div style={style}>
        {runProgress != null && (
          <Tooltip
            title={
              <>
                Percent of code cells that have been run since the kernel
                started.
              </>
            }
          >
            <div style={usage_style}>
              {is_fullscreen ? (
                <span style={{ marginRight: "5px" }}>Code</span>
              ) : (
                ""
              )}
              <Progress
                style={pstyle}
                showInfo={false}
                percent={runProgress}
                size="small"
                trailColor="white"
              />
            </div>
          </Tooltip>
        )}
        <div style={usage_style}>
          {is_fullscreen ? <span style={{ marginRight: "5px" }}>CPU</span> : ""}
          <Progress
            style={pstyle}
            showInfo={false}
            percent={cpu_val}
            size="small"
            trailColor="white"
            strokeColor={ALERT_COLS[usage.time_alert]}
          />
        </div>
        <div style={usage_style}>
          {is_fullscreen ? <span style={{ marginRight: "5px" }}>RAM</span> : ""}
          <Progress
            style={pstyle}
            showInfo={false}
            percent={usage.mem_pct}
            size="small"
            trailColor="white"
            strokeColor={ALERT_COLS[usage.mem_alert]}
          />
        </div>
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
    if (computeServerId) return;

    const cpu_style = usage_text_style_level(usage.cpu_alert);
    const memory_style = usage_text_style_level(usage.mem_alert);
    const time_style = usage_text_style_level(usage.time_alert);
    const { cpu, mem, mem_pct } = usage;
    const cpu_disp = `${rpad_html(cpu, 3)}%`;
    const mem_disp = `${rpad_html(mem, 4)}MB`;
    const round = (val) => val.toFixed(1);
    const time_disp = `${rpad_html(usage.cpu_runtime, 5, round)}s`;
    const mem_pct_disp = `${rpad_html(mem_pct, 3)}%`;
    const style: CSS = { whiteSpace: "nowrap" };
    return (
      <p style={style}>
        <span>
          CPU{" "}
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
          Memory{" "}
          <span
            className={"cocalc-jupyter-usage-info"}
            style={memory_style}
            dangerouslySetInnerHTML={{ __html: mem_disp }}
          />
          <span
            className={"cocalc-jupyter-usage-info"}
            style={memory_style}
            dangerouslySetInnerHTML={{ __html: mem_pct_disp }}
          />
        </span>
      </p>
    );
  }

  if (!no_kernel && kernel == null) {
    return null;
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
      {render_name()}
      {render_backend_state_icon()}
      {render_trust()}
    </div>
  );

  const body = (
    <div
      style={{
        color: COLORS.GRAY_M,
        cursor: "pointer",
      }}
    >
      {info}
    </div>
  );

  return (
    <div
      style={{
        overflow: "hidden",
        width: "100%",
        padding: "5px",
        backgroundColor: COLORS.GRAY_LLL,
        display: "flex",
        borderBottom: "1px solid #ccc",
        ...style,
      }}
    >
      <div style={{ flex: 1, display: "flex", maxWidth: "100%" }}>
        <div>{renderLogo()}</div>
        <div
          style={{
            flex: 1,
            fontSize: "10pt",
            textAlign: "center",
            marginTop: "3.5px",
          }}
        >
          {IS_MOBILE ? body : renderTip(get_kernel_name(), body)}
        </div>
        {renderKernelState()}
        {!IS_MOBILE && (
          <div style={{ flex: 1, marginTop: "2.5px" }}>
            {renderTip(get_kernel_name(), renderUsage())}
          </div>
        )}
      </div>
    </div>
  );
}
