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
import { Actions } from "./actions";
import {
  STYLE_ERR,
  STYLE_HEADER,
  STYLE_LOG,
  STYLE_OUTER,
  STYLE_PRE,
} from "./styles";
import { getResourceUsage } from "./utils";

interface BuildLogProps {
  name: string;
  actions: Actions;
  font_size: number;
}

export const BuildLog: React.FC<BuildLogProps> = React.memo(
  (props: BuildLogProps) => {
    const { name, actions, font_size: font_size_orig } = props;

    const font_size = 0.8 * font_size_orig;

    const status = useRedux([name, "building"]);
    const build_log = useRedux([name, "build_log"]) || "";
    const build_err = useRedux([name, "build_err"]) || "";
    const have_err = (useRedux([name, "build_exit"]) || 0) != 0;
    const stats = useRedux([name, "job_info"])?.get("stats")?.toJS();
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
          logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
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
              task={"compiled RMarkdown in R using rmarkdown::render()"}
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
              language={"rmd"}
              extraFileInfo={actions.languageModelExtraFileInfo(false)}
              tag={"help-me-fix:rmd"}
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

    if (!build_log && !build_err && !status) {
      return (
        <div style={{ margin: "1rem", fontSize: `${font_size}px` }}>
          Document not built:{" "}
          <Button bsSize={"small"} onClick={() => actions.run_rmd_converter()}>
            build now
          </Button>
          .
        </div>
      );
    } else {
      return (
        <div ref={status ? logContainerRef : undefined} style={STYLE_OUTER}>
          {status && (
            <div
              style={{
                margin: "10px",
                fontWeight: "bold",
                fontSize: `${font_size}px`,
              }}
            >
              Running rmarkdown::render ...
              <br />
              {stats && getResourceUsage(stats, "last")}
            </div>
          )}
          {body()}
        </div>
      );
    }
  },
);

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
