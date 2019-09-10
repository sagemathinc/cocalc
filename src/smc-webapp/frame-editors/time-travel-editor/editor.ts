/*
The TimeTravel editor -- this is a whole frame tree devoted to exploring
the history of a file.

Components in this directory may also be used to provide a frame in other editors with
TimeTravel for them.
*/

import { createEditor } from "../frame-tree/editor";
import { TimeTravel } from "./time-travel";
import { set } from "smc-util/misc2";

export const time_travel = {
  short: "TimeTravel",
  name: "TimeTravel",
  icon: "user-clock",
  component: TimeTravel,
  buttons: set([
    "decrease_font_size",
    "increase_font_size",
    "find",
    "paste",
    "copy",
    "help"
  ])
};

const EDITOR_SPEC = {
  time_travel
};

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "TimeTravel"
});
