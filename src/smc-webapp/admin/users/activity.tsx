import {
  React,
  Component,
  Rendered
} from "smc-webapp/frame-editors/generic/react";

interface Props {
  account_id: string;
}

interface State {
  activity?: any;
}

export class Activity extends Component<Props, State> {
  render(): Rendered {
    return <div>Recent Activity</div>;
  }
}
