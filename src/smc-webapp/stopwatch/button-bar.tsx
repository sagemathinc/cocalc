/*
Some buttons
*/

import { React } from "../smc-react";
import { TimeActions } from "./actions";
type TimeActions = InstanceType<typeof TimeActions>;

let { Button, ButtonGroup } = require("react-bootstrap");
let { Icon, Space } = require("../r_misc");

export function ButtonBar({
  actions
}: {
  actions: TimeActions;
}): JSX.Element {
  return (
    <div style={{ margin: "1px" }}>
      {time_travel_button(actions)}
      <Space />
      {undo_redo_group(actions)}
    </div>
  );
};

function time_travel_button(actions: TimeActions): JSX.Element {
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

function undo_redo_group(actions: TimeActions): JSX.Element {
  return (
    <ButtonGroup key={"undo-group"}>
      <Button
        key={"undo"}
        title={"Undo last thing you did"}
        onClick={actions.undo}
      >
        <Icon name="undo" /> Undo
      </Button>
      <Button
        key={"redo"}
        title={"Redo last thing you did"}
        onClick={actions.redo}
      >
        <Icon name="repeat" /> Redo
      </Button>
    </ButtonGroup>
  );
}
