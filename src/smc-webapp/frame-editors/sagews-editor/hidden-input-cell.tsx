import { React, Component, Rendered } from "../../app-framework";

interface Props {
  id: string;
  actions: any;
}

export class HiddenInputCell extends Component<Props, {}> {
  render(): Rendered {
    return <div>hidden</div>;
  }
}
