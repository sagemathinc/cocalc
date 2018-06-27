<<<<<<< HEAD
import {
  React,
  Component,
  Rendered
} from "smc-webapp/app-framework";
=======
import { React, Component, Rendered } from "smc-webapp/app-framework";
>>>>>>> master

interface Props {
  account_id: string;
}

interface State {
  subscriptions?: any;
}

export class Subscriptions extends Component<Props, State> {
  render(): Rendered {
    return <div>Subscriptions</div>;
  }
}
