/*
TimeTravel Editor Actions
*/

import { FrameTree } from "../frame-tree/types";
import { Actions } from "../code-editor/actions";

interface TimeTravelState {}

export class TimeTravelActions extends Actions<TimeTravelState> {
  // No need to open syncstring for normal path...
  protected doctype: string = "none";

  _raw_default_frame_tree(): FrameTree {
    return { type: "time_travel" };
  }

}
