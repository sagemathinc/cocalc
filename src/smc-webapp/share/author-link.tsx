import { Rendered, React, Component } from "../app-framework";

interface Props {
  name: string;
  account_id: string;
}

export class AuthorLink extends Component<Props> {
  public render(): Rendered {
    const url = `/share/users/${this.props.account_id}`;
    return (
      <a style={{ cursor: "pointer" }} href={url}>
        {this.props.name}
      </a>
    );
  }
}
