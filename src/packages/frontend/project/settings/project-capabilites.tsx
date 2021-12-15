/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";
import { sortBy, keys } from "lodash";
import { SettingBox, A, Icon, Loading } from "@cocalc/frontend/components";
import { redux, Rendered, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Project } from "./types";
import * as misc from "@cocalc/util/misc";
import { Button } from "antd";
import { ReloadOutlined } from "@ant-design/icons";

import { CUSTOM_SOFTWARE_HELP_URL } from "@cocalc/frontend/custom-software/util";
import { COLORS } from "@cocalc/util/theme";

declare let DEBUG;

interface ReactProps {
  name: string;
  project: Project;
  project_id: string;
}

function dont_render(prev, next) {
  return !misc.is_different(prev, next, [
    "project",
    "configuration",
    "configuration_loading",
    "available_features",
  ]);
}

export const ProjectCapabilities: React.FC<ReactProps> = React.memo(
  (props: ReactProps) => {
    const { project, project_id } = props;

    const available_features = useTypedRedux(
      { project_id },
      "available_features"
    );
    const configuration_loading = useTypedRedux(
      { project_id },
      "configuration_loading"
    );
    const configuration = useTypedRedux({ project_id }, "configuration");

    function render_features(avail): [Rendered, boolean] {
      const feature_map = [
        ["spellcheck", "Spellchecking"],
        ["rmd", "RMarkdown"],
        ["sage", "SageMath Worksheets"],
        ["jupyter_notebook", "Classical Jupyter Notebook"],
        ["jupyter_lab", "Jupyter Lab"],
        ["library", "Library of documents"],
        ["x11", "Graphical applications"],
        ["latex", "LaTeX editor"],
        ["html2pdf", "HTML to PDF via Chrome/Chromium"],
        ["pandoc", "File format conversions via pandoc"],
      ];
      const features: JSX.Element[] = [];
      let any_nonavail = false;
      for (const [key, display] of Array.from(
        sortBy(feature_map, (f) => f[1])
      )) {
        const available = avail[key];
        any_nonavail = !available;
        const color = available ? COLORS.BS_GREEN_D : COLORS.BS_RED;
        const icon = available ? "check-square" : "minus-square";
        let extra = "";
        if (key == "sage") {
          const main = configuration?.get("main");
          const sage_version = main?.capabilities?.sage_version;
          if (sage_version != null && Array.isArray(sage_version)) {
            extra = `(version ${sage_version.join(".")})`;
          }
        }
        features.push(
          <React.Fragment key={key}>
            <dt>
              <Icon name={icon} style={{ color }} />
            </dt>
            <dd>
              {display} {extra}
            </dd>
          </React.Fragment>
        );
      }

      const component = (
        <>
          <dl className={"dl-horizontal cc-project-settings-features"}>
            {features}
          </dl>
        </>
      );
      return [component, any_nonavail];
    }

    function render_formatter(formatter): [Rendered, boolean] {
      if (formatter === false) {
        return [<div>No code formatters are available</div>, true];
      }
      if (formatter === true) {
        return [<div>All code formatters are available</div>, false];
      }

      const { tool2display } = require("@cocalc/util/code-formatter");

      const r_formatters: JSX.Element[] = [];
      let any_nonavail = false;
      for (const tool of sortBy(keys(formatter), (x) => x)) {
        const available = formatter[tool];
        const color = available ? COLORS.BS_GREEN_D : COLORS.BS_RED;
        const icon = available ? "check-square" : "minus-square";
        const langs = tool2display[tool];
        // only tell users about tools where we know what for they're used
        if (langs == null || langs.length === 0) {
          continue;
        }
        // only consider availiability after eventually ignoring a specific tool,
        // because it will not show up in the UI
        any_nonavail = !available;

        r_formatters.push(
          <React.Fragment key={tool}>
            <dt>
              <Icon name={icon} style={{ color }} />{" "}
            </dt>
            <dd>
              <b>{tool}</b> for {misc.to_human_list(langs)}
            </dd>
          </React.Fragment>
        );
      }

      const component = (
        <>
          {render_debug_info(formatter)}
          <dl className={"dl-horizontal cc-project-settings-features"}>
            {r_formatters}
          </dl>
        </>
      );
      return [component, any_nonavail];
    }

    function render_noavail_info(): Rendered {
      return (
        <>
          <hr />
          <div style={{ color: COLORS.GRAY }}>
            Some features are not available, because this project runs a small{" "}
            <A href={CUSTOM_SOFTWARE_HELP_URL}>customized stack of software</A>.
            To enable all features, please create a new project using the
            default software environment.
          </div>
        </>
      );
    }

    function render_available(): Rendered {
      const avail = available_features?.toJS();
      if (avail == undefined) {
        return (
          <div>
            Information about available features will show up here.
            <br />
            {configuration_loading ? <Loading /> : undefined}
          </div>
        );
      }

      const [features, non_avail_1] = render_features(avail);
      const [formatter, non_avail_2] = render_formatter(avail.formatting);

      return (
        <>
          <h3>Available features</h3>
          {features}
          <h3>Available formatter</h3>
          {formatter}
          {non_avail_1 || non_avail_2 ? render_noavail_info() : undefined}
        </>
      );
    }

    function render_debug_info(conf): Rendered {
      if (conf != null && DEBUG) {
        return (
          <pre style={{ fontSize: "9px", color: "black" }}>
            {JSON.stringify(conf, undefined, 2)}
          </pre>
        );
      }
    }

    function reload(): void {
      const project_id = project.get("project_id");
      const pa = redux.getProjectActions(project_id);
      pa.reload_configuration();
    }

    function render_reload(): Rendered {
      return (
        <Button
          onClick={() => reload()}
          icon={<ReloadOutlined />}
          disabled={configuration_loading}
          style={{ float: "right", marginTop: "-7.5px" }} // that compensates for bootstrap's 15px's all over the place...
        >
          Refresh
        </Button>
      );
    }

    function render_title(): Rendered {
      return <span>{render_reload()}Features and configuration</span>;
    }

    const conf = configuration;

    return (
      <SettingBox title={render_title()} icon={"clipboard-check"}>
        {render_debug_info(conf)}
        {render_available()}
      </SettingBox>
    );
  },
  dont_render
);
