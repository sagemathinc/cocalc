/*
Renders a page that describes a user and links to some
of the things they've publicly shared.
*/

import { Component, Rendered, React } from "../app-framework";

import { BasePage } from "./base-page";

interface Props {
  account_id: string;
  base_url: string;
  google_analytics?: string;
}

export class UserPage extends Component<Props> {
  public render(): Rendered {
    return (
      <BasePage
        base_url={this.props.base_url}
        google_analytics={this.props.google_analytics}
        notranslate={true}
      >
        User {this.props.account_id}
      </BasePage>
    );
  }
}
