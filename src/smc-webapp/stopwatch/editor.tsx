/*
Time

Right now this is the simplest possible imaginable stopwatch, with state synchronized properly.

This is also probably a good relatiely simple example of a React-based SMC editor that
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

import { Button } from "react-bootstrap";
import { Icon } from "../r_misc/icon";
import { Loading } from "../r_misc/loading";
import { Component, React, Rendered, rclass, rtypes } from "../app-framework";

import { Stopwatch } from "./stopwatch";
import { ButtonBar } from "./button-bar";
import { TimeActions, StopwatchEditorState } from "./actions";

interface Props extends StopwatchEditorState {
  actions: InstanceType<typeof TimeActions>;
}

class EditorTime extends Component<Props> {
  static reduxProps({ name }) {
    return {
      [name]: {
        timers: rtypes.immutable.List,
        error: rtypes.string
      }
    };
  }

  private render_stopwatches(): Rendered[] {
    if (this.props.timers === undefined) {
      return [];
    }
    const v: Rendered[] = [];
    this.props.timers
      .sortBy(x => x.get("id"))
      .map(data => {
        v.push(
          <Stopwatch
            key={data.get("id")}
            label={data.get("label")}
            total={data.get("total")}
            state={data.get("state")}
            time={data.get("time")}
            click_button={button => this.click_button(data.get("id"), button)}
            set_label={label => this.set_label(data.get("id"), label)}
          />
        );
      });
    return v;
  }

  private click_button(id: number, button: string): void {
    switch (button) {
      case "reset":
        this.props.actions.reset_stopwatch(id);
        return;
      case "start":
        this.props.actions.start_stopwatch(id);
        return;
      case "pause":
        this.props.actions.pause_stopwatch(id);
        return;
      case "delete":
        this.props.actions.delete_stopwatch(id);
        return;
      default:
        console.warn(`unknown button '${button}'`);
        return;
    }
  }

  private set_label(id: number, label: string): void {
    this.props.actions.set_label(id, label);
  }

  private render_button_bar(): Rendered {
    return <ButtonBar actions={this.props.actions} />;
  }

  // TODO
  private render_error(): Rendered {
    return <div>Todo. There is an error</div>;
  }

  private render_add_stopwatch(): Rendered {
    return (
      <Button
        style={{ maxWidth: "200px", margin: "15px" }}
        key={"add-stopwatch"}
        onClick={() => this.props.actions.add_stopwatch()}
      >
        <Icon name="plus-circle" /> New Stopwatch
      </Button>
    );
  }

  public render(): Rendered {
    if (this.props.error !== undefined) {
      return this.render_error();
    } else if (this.props.timers !== undefined && this.props.timers.size > 0) {
      return (
        <div className="smc-vfill">
          {this.render_button_bar()}
          <div className="smc-vfill" style={{ overflowY: "auto" }}>
            {this.render_stopwatches()}
            {this.render_add_stopwatch()}
          </div>
        </div>
      );
    } else {
      return <Loading />;
    }
  }
}

const EditorTime0 = rclass(EditorTime);
export { EditorTime0 as EditorTime };
