import * as React from "react";
import { sortBy, keys } from "lodash";
import { SettingBox, A, Icon, Loading } from "smc-webapp/r_misc";
import { rclass, rtypes, redux, Rendered } from "../../app-framework";
import { Project } from "./types";
import { Map } from "immutable";
import * as misc from "smc-util/misc2";
import { Button } from "antd";

const { CUSTOM_SOFTWARE_HELP_URL } = require("../../custom-software/util");
const { COLORS } = require("smc-util/theme");

declare let DEBUG;

interface ReactProps {
  name: string;
  project: Project;
}

interface ReduxProps {
  configuration: Map<string, any>;
  configuration_loading: boolean;
  available_features: { formatting: string };
}

export const ProjectCapabilities = rclass<ReactProps>(
  class ProjectCapabilities extends React.Component<ReactProps & ReduxProps> {
    public static reduxProps({ name }) {
      return {
        [name]: {
          configuration: rtypes.immutable,
          configuration_loading: rtypes.bool,
          available_features: rtypes.object
        }
      };
    }

    shouldComponentUpdate(props) {
      return misc.is_different(this.props, props, [
        "project",
        "configuration",
        "configuration_loading",
        "available_features"
      ]);
    }

    private render_features(avail): [Rendered, boolean] {
      const feature_map = [
        ["spellcheck", "Spellchecking"],
        ["rmd", "RMarkdown"],
        ["sage", "SageMath Worksheets"],
        ["jupyter_notebook", "Classical Jupyter Notebook"],
        ["jupyter_lab", "Jupyter Lab"],
        ["library", "Library of documents"],
        ["x11", "Graphical applications"],
        ["latex", "LaTeX editor"]
      ];
      const features: JSX.Element[] = [];
      let any_nonavail = false;
      for (const [key, display] of Array.from(sortBy(feature_map, f => f[1]))) {
        const available = avail[key];
        any_nonavail = !available;
        const color = available ? COLORS.BS_GREEN_D : COLORS.BS_RED;
        const icon = available ? "check-square" : "minus-square";
        let extra = "";
        if (key == "sage") {
          const main = this.props.configuration.get("main");
          const sage_version = main.capabilities?.sage_version;
          if (sage_version != null) {
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

    private render_formatter(formatter): [Rendered, boolean] | Rendered {
      if (formatter === false) {
        return <div>No code formatters are available</div>;
      }
      if (formatter === true) {
        return <div>All code formatters are available</div>;
      }

      const { tool2display } = require("smc-util/code-formatter");

      const r_formatters: JSX.Element[] = [];
      let any_nonavail = false;
      for (const tool of sortBy(keys(formatter), x => x)) {
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
          {this.render_debug_info(formatter)}
          <dl className={"dl-horizontal cc-project-settings-features"}>
            {r_formatters}
          </dl>
        </>
      );
      return [component, any_nonavail];
    }

    private render_noavail_info(): Rendered {
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

    private render_available(): Rendered {
      const avail = this.props.available_features;
      if (avail == undefined) {
        return (
          <div>
            Information about available features will show up here.
            <br />
            {this.props.configuration_loading ? <Loading /> : undefined}
          </div>
        );
      }

      const [features, non_avail_1] = this.render_features(avail);
      const [formatter, non_avail_2] = this.render_formatter(avail.formatting);

      return (
        <>
          <h3>Available features</h3>
          {features}
          <h3>Available formatter</h3>
          {formatter}
          {non_avail_1 || non_avail_2 ? this.render_noavail_info() : undefined}
        </>
      );
    }

    private render_debug_info(conf): Rendered {
      if (conf != null && DEBUG) {
        return (
          <pre style={{ fontSize: "9px", color: "black" }}>
            {JSON.stringify(conf, () => {}, 2)}
          </pre>
        );
      }
    }

    private reload(): void {
      const project_id = this.props.project.get("project_id");
      const pa = redux.getProjectActions(project_id);
      pa.reload_configuration();
    }

    private render_reload(): Rendered {
      return (
        <Button onClick={() => this.reload()} icon={"reload"}>
          Refresh
        </Button>
      );
    }

    render() {
      const conf = this.props.configuration;

      return (
        <SettingBox
          title={"Features and configuration"}
          icon={"clipboard-check"}
        >
          {this.render_debug_info(conf)}
          {this.render_available()}
          {this.render_reload()}
        </SettingBox>
      );
    }
  }
);
