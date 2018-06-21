import { React, Component, Rendered } from "../generic/react";

interface Props {
  id : string;
}

export class HiddenOutputCell extends Component<Props, {}> {
  render(): Rendered {
    return <div>hidden</div>;
  }
}
