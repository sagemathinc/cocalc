/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Rendered, Component, React } from "../../app-framework";

import { Checkbox, Tooltip } from "antd";

import { TimeTravelActions } from "./actions";

interface Props {
  id: string;
  actions: TimeTravelActions;
  disabled: boolean;
  changes_mode: boolean; // whether or not in changes mode.
}

export class ChangesMode extends Component<Props> {
  private toggle(): void {
    this.props.actions.set_changes_mode(
      this.props.id,
      !this.props.changes_mode
    );
  }

  public render(): Rendered {
    return (
      <Tooltip
        placement="top"
        title="Toggle whether or not to show the changes from one point in time to another"
        mouseEnterDelay={1}
      >
        <Checkbox
          disabled={this.props.disabled}
          onChange={this.toggle.bind(this)}
          checked={this.props.disabled ? false : this.props.changes_mode}
        >
          Changes
        </Checkbox>
      </Tooltip>
    );
  }
}
