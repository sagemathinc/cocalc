import { React, Component, Rendered } from "../../app-framework";

interface Props {
  id : string;
}

export class HiddenOutputCell extends Component<Props, {}> {
  render(): Rendered {
    return <div>hidden</div>;
  }
}
