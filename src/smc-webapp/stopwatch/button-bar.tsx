/*
Some buttons
*/

import { React, Rendered } from "../app-framework";
import { TimeActions } from "./actions";
type TimeActions = InstanceType<typeof TimeActions>;

import { Button, ButtonGroup } from "react-bootstrap";
import { Icon } from "../r_misc/icon";
import { Space } from "../r_misc/space";

export function ButtonBar({ actions }: { actions: TimeActions }): JSX.Element {
  return (
    <div style={{ margin: "1px" }}>
      <ButtonGroup key={"actions"}>{time_travel_button(actions)}</ButtonGroup>
      <Space />
      {undo_redo_group(actions)}
    </div>
  );
}

function time_travel_button(actions: TimeActions): Rendered {
  return (
    <Button
      key={"time-travel"}
      bsStyle={"info"}
      onClick={() => actions.time_travel()}
    >
      <Icon name="history" /> TimeTravel
    </Button>
  );
}

function undo_redo_group(actions: TimeActions): Rendered {
  return (
    <ButtonGroup key={"undo-group"}>
      <Button
        key={"undo"}
        title={"Undo last thing you did"}
        onClick={() => actions.undo()}
      >
        <Icon name="undo" /> Undo
      </Button>
      <Button
        key={"redo"}
        title={"Redo last thing you did"}
        onClick={() => actions.redo()}
      >
        <Icon name="repeat" /> Redo
      </Button>
    </ButtonGroup>
  );
}
