import React from "react";
import register from "./register";
import { Widget } from "../widget";

register(
  "application/vnd.jupyter.widget-view+json",
  2,
  ({ value, actions, name }) => {
    if (name == null) {
      // No redux store, so no way to know anything about the state
      // of the widget, so don't even try to render it.
      return null;
    }
    // name provides the redux state of the widget, which is
    // needed in our code to display or use the widget.
    return <Widget value={value} actions={actions} name={name} />;
  }
);
