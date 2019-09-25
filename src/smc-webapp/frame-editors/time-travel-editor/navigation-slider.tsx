import { Component, React, Rendered } from "../../app-framework";

import { TimeTravelActions } from "./actions";

interface Props {
  id: string;
  actions: TimeTravelActions;

  version?: number;
  max: number;
}

export class NavigationSlider extends Component<Props> {
  private handle_change(event: any): void {
    this.props.actions.set_version(this.props.id, parseInt(event.target.value));
  }

  public render(): Rendered {
    const { version, max } = this.props;
    if (version == null) return <div />;
    return (
      <input
        style={{cursor:'pointer'}}
        type="range"
        min={0}
        max={max}
        value={version}
        onChange={this.handle_change.bind(this)}
      />
    );
  }
}
