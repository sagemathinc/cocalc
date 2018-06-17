import { React, Component, Rendered } from "../generic/react";
import {Map} from "immutable";

interface Props {
  output: Map<string,Map<string,any>>;
}

export class OutputCell extends Component<Props, {}> {
  render(): Rendered {
    return <code>{JSON.stringify(this.props.output.toJS())}</code>;
  }
}
