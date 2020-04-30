/*
Share server top-level landing page.
*/

import { React, Component, Rendered } from "../app-framework";
import { BasePage } from "./base-page";
import { TopBar } from "./top-bar";
import { IsPublicFunction } from "./types";
import { Settings } from "smc-hub/share/settings";

interface ContentPageProps {
  site_name?: string;
  base_url: string;
  path: string; // the path with no base url to the currently displayed file, directory, etc.
  viewer: "share" | "embed"; // 'share' or 'embed'
  project_id?: string; // only defined if we are viewing something in a project
  subtitle?: string;
  settings: Settings;
  notranslate?: boolean;
  is_public: IsPublicFunction;
  noindex: boolean;
  description?: string;
  launch_path?: string;
}

export class ContentPage extends Component<ContentPageProps> {
  public render(): Rendered {
    return (
      <BasePage
        base_url={this.props.base_url}
        subtitle={this.props.subtitle}
        google_analytics={this.props.settings.google_analytics}
        notranslate={this.props.notranslate}
        viewer={this.props.viewer}
        noindex={this.props.noindex}
        description={this.props.description}
      >
        <TopBar
          viewer={this.props.viewer}
          path={this.props.path}
          project_id={this.props.project_id}
          base_url={this.props.base_url}
          site_name={this.props.site_name}
          is_public={this.props.is_public}
          launch_path={this.props.launch_path}
        />
        {this.props.children}
      </BasePage>
    );
  }
}
