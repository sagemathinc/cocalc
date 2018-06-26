import { React, Component, Rendered } from "../generic/react";

interface Props {
  id: string;
  actions: any;
}

export class HiddenInputCell extends Component<Props, {}> {
  render(): Rendered {
    return <div>hidden</div>;
  }
}
