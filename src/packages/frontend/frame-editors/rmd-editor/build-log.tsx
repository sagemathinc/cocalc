/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import Anser from "anser";
import React from "react";

import { Button } from "@cocalc/frontend/antd-bootstrap";
import { Rendered, useRedux } from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import Ansi from "@cocalc/frontend/components/ansi-to-react";
import HelpMeFix from "@cocalc/frontend/frame-editors/llm/help-me-fix";
import { Actions } from "./actions";
import {
  STYLE_ERR,
  STYLE_HEADER,
  STYLE_LOADING,
  STYLE_LOG,
  STYLE_OUTER,
  STYLE_PRE,
} from "./styles";

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
    const [show_stdout, set_show_stdout] = React.useState(false);

    function style(type: "log" | "err") {
      const style = type == "log" ? STYLE_LOG : STYLE_ERR;
      return { ...{ fontSize: `${font_size}px` }, ...style };
    }

    function stderr(): Rendered {
      if (!have_err) return;
      const header = show_stdout ? (
        <h4 style={STYLE_HEADER}>Error output</h4>
      ) : undefined;
      const errorStr = Anser.ansiToText(build_err.trim());
      return (
        <div style={style("err")}>
          {header}
          <pre style={STYLE_PRE}>
            <Ansi>{build_err}</Ansi>
          </pre>
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
        </div>
      );
    }

    function stdout(): Rendered {
      if (!build_log) return;
      if (!have_err || show_stdout) {
        return (
          <div style={style("log")}>
            {show_stdout && <h4 style={STYLE_HEADER}>Standard output</h4>}
            <pre style={STYLE_PRE}>
              <Ansi>{build_log}</Ansi>
            </pre>
          </div>
        );
      } else {
        return (
          <Button bsSize={"small"} block onClick={() => set_show_stdout(true)}>
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
        <Loading style={STYLE_LOADING} text={"Running rmarkdown::render ..."} />
      );
    } else if (!build_log && !build_err) {
      return (
        <div style={{ margin: "1rem" }}>
          Document not built:{" "}
          <Button bsSize={"small"} onClick={() => actions.run_rmd_converter()}>
            build now
          </Button>
          .
        </div>
      );
    } else {
      return <div style={STYLE_OUTER}>{body()}</div>;
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
