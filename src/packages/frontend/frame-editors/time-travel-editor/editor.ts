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

import { AsyncComponent } from "@cocalc/frontend/misc/async-component";
import { createEditor } from "../frame-tree/editor";
import { EditorSpec } from "../frame-tree/types";

const TimeTravel = AsyncComponent(
  async () => (await import("./time-travel")).TimeTravel,
);

import { set } from "@cocalc/util/misc";

export const time_travel = {
  short: "TimeTravel",
  name: "TimeTravel",
  icon: "history",
  component: TimeTravel,
  buttons: set([
    "decrease_font_size",
    "increase_font_size",
    "set_zoom",
    "help",
    "-file",
    "copy",
  ]),
  hide_file_menu: true,
  hhide_public: true,
};

const EDITOR_SPEC: EditorSpec = {
  time_travel,
} as const;

export const Editor = createEditor({
  editor_spec: EDITOR_SPEC,
  display_name: "TimeTravel",
});
