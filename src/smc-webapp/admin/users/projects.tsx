import {
  React,
  Component,
  Rendered
} from "smc-webapp/app-framework";

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
