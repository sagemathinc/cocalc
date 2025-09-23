/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import Anser from "anser";
import React, { useEffect, useRef, useState } from "react";

import { Button } from "@cocalc/frontend/antd-bootstrap";
import { Rendered, useRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import Ansi from "@cocalc/frontend/components/ansi-to-react";
import HelpMeFix from "@cocalc/frontend/frame-editors/llm/help-me-fix";
import {
  STYLE_ERR,
  STYLE_HEADER,
  STYLE_LOG,
  STYLE_OUTER,
  STYLE_PRE,
} from "../rmd-editor/styles";
import { getResourceUsage } from "../rmd-editor/utils";
import { COLORS } from "@cocalc/util/theme";

interface BuildLogProps {
  name: string;
  actions: any;
  font_size: number;
}

export const BuildLog: React.FC<BuildLogProps> = React.memo((props) => {
  const { name, actions, font_size: font_size_orig } = props;

  const font_size = 0.8 * font_size_orig;

  const status = useRedux([name, "building"]);
  const build_err_out = useRedux([name, "build_err"]) ?? "";
  const have_err = (useRedux([name, "build_exit"]) ?? 0) !== 0;
  const build_log_out = useRedux([name, "build_log"]) ?? "";
  const job_info_raw = useRedux([name, "job_info"]);

  // all output ends up as an error, so we add the error output to the normal output, if there was no exit error
  const build_log = !have_err
    ? `${build_log_out}\n${build_err_out}`.trim()
    : build_log_out;
  const build_err = have_err ? build_err_out : "";

  const [showStdout, setShowStdout] = useState(false);
  const [shownLog, setShownLog] = useState("");
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Reset showStdout when a new build starts
  useEffect(() => {
    if (status) {
      setShowStdout(false);
    }
  }, [status]);

  // Auto-scroll to bottom when log updates during build
  useEffect(() => {
    if (status && build_log !== shownLog) {
      setShownLog(build_log);
      if (logContainerRef.current) {
        logContainerRef.current.scrollTop =
          logContainerRef.current.scrollHeight;
      }
    }
  }, [build_log, status, shownLog]);

  function style(type: "log" | "err") {
    const style = type == "log" ? STYLE_LOG : STYLE_ERR;
    return { ...{ fontSize: `${font_size}px` }, ...style };
  }

  function stderr(): Rendered {
    if (!build_err) return;

    // If command succeeded (exit code 0) but there's stderr output,
    // it might be informational messages, so use neutral styling
    const isInformational = !have_err;
    const header = showStdout ? (
      <h4 style={STYLE_HEADER}>
        {isInformational ? "Output messages" : "Error output"}
      </h4>
    ) : undefined;

    const errorStr = Anser.ansiToText(build_err.trim());
    return (
      <div style={isInformational ? style("log") : style("err")}>
        {header}
        <pre style={STYLE_PRE}>
          <Ansi>{build_err}</Ansi>
        </pre>
        {have_err && (
          <HelpMeFix
            style={{ margin: "5px" }}
            outerStyle={{ textAlign: "center" }}
            task={"compiled Quarto in using quarto render"}
            error={errorStr}
            input={() => {
              const lineNo = extractLineNumbers(errorStr);
              if (lineNo) {
                const [_from, to] = lineNo;
                const s = actions._syncstring.to_str();
                const lineNoStr = `  # this is line ${to}`;
                // line numbers are 1-based
                return (
                  s
                    .split("\n")
                    .slice(0, to - 1)
                    .join("\n") + lineNoStr
                );
              }
              return "";
            }}
            language={"qmd"}
            extraFileInfo={actions.languageModelExtraFileInfo(false)}
            tag={"help-me-fix:qmd"}
            prioritize="start-end"
          />
        )}
      </div>
    );
  }

  function stdout(): Rendered {
    if (!build_log) return;
    if (!have_err || showStdout || status) {
      return (
        <div style={style("log")}>
          {showStdout && (
            <div
              style={{
                ...STYLE_HEADER,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>Standard output</span>
              <Button
                bsSize={"xsmall"}
                onClick={() => setShowStdout(false)}
                style={{ fontSize: "0.8em", padding: "2px 6px" }}
              >
                <Icon name="times-circle" /> Close
              </Button>
            </div>
          )}
          <pre style={STYLE_PRE}>
            <Ansi>{build_log}</Ansi>
          </pre>
        </div>
      );
    } else {
      return (
        <Button bsSize={"small"} block onClick={() => setShowStdout(true)}>
          Show full output
        </Button>
      );
    }
  }

  function body(): Rendered {
    return (
      <>
        {stderr()}
        {stdout()}
      </>
    );
  }

  if (status) {
    return (
      <div
        style={{
          ...STYLE_OUTER,
          display: "flex",
          flexDirection: "column",
          height: "100%",
        }}
      >
        <div
          style={{
            margin: "10px",
            fontWeight: "bold",
            fontSize: `${font_size}px`,
            flexShrink: 0,
          }}
        >
          Running Quarto ...
          {job_info_raw &&
            getResourceUsage(
              (job_info_raw?.toJS ? job_info_raw.toJS() : job_info_raw).stats,
              "last",
            )}
        </div>
        <div
          ref={logContainerRef}
          style={{
            flex: 1,
            overflow: "auto",
            minHeight: 0,
          }}
        >
          {body()}
        </div>
      </div>
    );
  } else if (!build_log && !build_err) {
    return (
      <div style={{ margin: "1rem" }}>
        Document not built:{" "}
        <Button bsSize={"small"} onClick={() => actions.run_qmd_converter()}>
          build now
        </Button>
        .
      </div>
    );
  } else {
    // Execution completed - show peak resource usage if available
    const peakResourceUsage = job_info_raw
      ? getResourceUsage(
          (job_info_raw?.toJS ? job_info_raw.toJS() : job_info_raw).stats,
          "peak",
        )
      : "";

    return (
      <div style={STYLE_OUTER}>
        {peakResourceUsage && (
          <div
            style={{
              margin: "10px",
              fontWeight: "bold",
              fontSize: `${font_size}px`,
              color: COLORS.GRAY_M,
            }}
          >
            Build completed.{peakResourceUsage}
          </div>
        )}
        {body()}
      </div>
    );
  }
});

function extractLineNumbers(input: string): [number, number] | null {
  // Regex to match the pattern "lines 58-79"
  const regex = /lines\s+(\d+)-(\d+)/;
  const match = input.match(regex);

  if (match) {
    // Extract the line numbers from the capturing groups
    const fromLine = parseInt(match[1], 10);
    const toLine = parseInt(match[2], 10);
    return [fromLine, toLine];
  }

  // Return null if the pattern is not found
  return null;
}
