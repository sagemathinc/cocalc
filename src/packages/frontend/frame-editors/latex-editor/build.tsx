/*
 *  This file is part of CoCalc: Copyright © 2020-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Show the last latex build log, i.e., output from last time we ran the LaTeX build process.
*/

import { Button, Flex } from "antd";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { AntdTabItem, Tab, Tabs } from "@cocalc/frontend/antd-bootstrap";
import { CSS, React, Rendered, useRedux } from "@cocalc/frontend/app-framework";
import Ansi from "@cocalc/frontend/components/ansi-to-react";
import { Icon, r_join, Tip } from "@cocalc/frontend/components";
import Stopwatch from "@cocalc/frontend/editors/stopwatch/stopwatch";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { path_split, tail } from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { ExecuteCodeOutput } from "@cocalc/util/types/execute-code";
import { getResourceUsage } from "../rmd-editor/utils";
import { Actions } from "./actions";
import { BuildCommand } from "./build-command";
import { useBuildLogs } from "./hooks";
import { BUILD_SPECS, BuildLog, BuildLogs, BuildSpecName } from "./types";

// after that many seconds, warn visibly about a long running task and e.g. highlight the stop button
const WARN_LONG_RUNNING_S = 15;

interface Props {
  name: string;
  actions: Actions;
  path: string;
  font_size: number;
  status: string;
}

export const Build: React.FC<Props> = React.memo((props) => {
  const { name, actions, path, font_size: font_size_orig, status } = props;

  const font_size = 0.8 * font_size_orig;
  const build_logs: BuildLogs = useBuildLogs(name);
  //const job_infos: JobInfos = use_job_infos(name);
  const build_command = useRedux([name, "build_command"]);
  const build_command_hardcoded =
    useRedux([name, "build_command_hardcoded"]) ?? false;
  const knitr: boolean = useRedux([name, "knitr"]);
  const [active_tab, set_active_tab] = useState<string>(
    BUILD_SPECS.latex.label,
  );
  const [error_tab, set_error_tab] = useState<string | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);
  const stderrContainerRef = useRef<HTMLDivElement>(null);
  const [shownLog, setShownLog] = useState<string>("");

  // Compute whether we have running jobs - this determines UI precedence
  const hasRunningJobs = useMemo(() => {
    return (
      build_logs?.some((job) => {
        const jobJS: BuildLog = job?.toJS();
        return jobJS?.type === "async" && jobJS?.status === "running";
      }) ?? false
    );
  }, [build_logs]);

  // Auto-scroll to bottom when log updates
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
    if (stderrContainerRef.current) {
      stderrContainerRef.current.scrollTop =
        stderrContainerRef.current.scrollHeight;
    }
  }, [shownLog]);

  let no_errors = true;

  const logStyle: CSS = {
    fontFamily: "monospace",
    whiteSpace: "pre-line",
    color: COLORS.GRAY_D,
    background: COLORS.GRAY_LLL,
    width: "100%",
    padding: "5px",
    fontSize: `${font_size}px`,
    overflowY: "auto",
    margin: "0",
  } as const;

  function renderErrorHeader(errorIsInformational: boolean): string {
    return errorIsInformational ? "Output messages" : "Error output";
  }

  function render_tab_item(
    title: string,
    stdout: string,
    stderr: string,
    error?: boolean,
    job_info_str?: string,
  ): AntdTabItem {
    const err_style = error ? { background: COLORS.ANTD_BG_RED_L } : undefined;
    const tab_button = <div style={err_style}>{title}</div>;

    // Determine if stderr is informational (not actual errors)
    const hasStdout = stdout.trim().length > 0;
    const hasStderr = stderr.trim().length > 0;
    const stderrIsInformational = hasStderr && !error;

    return Tab({
      key: title,
      eventKey: title,
      title: tab_button,
      style: { ...logStyle, display: active_tab === title ? "block" : "none" },
      children: (
        <>
          {job_info_str ? (
            <div
              style={{
                fontWeight: "bold",
                marginBottom: "10px",
                borderBottom: "1px solid black",
              }}
            >
              {job_info_str}
            </div>
          ) : undefined}
          <div
            style={{ display: "flex", flexDirection: "column", height: "100%" }}
          >
            {hasStdout && (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  marginBottom: hasStderr ? "10px" : "0",
                }}
              >
                <div
                  style={{
                    fontWeight: "bold",
                    color: COLORS.GRAY_M,
                    borderBottom: `1px solid ${COLORS.GRAY_LL}`,
                    paddingBottom: "5px",
                    marginBottom: "5px",
                    fontSize: `${font_size * 0.9}px`,
                  }}
                >
                  Standard output
                </div>
                <div
                  style={{
                    flex: 1,
                    overflowY: "auto",
                    background: COLORS.GRAY_LLL,
                    padding: "5px",
                    borderRadius: "3px",
                  }}
                >
                  <Ansi>{stdout}</Ansi>
                </div>
              </div>
            )}
            {hasStderr && (
              <div
                style={{ flex: 1, display: "flex", flexDirection: "column" }}
              >
                <div
                  style={{
                    fontWeight: "bold",
                    color: error ? COLORS.ANTD_RED : COLORS.GRAY_M,
                    borderBottom: `1px solid ${
                      error ? COLORS.ANTD_RED_WARN : COLORS.GRAY_LL
                    }`,
                    paddingBottom: "5px",
                    marginBottom: "5px",
                    fontSize: `${font_size * 0.9}px`,
                  }}
                >
                  {renderErrorHeader(stderrIsInformational)}
                </div>
                <div
                  style={{
                    flex: 1,
                    overflowY: "auto",
                    background: stderrIsInformational
                      ? COLORS.GRAY_LLL
                      : COLORS.ANTD_BG_RED_L,
                    padding: "5px",
                    borderRadius: "3px",
                  }}
                >
                  <Ansi>{stderr}</Ansi>
                </div>
              </div>
            )}
          </div>
        </>
      ),
    });
  }

  function render_log(stage: BuildSpecName): AntdTabItem | undefined {
    if (build_logs == null) return;
    const x: BuildLog | undefined = build_logs.get(stage)?.toJS();
    // const y: ExecOutput | undefined = job_infos.get(stage)?.toJS();

    if (!x) return;
    const stdout = x.stdout ?? "";
    const stderr = x.stderr ?? "";
    if (!stdout && !stderr) return;
    // const time: number | undefined = x.get("time");
    // const time_str = time ? `(${(time / 1000).toFixed(1)} seconds)` : "";
    let job_info_str = "";
    // Show build time and resource usage if available for async jobs
    if (x.type === "async") {
      const { elapsed_s, stats } = x;
      if (typeof elapsed_s === "number" && elapsed_s > 0) {
        job_info_str = `Build time: ${elapsed_s.toFixed(1)} seconds.`;
      }

      // try to show peak resource usage if stats are available
      if (stats) {
        job_info_str += getResourceUsage(stats, "peak");
      }
    }
    const title = BUILD_SPECS[stage].label;
    // highlights tab, if there is at least one parsed error
    const error =
      ((build_logs.getIn([stage, "parse", "errors"]) as any)?.size ?? 0) > 0;
    // also show the problematic log to the user
    if (error) {
      no_errors = false;
      if (error_tab == null) {
        set_active_tab(title);
        set_error_tab(title);
      }
    }
    return render_tab_item(title, stdout, stderr, error, job_info_str);
  }

  function render_clean(): AntdTabItem | undefined {
    const value = build_logs?.getIn(["clean", "output"]) as any;
    if (!value) return;
    const title = "Clean Auxiliary Files";
    return render_tab_item(title, value, "", false);
  }

  function render_logs(): Rendered {
    // Hide logs when jobs are running - show live output instead
    if (hasRunningJobs) return;

    const items: AntdTabItem[] = [];

    let log: BuildSpecName;
    for (log in BUILD_SPECS) {
      if (log === "clean" || log === "build") continue; // skip these
      const item = render_log(log);
      if (item) items.push(item);
    }
    const clean = render_clean();
    if (clean) items.push(clean);

    // check if active_tab is in the list of items.key
    if (items.length > 0) {
      if (!items.some((item) => item.key === active_tab)) {
        set_active_tab(items[0].key);
      }
    }

    return (
      <Tabs
        activeKey={active_tab}
        onSelect={set_active_tab}
        tabPosition={"left"}
        size={"small"}
        style={{ height: "100%", overflowY: "hidden" }}
        items={items}
      />
    );
  }

  function render_build_command(): Rendered {
    return (
      <BuildCommand
        font_size={font_size}
        filename={path_split(path).tail}
        actions={actions}
        build_command={build_command}
        knitr={knitr}
        build_command_hardcoded={build_command_hardcoded}
      />
    );
  }

  // usually, one job is running at a time
  function render_jobs(): Rendered {
    if (!build_logs) return;
    const infos: React.JSX.Element[] = [];
    let isLongRunning = false;
    let stdoutTail = "";
    let stderrTail = "";
    let errorIsInformational = false;

    build_logs.forEach((infoI, key) => {
      const info: ExecuteCodeOutput = infoI?.toJS();
      if (!info || info.type !== "async" || info.status !== "running") return;
      const stats_str = getResourceUsage(info.stats, "last");
      const start = info.start;
      stdoutTail = tail(info.stdout ?? "", 100);
      stderrTail = tail(info.stderr ?? "", 100);
      // Update state for auto-scrolling effect
      const combinedLog =
        stdoutTail +
        (stderrTail
          ? `\n--- ${renderErrorHeader(!info.exit_code)} ---\n` + stderrTail
          : "");
      if (combinedLog !== shownLog) {
        setShownLog(combinedLog);
      }
      errorIsInformational = !info.exit_code;
      isLongRunning ||=
        typeof start === "number" &&
        webapp_client.server_time() - start > WARN_LONG_RUNNING_S * 1000;
      const { label } = BUILD_SPECS[key];
      infos.push(
        <Fragment key={key}>
          {label}{" "}
          {start != null ? (
            <Stopwatch
              compact
              state="running"
              time={start}
              noLabel
              noDelete
              noButtons
            />
          ) : undefined}{" "}
          {stats_str}
        </Fragment>,
      );
    });

    if (infos.length === 0) return;

    const hasStdout = stdoutTail.trim().length > 0;
    const hasStderr = stderrTail.trim().length > 0;

    return (
      <>
        <div
          style={{
            margin: "10px",
            justifyContent: "center",
            alignItems: "center",
            display: "flex",
            gap: "5px",
          }}
        >
          <Flex flex={1} style={{ gap: "5px" }}>
            Active: {r_join(infos)}...
          </Flex>
          <Flex flex={0}>
            <Tip title={"Stop building the document."}>
              <Button
                size="small"
                onClick={() => actions.stop_build()}
                icon={<Icon name={"stop"} />}
                type={isLongRunning ? "primary" : undefined}
              >
                Stop
              </Button>
            </Tip>
          </Flex>
        </div>
        <div
          style={{
            ...logStyle,
            height: "100%",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              fontWeight: "bold",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              flexShrink: 0,
            }}
          >
            {status}
            {"\n"}
          </div>
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: hasStdout && hasStderr ? "10px" : "0",
              overflow: "hidden",
            }}
          >
            {hasStdout && (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    fontWeight: "bold",
                    color: COLORS.GRAY_M,
                    borderBottom: `1px solid ${COLORS.GRAY_LL}`,
                    paddingBottom: "5px",
                    marginBottom: "5px",
                    fontSize: `${font_size * 0.9}px`,
                    flexShrink: 0,
                  }}
                >
                  Standard output (stdout)
                </div>
                <div
                  ref={logContainerRef}
                  style={{
                    flex: 1,
                    overflowY: "auto",
                    background: COLORS.GRAY_LLL,
                    padding: "5px",
                    borderRadius: "3px",
                  }}
                >
                  <Ansi>{stdoutTail}</Ansi>
                </div>
              </div>
            )}
            {hasStderr && (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    fontWeight: "bold",
                    color: COLORS.GRAY_M,
                    borderBottom: `1px solid ${COLORS.GRAY_LL}`,
                    paddingBottom: "5px",
                    marginBottom: "5px",
                    fontSize: `${font_size * 0.9}px`,
                    flexShrink: 0,
                  }}
                >
                  {renderErrorHeader(errorIsInformational)} (stderr)
                </div>
                <div
                  ref={stderrContainerRef}
                  style={{
                    flex: 1,
                    overflowY: "auto",
                    background: COLORS.GRAY_LLL,
                    padding: "5px",
                    borderRadius: "3px",
                  }}
                >
                  <Ansi>{stderrTail}</Ansi>
                </div>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  // if all errors are fixed, clear the state remembering we had an active error tab
  const logs = render_logs();
  if (no_errors && error_tab != null) set_error_tab(null);

  return (
    <div
      className={"smc-vfill cocalc-latex-build-content"}
      style={{
        overflow: "hidden",
        padding: "5px 0 0 5px",
        fontSize: `${font_size}px`,
      }}
    >
      {render_build_command()}
      {render_jobs()}
      {logs}
    </div>
  );
});
