import { React, Component, Rendered } from "../../app-framework";
import { TimeTravelActions } from "./actions";

interface Props {
  actions: TimeTravelActions;
  id: string;
  desc: Map<string, any>;
  is_current: boolean;
  font_size: number;
}

export class TimeTravel extends Component<Props, {}> {
  render(): Rendered {
    return <div>TimeTravel</div>;
  }
}
