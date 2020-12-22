/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
The TimeTravel editor -- this is a whole frame tree devoted to exploring
the history of a file.

Components in this directory may also be used to provide a frame in other editors with
TimeTravel for them.
*/

import { createEditor } from "../frame-tree/editor";
import { TimeTravel } from "./time-travel";
import { set } from "smc-util/misc";

export const time_travel = {
  short: "TimeTravel",
  name: "TimeTravel",
  icon: "user-clock",
  component: TimeTravel,
  buttons: set(["decrease_font_size", "increase_font_size", "help", "-file"]),
  hide_file_menu: true,
  hide_public: true,
};

const EDITOR_SPEC = {
  time_travel,
};

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "TimeTravel",
});
