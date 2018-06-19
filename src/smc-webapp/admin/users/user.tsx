/*
Display of basic information about a user, with link to get more information about that user.
*/


import {
  React,
  Component,
  Rendered
} from "smc-webapp/frame-editors/generic/react";

import { User } from "smc-webapp/frame-editors/generic/client";

export class UserResult extends Component<User,{}> {
  render() : Rendered {
    return <div>{this.props.first_name} {this.props.last_name} {this.props.email_address}</div>
  }
}
