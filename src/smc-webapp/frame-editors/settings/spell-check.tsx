import { React, Rendered, Component } from "../generic/react";

import { is_different } from "../generic/misc";

interface Props {
  value : string;
  set : Function;
}

export class SpellCheck extends Component<Props, {}> {
  shouldComponentUpdate(props): boolean {
    return is_different(this.props, props, ["value"]);
  }

  render(): Rendered {
    return (
      <div>Spell check settings {this.props.value}</div>
    );
  }
}
