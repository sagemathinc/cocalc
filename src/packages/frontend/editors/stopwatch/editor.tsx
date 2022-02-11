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
import { Stopwatch } from "./stopwatch";
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

  function render_stopwatches(): ReactNode[] {
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
            click_button={(button) => click_button(data.get("id"), button)}
            set_label={(label) => set_label(data.get("id"), label)}
          />
        );
      });
    return v;
  }

  function click_button(id: number, button: string): void {
    switch (button) {
      case "reset":
        actions.reset_stopwatch(id);
        return;
      case "start":
        actions.start_stopwatch(id);
        return;
      case "pause":
        actions.pause_stopwatch(id);
        return;
      case "delete":
        actions.delete_stopwatch(id);
        return;
      default:
        console.warn(`unknown button '${button}'`);
        return;
    }
  }

  function set_label(id: number, label: string): void {
    actions.set_label(id, label);
  }

  function render_button_bar(): ReactNode {
    return <ButtonBar actions={actions} />;
  }

  // TODO
  function render_error(): ReactNode {
    return <div>Todo. There is an error</div>;
  }

  function render_add_stopwatch(): ReactNode {
    return (
      <Button
        icon={<PlusCircleTwoTone />}
        style={{ maxWidth: "200px", margin: "15px" }}
        key={"add-stopwatch"}
        onClick={() => actions.add_stopwatch()}
      >
        New Stopwatch
      </Button>
    );
  }

  if (error !== undefined) {
    return render_error();
  } else if (timers !== undefined && timers.size > 0) {
    return (
      <div className="smc-vfill">
        {render_button_bar()}
        <div className="smc-vfill" style={{ overflowY: "auto" }}>
          {render_stopwatches()}
          {render_add_stopwatch()}
        </div>
      </div>
    );
  } else {
    return <Loading />;
  }
}
