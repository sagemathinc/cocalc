/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
The TimeTravel editor -- this is a whole frame tree devoted to exploring
the history of a file.

Components in this directory may also be used to provide a frame in other editors with
TimeTravel for them.
*/

import { labels } from "@cocalc/frontend/i18n";
import { AsyncComponent } from "@cocalc/frontend/misc/async-component";
import { set } from "@cocalc/util/misc";
import { createEditor } from "../frame-tree/editor";
import { EditorDescription } from "../frame-tree/types";

const TimeTravel = AsyncComponent(
  async () => (await import("./time-travel")).TimeTravel,
);

export const time_travel: EditorDescription = {
  type: "timetravel",
  short: labels.timetravel,
  name: labels.timetravel,
  icon: "history",
  component: TimeTravel,
  commands: set([
    "decrease_font_size",
    "increase_font_size",
    "set_zoom",
    "help",
    "-file",
    "copy",
  ]),
  hide_file_menu: true,
  hide_public: true,
} as const;

const EDITOR_SPEC = {
  time_travel,
} as const;

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "TimeTravel",
});
