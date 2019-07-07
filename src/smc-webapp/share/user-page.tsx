/*
Renders a page that describes a user and links to some
of the things they've publicly shared.
*/

import { Component, Rendered, React } from "../app-framework";

interface Props {
  account_id: string;
}

export class UserPage extends Component<Props> {
  public render(): Rendered {
    return <div>{this.props.account_id}</div>;
  }
}
