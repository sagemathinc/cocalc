import {
  React,
  Component,
  Rendered
} from "smc-webapp/frame-editors/generic/react";

interface Props {
  account_id: string;
}

interface State {
  projects?: any;
}

export class Projects extends Component<Props, State> {
  render(): Rendered {
    return <div>Projects</div>;
  }
}
