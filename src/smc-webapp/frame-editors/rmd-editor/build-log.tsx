/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import Ansi from "ansi-to-react";
import { Loading } from "smc-webapp/r_misc";
import { Rendered, useRedux } from "../../app-framework";
import { COLORS } from "../../../smc-util/theme";
import { Button } from "smc-webapp/antd-bootstrap";

interface BuildLogProps {
  name: string;
  actions: any;
  font_size: number;
}

const STYLE_LOADING: React.CSSProperties = {
  margin: "auto",
};

const STYLE_HEADER: React.CSSProperties = {
  margin: "1rem 1rem 0 1rem",
  borderBottom: `1px solid ${COLORS.GRAY}`,
  color: COLORS.GRAY,
};

const STYLE_OUTER: React.CSSProperties = {
  display: "flex",
  flex: "1 1 auto",
  flexDirection: "column",
  overflow: "auto",
};

const STYLE_LOG: React.CSSProperties = {
  flex: "1 1 auto",
};

const STYLE_PRE: React.CSSProperties = {
  whiteSpace: "pre-wrap",
  margin: "0",
  borderRadius: "0",
  border: "0",
  backgroundColor: "inherit",
};

const STYLE_ERR: React.CSSProperties = {
  ...STYLE_LOG,
  fontWeight: "bold",
  backgroundColor: COLORS.ATND_BG_RED_L,
};

const BuildLogFC: React.FC<BuildLogProps> = (props) => {
  const {
    /*id,*/
    name,
    actions,
    /*editor_state,*/
    /*is_fullscreen,*/
    /*project_id,*/
    /*path,*/
    /*reload,*/
    font_size: font_size_orig,
  } = props;

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
    return <Loading style={STYLE_LOADING} text={"Running rmarkdown::render ..."} />;
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
};

export const BuildLog = React.memo(
  BuildLogFC,
  (prev, next) => prev.name != next.name
);
