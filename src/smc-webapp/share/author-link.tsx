/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Rendered, React, Component } from "../app-framework";

interface Props {
  base_path: string;
  name: string;
  account_id: string;
}

export class AuthorLink extends Component<Props> {
  public render(): Rendered {
    const url = `${this.props.base_path}/share/users/${this.props.account_id}`;
    return (
      <a style={{ cursor: "pointer" }} href={url}>
        {this.props.name}
      </a>
    );
  }
}
