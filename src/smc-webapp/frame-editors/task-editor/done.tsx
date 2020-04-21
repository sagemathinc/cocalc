/*
Checkbox for toggling done status
*/

import { React, Component, Rendered } from "../../app-framework";
import { Icon } from "../../r_misc";
import { TaskActions } from "./types";

interface Props {
  actions: TaskActions;
  done: boolean;
  read_only: boolean;
  task_id: string;
}

export class DoneCheckbox extends Component<Props> {
  shouldComponentUpdate(next) {
    return (
      this.props.done !== next.done ||
      this.props.task_id !== next.task_id ||
      this.props.read_only !== next.read_only
    );
  }

  private render_checkbox(): Rendered {
    return <Icon name={this.props.done ? "check-square-o" : "square-o"} />;
  }

  private toggle_done(): void {
    if (this.props.done) {
      this.props.actions.set_task_not_done(this.props.task_id);
    } else {
      this.props.actions.set_task_done(this.props.task_id);
    }
  }

  public render(): Rendered {
    return (
      <div
        onClick={
          !this.props.read_only ? this.toggle_done.bind(this) : undefined
        }
        style={{
          fontSize: "17pt",
          color: "#888",
          width: "40px",
          padding: "0 10px",
        }}
      >
        {this.render_checkbox()}
      </div>
    );
  }
}
