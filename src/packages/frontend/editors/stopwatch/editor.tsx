/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Time

Right now this is the simplest possible imaginable stopwatch, with state synchronized properly.

This is also probably a good relatiely simple example of a React-based editor that
uses persistent shared state.

Later, maybe:

 - Make the editor title tab display the current time
 - Make TimeTravel rendering work (so easy undo in case accidentally hit stop)
 - Labels/description, which is full markdown, hence can have links
 - Ability to set a specific time
 - Initialize this will just be a simple stopwatch, synchronized between viewers.
 - Maybe a bunch of stopwatches and countdown timers, with labels, markdown links, etc.;  draggable.
 - Later yet, it may hook into what other activities are going on in a project, to auto stop/start, etc.
 - Time tracking
*/

import { Button } from "antd";
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
    if (timers === undefined) {
      return [];
    }
    const v: ReactNode[] = [];
    timers
      .sortBy((x) => x.get("id"))
      .map((data) => {
        v.push(
          <Stopwatch
            key={data.get("id")}
            label={data.get("label")}
            total={data.get("total")}
            state={data.get("state")}
            time={data.get("time")}
            clickButton={(button) => clickButton(data.get("id"), button)}
            setLabel={(label) => setLabel(data.get("id"), label)}
          />
        );
      });
    return v;
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

  // TODO
  function renderError(): ReactNode {
    return <div>Todo. There is an error</div>;
  }

  function renderAddStopwatch(): ReactNode {
    return (
      <Button
        icon={<PlusCircleTwoTone />}
        style={{ maxWidth: "200px", margin: "15px" }}
        key={"add-stopwatch"}
        onClick={() => actions.addStopwatch()}
      >
        New Stopwatch
      </Button>
    );
  }

  if (error !== undefined) {
    return renderError();
  } else if (timers !== undefined && timers.size > 0) {
    return (
      <div className="smc-vfill">
        {renderButtonBar()}
        <div className="smc-vfill" style={{ overflowY: "auto" }}>
          {renderStopwatches()}
          {renderAddStopwatch()}
        </div>
      </div>
    );
  } else {
    return <Loading />;
  }
}
