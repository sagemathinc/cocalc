import * as React from "react";
import { sortBy, keys } from "lodash";
import { SettingBox, A, Icon, Loading } from "smc-webapp/r_misc";
import { rclass, rtypes } from "../../app-framework";
import { Project } from "./types";
import { Map } from "immutable";

const { CUSTOM_SOFTWARE_HELP_URL } = require("./custom-software/util");
const { COLORS } = require("smc-util/theme");
const misc = require("smc-util/misc");

declare var DEBUG;

interface ReactProps {
  name: string;
  project: Project;
}

interface ReduxProps {
  configuration: Map<string, any>;
  configuration_loading: boolean;
  available_features: { formatting: string };
}

export const ProjectCapabilitiesPanel = rclass<ReactProps>(
  class ProjectCapabilitiesPanel extends React.Component<
    ReactProps & ReduxProps
  > {
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

    render_features(avail) {
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
      for (let [key, display] of Array.from(sortBy(feature_map, f => f[1]))) {
        const available = avail[key];
        any_nonavail = !available;
        const color = available ? COLORS.BS_GREEN_D : COLORS.BS_RED;
        const icon = available ? "check-square" : "minus-square";
        features.push(
          <React.Fragment key={key}>
            <dt>
              <Icon name={icon} style={{ color }} />
            </dt>
            <dd>{display}</dd>
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

    render_formatter(formatter) {
      if (formatter === false) {
        return <div>No code formatters are available</div>;
      }
      if (formatter === true) {
        return <div>All code formatters are available</div>;
      }

      const { tool2display } = require("smc-util/code-formatter");

      const r_formatters: JSX.Element[] = [];
      let any_nonavail = false;
      for (let tool of sortBy(keys(formatter), x => x)) {
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

    render_noavail_info() {
      return (
        <>
          <hr />
          <div style={{ color: COLORS.GRAY }}>
            Some features are not available, because this project runs a small{" "}
            {A(CUSTOM_SOFTWARE_HELP_URL, "customized stack of software")}. To
            enable all features, please create a new project using the default
            software environment.
          </div>
        </>
      );
    }

    render_available() {
      const avail = this.props.available_features;
      if (avail == null) {
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

    render_debug_info(conf) {
      if (conf != null && DEBUG) {
        return (
          <pre style={{ fontSize: "9px", color: "black" }}>
            {JSON.stringify(conf, () => {}, 2)}
          </pre>
        );
      }
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
        </SettingBox>
      );
    }
  }
);
