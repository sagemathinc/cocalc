/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Time

Right now this is the simplest possible imaginable stopwatch, with state synchronized properly.

This is also probably a good relatively simple example of a React-based editor that
uses persistent shared state.

Later, maybe:

 - [ ] Make the editor title tab display the current time
 - [ ] Make TimeTravel rendering work (so easy undo in case accidentally hit stop)
 - [x] Labels/description, which is full markdown, hence can have links
 - [ ] Ability to set a specific time
 - [ ] Initialize this will just be a simple stopwatch, synchronized between viewers.
 - [ ] Maybe a bunch of stopwatches and countdown timers, with labels, markdown links, etc.;  draggable.
 - [ ] Later yet, it may hook into what other activities are going on in a project, to auto stop/start, etc.
 - [ ] Time tracking
*/

import { Alert, Button } from "antd";
import { PlusCircleTwoTone } from "@ant-design/icons";
import { Loading } from "@cocalc/frontend/components/loading";
import { ReactNode } from "react";
import Stopwatch from "./stopwatch";
import { ButtonBar } from "./button-bar";
import type { TimeActions } from "./actions";
import { List } from "immutable";
import { useRedux } from "@cocalc/frontend/app-framework";
import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";

export default function EditorTime() {
  // TODO: sort of abusive...
  const { project_id, path, actions } = useFrameContext() as unknown as {
    project_id: string;
    path: string;
    actions: TimeActions;
  };
  const timers: List<any> | undefined = useRedux(["timers"], project_id, path);
  const error: string | undefined = useRedux(["error"], project_id, path);

  function renderStopwatches(): ReactNode[] {
    if (timers == null) {
      return [];
    }
    return timers
      .sortBy((x) => x.get("id"))
      .toJS()
      .map((data) => (
        <Stopwatch
          key={data.id}
          label={data.label}
          total={data.total}
          state={data.state}
          time={data.time}
          countdown={data.countdown}
          clickButton={(button) => clickButton(data.id, button)}
          setLabel={(label) => setLabel(data.id, label)}
          setCountdown={
            data.countdown != null
              ? (countdown) => {
                  actions.setCountdown(data.id, countdown);
                }
              : undefined
          }
        />
      ));
  }

  function clickButton(id: number, button: string): void {
    switch (button) {
      case "reset":
        actions.resetStopwatch(id);
        return;
      case "start":
        actions.startStopwatch(id);
        return;
      case "pause":
        actions.pauseStopwatch(id);
        return;
      case "delete":
        actions.deleteStopwatch(id);
        return;
      default:
        console.warn(`unknown button '${button}'`);
        return;
    }
  }

  function setLabel(id: number, label: string): void {
    actions.setLabel(id, label);
  }

  function renderButtonBar(): ReactNode {
    return <ButtonBar actions={actions} />;
  }

  if (timers == null) return <Loading />;
  return (
    <div className="smc-vfill">
      {error && <Alert type="error" message={`Error: ${error}`} />}
      {renderButtonBar()}
      <div className="smc-vfill" style={{ overflowY: "auto" }}>
        {renderStopwatches()}
        <div style={{ display: "flex" }}>
          <Button
            size="large"
            icon={<PlusCircleTwoTone />}
            style={{ maxWidth: "200px", margin: "15px" }}
            key={"add-stopwatch"}
            onClick={() => actions.addStopwatch()}
          >
            New Stopwatch
          </Button>
          <Button
            size="large"
            icon={<PlusCircleTwoTone />}
            style={{ maxWidth: "200px", margin: "15px" }}
            key={"add-timer"}
            onClick={() => actions.addTimer()}
          >
            New Timer
          </Button>
        </div>
      </div>
    </div>
  );
}
