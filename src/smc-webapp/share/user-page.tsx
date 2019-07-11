/*
Renders a page that describes a user and links to some
of the things they've publicly shared.
*/

import { Component, Rendered, React } from "../app-framework";

import { CoCalcLink } from "./cocalc-link";
import { BasePage } from "./base-page";

interface Props {
  account_id: string;
  name: string;
  base_url: string;
  google_analytics?: string;
}

export class UserPage extends Component<Props> {
  public render(): Rendered {
    return (
      <div style={{ margin: "30px" }}>
        <BasePage
          base_url={this.props.base_url}
          google_analytics={this.props.google_analytics}
          notranslate={true}
        >
          <CoCalcLink base_url={this.props.base_url} viewer='embed'/>
          <div style={{ fontSize: "26px", fontWeight: 600 }}>
            {this.props.name}
          </div>
          More information about what {this.props.name} has shared on CoCalc is coming soon...
        </BasePage>
      </div>
    );
  }
}
