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

import { Component, React, Rendered, rclass, rtypes } from "../smc-react";
let { Loading } = require("../r_misc");

import { Stopwatch } from "./stopwatch";
import { ButtonBar } from "./button-bar";
import { TimeActions, StopwatchEditorState } from "./actions";

interface props extends StopwatchEditorState {
  actions: InstanceType<typeof TimeActions>;
}

class EditorTime extends Component<props> {
  static reduxProps({ name }) {
    return {
      [name]: {
        timers: rtypes.immutable.List,
        error: rtypes.string
      }
    };
  }

  render_stopwatches() {
    if (this.props.timers === undefined) {
      return;
    }
    const v: Rendered[] = [];
    this.props.timers.map(data => {
      v.push(
        <Stopwatch
          key={data.get("id")}
          label={data.get("label")}
          total={data.get("total")}
          state={data.get("state")}
          time={data.get("time")}
          click_button={button => this.click_button(data.get("id"), button)}
        />
      );
    });
    return v;
  }

  click_button(id, button) {
    switch (button) {
      case "stopped":
        return this.props.actions.stop_stopwatch(id);
      case "start":
        return this.props.actions.start_stopwatch(id);
      case "pause":
        return this.props.actions.pause_stopwatch(id);
      default:
        return console.warn(`unknown button '${button}'`);
    }
  }

  render_button_bar() {
    return <ButtonBar actions={this.props.actions} />;
  }

  // TODO
  render_error() {
    return <div>Todo. There is an error</div>;
  }

  render() {
    if (this.props.error !== undefined) {
      return this.render_error();
    } else if (this.props.timers !== undefined && this.props.timers.size > 0) {
      return (
        <div>
          {this.render_button_bar()}
          <div>{this.render_stopwatches()}</div>
        </div>
      );
    } else {
      return <Loading />;
    }
  }
}
const EditorTime0 = rclass(EditorTime);
export { EditorTime0 as EditorTime };
