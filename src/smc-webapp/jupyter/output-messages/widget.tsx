/*
Widget rendering.
*/

import { React, Component, Rendered } from "smc-webapp/app-framework";
import { Map } from "immutable";

interface WidgetProps {
  value: Map<string, any>;
}

export class Widget extends Component<WidgetProps> {
  shouldComponentUpdate(nextProps: WidgetProps): boolean {
    return !this.props.value.equals(nextProps.value);
  }

  render(): Rendered {
    return (
      <div id={this.props.value.get("model_id")}>
        Widget with model_id {this.props.value.get("model_id")}
      </div>
    );
  }
}
