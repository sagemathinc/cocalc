/*
Spec for TimeTravel view
*/

import { set } from "smc-util/misc2";

import { createEditor } from "../frame-tree/editor";

import { TimeTravel } from "./time-travel";

let buttons = set([
  "download",
  "decrease_font_size",
  "increase_font_size"
]);

export const EDITOR_SPEC = {
  time_travel: {
    short: "TimeTravel",
    name: "TimeTravel",
    icon: "history",
    component: TimeTravel,
    buttons: buttons
  }
};

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "TimeTravel"
});
