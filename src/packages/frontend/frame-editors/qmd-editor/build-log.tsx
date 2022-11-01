/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button } from "@cocalc/frontend/antd-bootstrap";
import { Loading } from "@cocalc/frontend/components";
import Ansi from "@cocalc/ansi-to-react";
import React from "react";
import { Rendered, useRedux } from "@cocalc/frontend/app-framework";
import {
  STYLE_LOADING,
  STYLE_HEADER,
  STYLE_OUTER,
  STYLE_LOG,
  STYLE_PRE,
  STYLE_ERR,
} from "../rmd-editor/styles";

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

  // all output ends up as an error, so we add the error output to the normal output, if there was no exit error
  const build_log = !have_err
    ? `${build_log_out}\n${build_err_out}`.trim()
    : build_log_out;
  const build_err = have_err ? build_err_out : "";

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
    return (
      <div style={style("err")}>
        {header}
        <pre style={STYLE_PRE}>
          <Ansi>{build_err}</Ansi>
        </pre>
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
        <Button bsSize={"small"} onClick={() => set_show_stdout(true)}>
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
    return <Loading style={STYLE_LOADING} text={"Running Quarto ..."} />;
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
    return <div style={STYLE_OUTER}>{body()}</div>;
  }
});
