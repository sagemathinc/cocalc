/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Some buttons
*/

import { React, Rendered } from "../app-framework";
import { TimeActions } from "./actions";
type TimeActions = InstanceType<typeof TimeActions>;

import { Button } from "antd";
import { Space } from "../r_misc/space";

export function ButtonBar({ actions }: { actions: TimeActions }): JSX.Element {
  return (
    <div style={{ margin: "1px" }}>
      {time_travel_button(actions)}
      <Space />
      {undo_redo_group(actions)}
    </div>
  );
}

function time_travel_button(actions: TimeActions): Rendered {
  return (
    <Button
      key={"time-travel"}
      onClick={() => actions.time_travel()}
      icon={"history"}
    >
      TimeTravel
    </Button>
  );
}

function undo_redo_group(actions: TimeActions): Rendered {
  return (
    <Button.Group key={"undo-group"}>
      <Button
        key={"undo"}
        title={"Undo last thing you did"}
        onClick={() => actions.undo()}
        icon={"undo"}
      >
        Undo
      </Button>
      <Button
        key={"redo"}
        title={"Redo last thing you did"}
        onClick={() => actions.redo()}
        icon={"redo"}
      >
        Redo
      </Button>
    </Button.Group>
  );
}
